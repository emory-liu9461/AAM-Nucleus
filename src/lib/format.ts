// Canadian dollars by default (set CURRENCY=USD to switch). en-CA shows CAD as plain "$".
const CURRENCY = process.env.CURRENCY ?? process.env.NEXT_PUBLIC_CURRENCY ?? "CAD";
const LOCALE = CURRENCY === "CAD" ? "en-CA" : "en-US";

export const money = (cents: number, compact = false) =>
  new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: compact || Math.abs(cents) >= 100000 ? 0 : 2,
    notation: compact ? "compact" : "standard",
  }).format(cents / 100);

/** Always to the cent, for invoices and payments ("$1,130.45"). */
export const moneyExact = (cents: number) =>
  new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);

export const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

export const dollarsToCents = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(typeof d === "string" && d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export const fmtDateTime = (d: Date) =>
  d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const label = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
