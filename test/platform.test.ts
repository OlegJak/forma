import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { sha256 } from "../src/http";
import { addDays, now } from "../src/time";

const ORIGIN = "http://forma.test";
const CSRF = "c".repeat(43);

type Opts = { method?: string; body?: unknown; user?: string; csrf?: boolean; ip?: string; env?: typeof env; cookie?: string };

async function call(path: string, o: Opts = {}) {
  const cookies = [`forma_csrf=${CSRF}`];
  if (o.user) {
    const token = "session-" + o.user;
    await env.DB.prepare("insert or ignore into sessions(id,user_id,name,expires_at) values(?,?,?,?)")
      .bind(await sha256(token), "google:" + o.user, "Test Owner", Date.now() + 3600_000)
      .run();
    cookies.push("forma_session=" + token);
  }
  if (o.cookie) cookies.push(o.cookie);
  const headers: Record<string, string> = { Cookie: cookies.join("; "), "CF-Connecting-IP": o.ip ?? crypto.randomUUID() };
  if (o.body !== undefined) headers["Content-Type"] = "application/json";
  if (o.csrf !== false) headers["X-CSRF-TOKEN"] = CSRF;
  const req = new Request(ORIGIN + path, {
    method: o.method ?? (o.body === undefined ? "GET" : "POST"),
    headers,
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
    redirect: "manual",
  });
  return run(req, o.env ?? env);
}

// The worker only reads the URL, method, headers and body of incoming requests.
const run = (req: Request, e: typeof env = env) => worker.fetch!(req as Parameters<NonNullable<typeof worker.fetch>>[0], e);

const date = () => addDays(now().date, 30);
const booking = (service: string, staff: string, time: number) => ({
  service,
  staff,
  date: date(),
  time,
  name: "Test Client",
  phone: "+372 0000 0000",
});

async function createCompany(sub: string) {
  const slug = "test-" + crypto.randomUUID().slice(0, 8);
  const res = await call("/api/manage/companies", {
    user: sub,
    body: {
      name: "Test company",
      slug,
      category: "Красота",
      city: "Нарва",
      description: "Test description",
      address: "Test address",
      opens: 600,
      closes: 1080,
      weekdays: "1,2,3,4,5,6,7",
    },
  });
  expect(res.status).toBe(200);
  return slug;
}

async function add(slug: string, kind: string, body: unknown, sub: string) {
  const res = await call(`/api/manage/${slug}/${kind}`, { user: sub, body });
  expect(res.status).toBe(200);
  return ((await res.json()) as { id: string }).id;
}

async function companyWithStaff(sub: string, duration = 60) {
  const slug = await createCompany(sub);
  const sid = await add(slug, "services", { name: "Service", description: "Test", duration, price: 4500 }, sub);
  const staff = await add(slug, "staff", { name: "Master", role: "Test" }, sub);
  return { slug, sid, staff };
}

