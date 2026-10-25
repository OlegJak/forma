import { HttpError, cookie, readCookie, redirect, randomToken, sameToken, sha256 } from "./http";

export interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  BASE_URL?: string;
}

export interface User {
  id: string;
  name: string;
}

const SESSION = "forma_session";
const CSRF = "forma_csrf";
const OAUTH = "forma_oauth";
const SESSION_SECONDS = 7 * 24 * 3600;
const CALLBACK = "/login/oauth2/code/google";

export const googleEnabled = (env: Env) => !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET;
const baseUrl = (req: Request, env: Env) => (env.BASE_URL || new URL(req.url).origin).replace(/\/$/, "");

export async function currentUser(req: Request, env: Env): Promise<User | null> {
  const token = readCookie(req, SESSION);
  if (!token) return null;
  const row = await env.DB.prepare("select user_id,name from sessions where id=? and expires_at>?")
    .bind(await sha256(token), Date.now())
    .first<{ user_id: string; name: string }>();
  return row ? { id: row.user_id, name: row.name } : null;
}

export async function requireUser(req: Request, env: Env): Promise<User> {
  const user = await currentUser(req, env);
  if (!user) throw new HttpError(401, "Войдите через Google");
  return user;
}

/** Double-submit token: the cookie is HttpOnly, the page reads the value from /api/session. */
export function csrfToken(req: Request): { token: string; setCookie?: string } {
  const existing = readCookie(req, CSRF);
  if (existing && /^[\w-]{43}$/.test(existing)) return { token: existing };
  const token = randomToken();
  return { token, setCookie: cookie(req, CSRF, token, SESSION_SECONDS) };
}

export function checkCsrf(req: Request) {
  const origin = req.headers.get("Origin");
  if (origin && origin !== new URL(req.url).origin) throw new HttpError(403, "Нет доступа или сессия устарела. Обновите страницу.");
  if (!sameToken(req.headers.get("X-CSRF-TOKEN"), readCookie(req, CSRF)))
    throw new HttpError(403, "Нет доступа или сессия устарела. Обновите страницу.");
}

export async function logout(req: Request, env: Env): Promise<Response> {
  const token = readCookie(req, SESSION);
  if (token) await env.DB.prepare("delete from sessions where id=?").bind(await sha256(token)).run();
  const res = new Response(null, { status: 204 });
  res.headers.append("Set-Cookie", cookie(req, SESSION, "", 0));
  return res;
}

export function startGoogle(req: Request, env: Env): Response {
  if (!googleEnabled(env)) return redirect("/login?error=google");
  const state = randomToken(),
    nonce = randomToken();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: baseUrl(req, env) + CALLBACK,
    scope: "openid profile email",
    state,
    nonce,
  });
  return redirect("https://accounts.google.com/o/oauth2/v2/auth?" + params.toString().replace(/\+/g, "%20"), [
    cookie(req, OAUTH, `${state}.${nonce}`, 600, CALLBACK),
  ]);
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1] || "";
  const bin = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

export async function finishGoogle(req: Request, env: Env): Promise<Response> {
  const fail = redirect("/login?error=google", [cookie(req, OAUTH, "", 0, CALLBACK)]);
  if (!googleEnabled(env)) return fail;
  const url = new URL(req.url);
  const [state, nonce] = (readCookie(req, OAUTH) || "").split(".");
  const code = url.searchParams.get("code");
  if (!code || !nonce || !sameToken(url.searchParams.get("state"), state)) return fail;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: baseUrl(req, env) + CALLBACK,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) return fail;
    const { id_token } = await res.json<{ id_token?: string }>();
    if (!id_token) return fail;
    // The token comes straight from Google over TLS, so its claims are checked without verifying the signature.
    const claims = decodeJwtPayload(id_token);
    if (
      !["accounts.google.com", "https://accounts.google.com"].includes(String(claims.iss)) ||
      claims.aud !== env.GOOGLE_CLIENT_ID ||
      typeof claims.exp !== "number" ||
      claims.exp * 1000 < Date.now() ||
      !sameToken(String(claims.nonce ?? ""), nonce) ||
      typeof claims.sub !== "string" ||
      !claims.sub
    )
      return fail;
    const token = randomToken();
    const name = typeof claims.name === "string" && claims.name.trim() ? claims.name.slice(0, 120) : "Пользователь";
    await env.DB.prepare("insert into sessions(id,user_id,name,expires_at) values(?,?,?,?)")
      .bind(await sha256(token), "google:" + claims.sub, name, Date.now() + SESSION_SECONDS * 1000)
      .run();
    return redirect("/dashboard", [
      cookie(req, OAUTH, "", 0, CALLBACK),
      cookie(req, SESSION, token, SESSION_SECONDS),
      cookie(req, CSRF, randomToken(), SESSION_SECONDS),
    ]);
  } catch {
    return fail;
  }
}
