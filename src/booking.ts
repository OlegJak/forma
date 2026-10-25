import { HttpError, bad } from "./http";
import { addDays, isFuture, now, weekday } from "./time";

export interface Company {
  id: string;
  slug: string;
  name: string;
  category: string;
  city: string;
  description: string;
  address: string;
  opens: number;
  closes: number;
  weekdays: string;
  demo: boolean;
}

const COMPANY_FIELDS = "id,slug,name,category,city,description,address,opens,closes,weekdays,demo";

export async function company(db: D1Database, slug: string): Promise<Company> {
  const c = await db.prepare(`select ${COMPANY_FIELDS} from companies where slug=?`).bind(slug).first<Company>();
  if (!c) throw new HttpError(404, "Компания не найдена");
  return { ...c, demo: !!c.demo };
}

export async function owned(db: D1Database, slug: string, uid: string): Promise<Company> {
  const c = await company(db, slug);
  const own = await db.prepare("select 1 from companies where id=? and owner_id=?").bind(c.id, uid).first();
  if (!own) throw new HttpError(403, "Нет доступа к этой компании");
  return c;
}

export async function services(db: D1Database, companyId: string) {
  const r = await db
    .prepare("select id,name,description,duration,price from services where company_id=? and active=1 order by price,name")
    .bind(companyId)
    .all();
  return r.results;
}

export async function staff(db: D1Database, companyId: string) {
  const r = await db.prepare("select id,name,role from staff where company_id=? and active=1 order by name").bind(companyId).all();
  return r.results;
}

async function service(db: D1Database, companyId: string, id: string) {
  const s = await db
    .prepare("select id,duration,price from services where id=? and company_id=? and active=1")
    .bind(id, companyId)
    .first<{ id: string; duration: number; price: number }>();
  if (!s) throw bad("Выберите доступную услугу");
  return s;
}

async function checkStaff(db: D1Database, companyId: string, id: string) {
  const m = await db.prepare("select 1 from staff where id=? and company_id=? and active=1").bind(id, companyId).first();
  if (!m) throw bad("Выберите доступного специалиста");
}

function checkDate(day: string) {
  const today = now().date;
  if (day < today || day > addDays(today, 60)) throw bad("Выберите дату в ближайшие 60 дней");
}

const working = (c: Company, day: string) => c.weekdays.split(",").includes(String(weekday(day)));

export async function slots(db: D1Database, slug: string, serviceId: string, staffId: string, day: string): Promise<number[]> {
  const c = await company(db, slug);
  checkDate(day);
  const { duration } = await service(db, c.id, serviceId);
  await checkStaff(db, c.id, staffId);
  if (!working(c, day)) return [];
  const taken = (
    await db
      .prepare("select start_minute,duration from bookings where company_id=? and staff_id=? and booking_date=? and status='confirmed'")
      .bind(c.id, staffId, day)
      .all<{ start_minute: number; duration: number }>()
  ).results;
  const result: number[] = [];
  for (let t = c.opens; t + duration <= c.closes; t += 30)
    if (isFuture(day, t) && !taken.some((b) => b.start_minute < t + duration && b.start_minute + b.duration > t)) result.push(t);
  return result;
}

export interface BookRequest {
  service: string;
  staff: string;
  date: string;
  time: number;
  name: string;
  phone: string;
}

const OVERLAP =
  "select 1 from bookings where company_id=?2 and staff_id=?4 and booking_date=?5 and status='confirmed' and start_minute < ?6+?7 and start_minute+duration > ?6";

export async function book(db: D1Database, slug: string, r: BookRequest, uid: string | null) {
  const c = await company(db, slug);
  checkDate(r.date);
  const s = await service(db, c.id, r.service);
  await checkStaff(db, c.id, r.staff);
  const t = r.time;
  if (!working(c, r.date) || t < c.opens || t + s.duration > c.closes || t % 30 !== 0 || !isFuture(r.date, t))
    throw bad("Это время недоступно");
  const id = crypto.randomUUID();
  // D1 runs each statement atomically, so the overlap, staff, service and hours checks
  // happen in the same step as the insert and two parallel requests cannot both succeed.
  const res = await db
    .prepare(
      `insert into bookings(id,company_id,service_id,staff_id,booking_date,start_minute,duration,price,customer_name,phone,user_id)
       select ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11
       where not exists (${OVERLAP})
         and exists (select 1 from staff where id=?4 and company_id=?2 and active=1)
         and exists (select 1 from services where id=?3 and company_id=?2 and active=1 and duration=?7 and price=?8)
         and exists (select 1 from companies where id=?2 and opens<=?6 and closes>=?6+?7
                     and instr(','||weekdays||',', ','||?12||',')>0)`,
    )
    .bind(id, c.id, s.id, r.staff, r.date, t, s.duration, s.price, r.name.trim(), r.phone.trim(), uid, String(weekday(r.date)))
    .run();
  if (res.meta.changes !== 1) {
    const clash = await db.prepare(OVERLAP).bind(null, c.id, null, r.staff, r.date, t, s.duration).first();
    if (clash) throw new HttpError(409, "Это время уже занято. Выберите другое.");
    throw bad("Это время недоступно");
  }
  return { id, date: r.date, time: t, duration: s.duration, price: s.price };
}

export async function appointments(db: D1Database, companyId: string) {
  const r = await db
    .prepare(
      `select b.id,b.booking_date,b.start_minute,b.duration,b.price,b.customer_name,b.phone,b.status,
              s.name as service_name,m.name as staff_name
       from bookings b join services s on s.id=b.service_id join staff m on m.id=b.staff_id
       where b.company_id=? order by b.booking_date,b.start_minute`,
    )
    .bind(companyId)
    .all();
  return r.results;
}

export async function cancel(db: D1Database, slug: string, id: string, uid: string) {
  const c = await owned(db, slug, uid);
  const r = await db
    .prepare("update bookings set status='cancelled' where id=? and company_id=? and status='confirmed'")
    .bind(id, c.id)
    .run();
  if (r.meta.changes !== 1) throw bad("Запись не найдена или уже отменена");
}
