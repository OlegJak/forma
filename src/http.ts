export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const bad = (message: string) => new HttpError(400, message);
export const invalid = () => bad("Проверьте заполненные поля и формат данных.");

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://accounts.google.com",
  "Referrer-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store",
};

export function secure(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json;charset=UTF-8" },
  });
}

export function redirect(location: string, cookies: string[] = []): Response {
  const res = new Response(null, { status: 302, headers: { Location: location } });
  for (const c of cookies) res.headers.append("Set-Cookie", c);
  return res;
}

export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("Cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function cookie(req: Request, name: string, value: string, maxAge: number, path = "/"): string {
  const secureFlag = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secureFlag}`;
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const data = await req.json();
    if (data && typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
  } catch {}
  throw invalid();
}

export function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function sameToken(a: string | null, b: string | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  const x = new TextEncoder().encode(a),
    y = new TextEncoder().encode(b);
  return crypto.subtle.timingSafeEqual(x, y);
}
