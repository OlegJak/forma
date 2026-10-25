import { Env, checkCsrf, csrfToken, currentUser, finishGoogle, googleEnabled, logout, requireUser, startGoogle } from "./auth";
import * as b from "./booking";
import { HttpError, bad, body, json, secure } from "./http";
import { addDays, isDate, now } from "./time";
import * as v from "./validate";

const RATE_WINDOW = 10 * 60 * 1000;
const RATE_LIMIT = 30;

async function limitBookings(req: Request, env: Env) {
  const key = "book:" + (req.headers.get("CF-Connecting-IP") || "local");
  const at = Date.now();
  // SQLite evaluates every SET expression against the old row, so both CASEs see the same window_start.
  const row = await env.DB.prepare(
    `insert into rate_limits(key,window_start,count) values(?1,?2,1)
     on conflict(key) do update set
       count = case when ?2-window_start > ?3 then 1 else count+1 end,
       window_start = case when ?2-window_start > ?3 then ?2 else window_start end
     returning count`,
  )
    .bind(key, at, RATE_WINDOW)
    .first<{ count: number }>();
  if (row && row.count > RATE_LIMIT) throw new HttpError(429, "Слишком много попыток записи. Попробуйте через 10 минут.");
}

function demoDashboard() {
  const date = addDays(now().date, 1);
  const row = (id: string, start: number, client: string, service: string, master: string, price: number) => ({
    id,
    booking_date: date,
    start_minute: start,
    customer_name: client,
    phone: "Скрыт в деморежиме",
    service_name: service,
    staff_name: master,
    price,
    status: "confirmed",
  });
  return [
    row("demo-1", 600, "Демо-клиент 01", "Стрижка и укладка", "Анна", 4500),
    row("demo-2", 720, "Демо-клиент 02", "Оформление бороды", "Марк", 2500),
  ];
}

function checkHours(r: { opens: number; closes: number }) {
  if (r.opens % 30 || r.closes % 30 || r.closes <= r.opens) throw bad("Проверьте часы работы");
}