describe("public API", () => {
  it("catalog and demo never expose contacts", async () => {
    const list = (await (await call("/api/companies")).json()) as Record<string, unknown>[];
    expect(list.map((c) => c.name)).toEqual(expect.arrayContaining(["Balance Space", "Detail Garage", "FORMA Studio"]));
    expect(list[0].owner_id).toBeUndefined();
    expect(list[0].phone).toBeUndefined();
    expect(list.find((c) => c.slug === "forma")).toMatchObject({ demo: true, min_price: 2500 });
    const demo = (await (await call("/api/demo-dashboard")).json()) as { bookings: { phone: string }[] };
    expect(demo.bookings[0].phone).toBe("Скрыт в деморежиме");
  });

  it("requires login and CSRF", async () => {
    expect((await call("/api/manage/forma")).status).toBe(401);
    expect((await call("/api/companies/forma/bookings", { body: booking("hair", "anna", 600), csrf: false })).status).toBe(403);
    const session = await call("/api/session", { csrf: false });
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ loggedIn: false, googleEnabled: false, csrf: CSRF });
  });

  it("issues a CSRF cookie to a new visitor", async () => {
    const res = await run(new Request(ORIGIN + "/api/session"), env);
    const { csrf } = (await res.json()) as { csrf: string };
    expect(res.headers.get("Set-Cookie")).toContain("forma_csrf=" + csrf);
    expect(res.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("rejects requests from another origin", async () => {
    const res = await run(
      new Request(ORIGIN + "/api/logout", {
        method: "POST",
        headers: { Origin: "https://evil.example", Cookie: `forma_csrf=${CSRF}`, "X-CSRF-TOKEN": CSRF },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown companies and routes", async () => {
    expect((await call("/api/companies/nope")).status).toBe(404);
    expect((await call("/api/nothing")).status).toBe(404);
  });
});

describe("owners", () => {
  it("cannot read or change another company", async () => {
    const slug = await createCompany("owner-a");
    expect((await call("/api/manage/" + slug, { user: "owner-b" })).status).toBe(403);
    expect((await call(`/api/manage/${slug}/staff`, { user: "owner-b", body: { name: "Test", role: "Test" } })).status).toBe(403);
    expect((await call("/api/manage/companies", { user: "owner-b" })).status).toBe(200);
  });

  it("rejects a taken page address and invalid hours", async () => {
    const slug = await createCompany("slug-owner");
    const base = { name: "X", slug, category: "Авто", city: "Нарва", description: "D", address: "A", opens: 600, closes: 1080, weekdays: "1" };
    expect((await call("/api/manage/companies", { user: "other", body: base })).status).toBe(409);
    expect((await call("/api/manage/companies", { user: "other", body: { ...base, slug: "fresh-slug", closes: 500 } })).status).toBe(400);
    expect((await call("/api/manage/companies", { user: "other", body: { ...base, slug: "Bad Slug" } })).status).toBe(400);
  });

  it("can edit settings but not the page address", async () => {
    const slug = await createCompany("editor");
    const body = { name: "Renamed", slug, category: "Авто", city: "Таллинн", description: "D", address: "A", opens: 540, closes: 1200, weekdays: "1,2" };
    expect((await call("/api/manage/" + slug, { user: "editor", method: "PUT", body })).status).toBe(200);
    expect(await (await call("/api/companies/" + slug)).json()).toMatchObject({ name: "Renamed", opens: 540, weekdays: "1,2" });
    expect((await call("/api/manage/" + slug, { user: "editor", method: "PUT", body: { ...body, slug: "other-slug" } })).status).toBe(400);
  });
});

describe("bookings", () => {
  it("validates tenant, blocks overlaps and frees time on cancel", async () => {
    const { slug, sid, staff } = await companyWithStaff("booking-owner");
    expect((await call(`/api/companies/${slug}/bookings`, { body: booking("hair", staff, 600) })).status).toBe(400);
    const ok = await call(`/api/companies/${slug}/bookings`, { body: booking(sid, staff, 600) });
    expect(ok.status).toBe(200);
    const { id } = (await ok.json()) as { id: string };
    expect((await call(`/api/companies/${slug}/bookings`, { body: booking(sid, staff, 630) })).status).toBe(409);
    expect((await call(`/api/manage/${slug}/bookings/${id}/cancel`, { user: "booking-owner", body: {} })).status).toBe(200);
    expect((await call(`/api/manage/${slug}/bookings/${id}/cancel`, { user: "booking-owner", body: {} })).status).toBe(400);
    expect((await call(`/api/companies/${slug}/bookings`, { body: booking(sid, staff, 630) })).status).toBe(200);
    const dash = (await (await call("/api/manage/" + slug, { user: "booking-owner" })).json()) as { bookings: { status: string; phone: string }[] };
    expect(dash.bookings.map((b) => b.status)).toEqual(["cancelled", "confirmed"]);
    expect(dash.bookings[0].phone).toBe("+372 0000 0000");
  });

  it("manages services, staff and slots", async () => {
    const slug = await createCompany("manager");
    const sid = await add(slug, "services", { name: "Cut", description: "", duration: 30, price: 2000 }, "manager");
    const staff = await add(slug, "staff", { name: "Ann", role: "Stylist" }, "manager");
    const q = (s: string) => `/api/companies/${slug}/slots?service=${sid}&staff=${s}&date=${date()}`;
    const slots = (await (await call(q(staff))).json()) as number[];
    expect(slots[0]).toBe(600);
    expect(slots.at(-1)).toBe(1050);
    expect((await call(`/api/manage/${slug}/staff/${staff}`, { user: "manager", method: "DELETE" })).status).toBe(200);
    expect((await call(q(staff))).status).toBe(400);
    expect((await call(`/api/manage/${slug}/other/${staff}`, { user: "manager", method: "DELETE" })).status).toBe(400);
    expect((await call(`/api/manage/${slug}/services`, { user: "manager", body: { name: "X", description: "", duration: 45, price: 1 } })).status).toBe(400);
  });

  it("removes booked time from slots", async () => {
    const { slug, sid, staff } = await companyWithStaff("slot-owner");
    await call(`/api/companies/${slug}/bookings`, { body: booking(sid, staff, 660) });
    const slots = (await (await call(`/api/companies/${slug}/slots?service=${sid}&staff=${staff}&date=${date()}`)).json()) as number[];
    expect(slots).toContain(600);
    expect(slots).not.toContain(630);
    expect(slots).not.toContain(660);
    expect(slots).toContain(720);
  });

  it("shows only own bookings in the account", async () => {
    expect(await (await call("/api/my-bookings", { user: "unrelated-user" })).json()).toEqual([]);
    const { slug, sid, staff } = await companyWithStaff("mine-owner");
    await call(`/api/companies/${slug}/bookings`, { body: booking(sid, staff, 600), user: "client" });
    const mine = (await (await call("/api/my-bookings", { user: "client" })).json()) as { slug: string }[];
    expect(mine).toHaveLength(1);
    expect(mine[0].slug).toBe(slug);
  });

  it("rejects invalid bookings", async () => {
    expect((await call("/api/companies/forma/bookings", { body: booking("hair", "anna", 601) })).status).toBe(400);
    expect((await call("/api/companies/forma/bookings", { body: { ...booking("hair", "anna", 600), name: "x\nname" } })).status).toBe(400);
    expect((await call("/api/companies/forma/bookings", { body: { ...booking("hair", "anna", 600), phone: "abc" } })).status).toBe(400);
    expect((await call("/api/companies/forma/bookings", { body: { ...booking("hair", "anna", 600), date: addDays(now().date, 61) } })).status).toBe(400);
    expect((await call("/api/companies/forma/bookings", { body: { ...booking("hair", "anna", 1050) } })).status).toBe(400);
  });

  it("cannot double book under concurrent requests", async () => {
    const { slug, sid, staff } = await companyWithStaff("concurrent-owner");
    const results = await Promise.all(
      Array.from({ length: 5 }, () => call(`/api/companies/${slug}/bookings`, { body: { ...booking(sid, staff, 600), name: "Concurrent" } })),
    );
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([200, 409, 409, 409, 409]);
  });

  it("limits booking attempts per address", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 31; i++)
      codes.push((await call("/api/companies/forma/bookings", { body: booking("hair", "anna", 601), ip: "10.0.0.9" })).status);
    expect(codes.slice(0, 30).every((c) => c === 400)).toBe(true);
    expect(codes[30]).toBe(429);
  });
});

describe("Google login", () => {
  const googleEnv = { ...env, GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "test-secret", BASE_URL: "http://localhost:8787" };
  afterEach(() => vi.restoreAllMocks());

  it("uses state, nonce and a fixed callback", async () => {
    const res = await call("/oauth2/authorization/google", { env: googleEnv });
    expect(res.status).toBe(302);
    const location = res.headers.get("Location")!;
    expect(location.startsWith("https://accounts.google.com/o/oauth2/v2/auth?")).toBe(true);
    expect(location).toContain("state=");
    expect(location).toContain("nonce=");
    expect(location).toContain("scope=openid%20profile%20email");
    expect(location).toContain("redirect_uri=" + encodeURIComponent("http://localhost:8787/login/oauth2/code/google"));
    expect(location).not.toContain("test-secret");
    expect(res.headers.get("Set-Cookie")).toContain("forma_oauth=");
  });

  it("rejects a forged callback", async () => {
    const res = await call("/login/oauth2/code/google?code=forged&state=forged", { env: googleEnv });
    expect(res.headers.get("Location")).toBe("/login?error=google");
    expect((await call("/api/manage/companies", { env: googleEnv })).status).toBe(401);
  });

  async function callback(claims: Record<string, unknown>) {
    const start = await call("/oauth2/authorization/google", { env: googleEnv });
    const params = new URL(start.headers.get("Location")!).searchParams;
    const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "");
    const idToken = `${enc({ alg: "RS256" })}.${enc({
      iss: "https://accounts.google.com",
      aud: googleEnv.GOOGLE_CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 300,
      nonce: params.get("nonce"),
      sub: "12345",
      name: "Oleg",
      ...claims,
    })}.sig`;
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ id_token: idToken }));
    const res = await call(`/login/oauth2/code/google?code=abc&state=${params.get("state")}`, {
      env: googleEnv,
      cookie: `forma_oauth=${params.get("state")}.${params.get("nonce")}`,
    });
    return { res, spy };
  }

  it("signs in with a valid Google response", async () => {
    const { res, spy } = await callback({});
    expect(spy).toHaveBeenCalledOnce();
    expect(res.headers.get("Location")).toBe("/dashboard");
    const session = res.headers.getSetCookie().find((c) => c.startsWith("forma_session="))!;
    const token = session.split(";")[0].split("=")[1];
    vi.restoreAllMocks();
    const me = await run(
      new Request(ORIGIN + "/api/session", { headers: { Cookie: "forma_session=" + token } }),
      googleEnv,
    );
    expect(await me.json()).toMatchObject({ loggedIn: true, name: "Oleg", googleEnabled: true });
  });

  it("rejects a token with the wrong nonce or audience", async () => {
    expect((await callback({ nonce: "other" })).res.headers.get("Location")).toBe("/login?error=google");
    expect((await callback({ aud: "someone-else" })).res.headers.get("Location")).toBe("/login?error=google");
  });

  it("logs out", async () => {
    const res = await call("/api/logout", { user: "leaving", method: "POST" });
    expect(res.status).toBe(204);
    expect((await call("/api/manage/companies", { cookie: "forma_session=session-leaving" })).status).toBe(401);
  });
});
