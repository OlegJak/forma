import { invalid } from "./http";
import { isDate } from "./time";

type Body = Record<string, unknown>;

/** Non-blank string with an upper length bound; mirrors Bean Validation @NotBlank @Size. */
export function text(b: Body, key: string, max: number, opts: { min?: number; blank?: boolean; pattern?: RegExp } = {}): string {
  const v = b[key];
  if (typeof v !== "string" || v.length > max || v.length < (opts.min ?? 0)) throw invalid();
  if (!opts.blank && !v.trim()) throw invalid();
  if (opts.pattern && !opts.pattern.test(v)) throw invalid();
  return v;
}

export function int(b: Body, key: string, min: number, max: number): number {
  const v = b[key];
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw invalid();
  return v;
}

export function date(b: Body, key: string): string {
  const v = b[key];
  if (!isDate(v)) throw invalid();
  return v;
}

const NO_CONTROL = /^[^\x00-\x1f\x7f]+$/;

export function bookRequest(b: Body) {
  return {
    service: text(b, "service", 80),
    staff: text(b, "staff", 80),
    date: date(b, "date"),
    time: int(b, "time", 0, 1439),
    name: text(b, "name", 80, { min: 2, pattern: NO_CONTROL }),
    phone: text(b, "phone", 25, { pattern: /^[+0-9 ()-]{7,25}$/ }),
  };
}

export function companyRequest(b: Body) {
  return {
    name: text(b, "name", 100),
    slug: text(b, "slug", 60, { min: 3, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ }),
    category: text(b, "category", 40),
    city: text(b, "city", 80),
    description: text(b, "description", 1000),
    address: text(b, "address", 200),
    opens: int(b, "opens", 0, 1410),
    closes: int(b, "closes", 30, 1440),
    weekdays: text(b, "weekdays", 20, { pattern: /^[1-7](,[1-7])*$/ }),
  };
}

export function serviceRequest(b: Body) {
  return {
    name: text(b, "name", 100),
    description: text(b, "description", 300, { blank: true }),
    duration: int(b, "duration", 30, 240),
    price: int(b, "price", 0, 10_000_000),
  };
}

export function staffRequest(b: Body) {
  return { name: text(b, "name", 80), role: text(b, "role", 80) };
}