async function api(req: Request, env: Env, parts: string[]): Promise<Response> {
  const db = env.DB;
  const method = req.method;
  const unsafe = !["GET", "HEAD"].includes(method);
  if (unsafe) checkCsrf(req);
  const [a, p1, p2, p3, p4] = parts;
  const n = parts.length;
  const uid = async () => (await requireUser(req, env)).id;

  if (a === "session" && n === 1 && method === "GET") {
    const csrf = csrfToken(req);
    const user = await currentUser(req, env);
    const res = json({
      csrf: csrf.token,
      googleEnabled: googleEnabled(env),
      loggedIn: !!user,
      ...(user ? { name: user.name } : {}),
    });
    if (csrf.setCookie) res.headers.append("Set-Cookie", csrf.setCookie);
    return res;
  }
  if (a === "logout" && n === 1 && method === "POST") return logout(req, env);

  if (a === "companies") {
    if (n === 1 && method === "GET") {
      const r = await db
        .prepare(
          `select c.id,c.slug,c.name,c.category,c.city,c.description,c.demo,
                  (select min(s.price) from services s where s.company_id=c.id and s.active=1) as min_price
           from companies c order by c.created_at,c.name`,
        )
        .all<Record<string, unknown>>();
      return json(r.results.map((c) => ({ ...c, demo: !!c.demo })));
    }
    if (n === 2 && method === "GET") {
      const c = await b.company(db, p1);
      return json({ ...c, services: await b.services(db, c.id), staff: await b.staff(db, c.id) });
    }
    if (n === 3 && p2 === "slots" && method === "GET") {
      const q = new URL(req.url).searchParams;
      const service = q.get("service"),
        staff = q.get("staff"),
        date = q.get("date");
      if (!service || !staff || !isDate(date)) throw bad("Проверьте заполненные поля и формат данных.");
      return json(await b.slots(db, p1, service, staff, date));
    }
    if (n === 3 && p2 === "bookings" && method === "POST") {
      await limitBookings(req, env);
      const r = v.bookRequest(await body(req));
      const user = await currentUser(req, env);
      return json(await b.book(db, p1, r, user?.id ?? null));
    }
  }

  if (a === "manage") {
    if (p1 === "companies" && n === 2) {
      if (method === "GET") {
        const r = await db.prepare("select slug,name from companies where owner_id=? order by created_at").bind(await uid()).all();
        return json(r.results);
      }
      if (method === "POST") {
        const r = v.companyRequest(await body(req));
        checkHours(r);
        const owner = await uid();
        const count = await db.prepare("select count(*) as n from companies where owner_id=?").bind(owner).first<number>("n");
        if ((count ?? 0) >= 10) throw bad("Можно создать до 10 компаний");
        if (await db.prepare("select 1 from companies where slug=?").bind(r.slug).first())
          throw new HttpError(409, "Этот адрес уже занят");
        await db
          .prepare(
            "insert into companies(id,owner_id,slug,name,category,city,description,address,opens,closes,weekdays) values(?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(crypto.randomUUID(), owner, r.slug, r.name.trim(), r.category, r.city.trim(), r.description.trim(), r.address.trim(), r.opens, r.closes, r.weekdays)
          .run();
        return json({ slug: r.slug });
      }
    }
    if (n === 2 && method === "GET") {
      const c = await b.owned(db, p1, await uid());
      return json({
        ...c,
        services: await b.services(db, c.id),
        staff: await b.staff(db, c.id),
        bookings: await b.appointments(db, c.id),
      });
    }
    if (n === 2 && method === "PUT") {
      const r = v.companyRequest(await body(req));
      checkHours(r);
      const c = await b.owned(db, p1, await uid());
      if (p1 !== r.slug) throw bad("Адрес страницы нельзя менять");
      await db
        .prepare("update companies set name=?,category=?,city=?,description=?,address=?,opens=?,closes=?,weekdays=? where id=?")
        .bind(r.name.trim(), r.category, r.city.trim(), r.description.trim(), r.address.trim(), r.opens, r.closes, r.weekdays, c.id)
        .run();
      return json({ slug: p1 });
    }
    if (n === 3 && p2 === "services" && method === "POST") {
      const owner = await uid();
      const r = v.serviceRequest(await body(req));
      const c = await b.owned(db, p1, owner);
      if (r.duration % 30) throw bad("Длительность должна быть кратна 30 минутам");
      const id = crypto.randomUUID();
      await db
        .prepare("insert into services(id,company_id,name,description,duration,price) values(?,?,?,?,?,?)")
        .bind(id, c.id, r.name.trim(), r.description, r.duration, r.price)
        .run();
      return json({ id });
    }
    if (n === 3 && p2 === "staff" && method === "POST") {
      const owner = await uid();
      const r = v.staffRequest(await body(req));
      const c = await b.owned(db, p1, owner);
      const id = crypto.randomUUID();
      await db.prepare("insert into staff(id,company_id,name,role) values(?,?,?,?)").bind(id, c.id, r.name.trim(), r.role.trim()).run();
      return json({ id });
    }
    if (n === 4 && method === "DELETE") {
      const c = await b.owned(db, p1, await uid());
      if (p2 !== "staff" && p2 !== "services") throw bad("Неверный тип записи");
      const r = await db.prepare(`update ${p2} set active=0 where id=? and company_id=?`).bind(p3, c.id).run();
      if (r.meta.changes !== 1) throw bad("Не найдено");
      return json({ ok: true });
    }
    if (n === 5 && p2 === "bookings" && p4 === "cancel" && method === "POST") {
      await b.cancel(db, p1, p3, await uid());
      return json({ ok: true });
    }
  }

  if (a === "my-bookings" && n === 1 && method === "GET") {
    const r = await db
      .prepare(
        `select b.id,b.booking_date,b.start_minute,b.status,b.price,c.name as company_name,c.slug,
                s.name as service_name,m.name as staff_name
         from bookings b join companies c on c.id=b.company_id join services s on s.id=b.service_id
         join staff m on m.id=b.staff_id where b.user_id=? order by b.booking_date desc,b.start_minute`,
      )
      .bind(await uid())
      .all();
    return json(r.results);
  }

  if (a === "demo-dashboard" && n === 1 && method === "GET") {
    const c = await b.company(db, "forma");
    return json({ ...c, services: await b.services(db, c.id), staff: await b.staff(db, c.id), bookings: demoDashboard() });
  }

  throw new HttpError(404, "Не найдено");
}

async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === "/oauth2/authorization/google" && req.method === "GET") return startGoogle(req, env);
  if (url.pathname === "/login/oauth2/code/google" && req.method === "GET") return finishGoogle(req, env);
  if (url.pathname.startsWith("/api/")) {
    let parts: string[];
    try {
      parts = url.pathname.slice(5).split("/").map(decodeURIComponent);
    } catch {
      throw bad("Проверьте заполненные поля и формат данных.");
    }
    return api(req, env, parts);
  }
  throw new HttpError(404, "Не найдено");
}

export default {
  async fetch(req, env): Promise<Response> {
    try {
      return secure(await handle(req, env));
    } catch (e) {
      if (e instanceof HttpError) return secure(json({ error: e.message }, e.status));
      if (String(e).includes("UNIQUE constraint failed"))
        return secure(json({ error: "Не удалось сохранить: проверьте уникальность адреса и данные." }, 409));
      console.error(e);
      return secure(json({ error: "Ошибка запроса" }, 500));
    }
  },
  async scheduled(_controller, env) {
    await env.DB.batch([
      env.DB.prepare("delete from sessions where expires_at<?").bind(Date.now()),
      env.DB.prepare("delete from rate_limits where window_start<?").bind(Date.now() - RATE_WINDOW),
    ]);
  },
} satisfies ExportedHandler<Env>;
