import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Minimal Twilio helpers: webhook signature checks, sending SMS through the REST API,
 * and TwiML (the XML Twilio expects back from voice/SMS webhooks).
 *
 * Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and APP_URL (the public https address of
 * this app; Twilio signs the exact URL it calls, so it must match what's configured).
 */

export const twilioConfigured = () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);

/** Public base URL of this app, used for webhook URLs and signature checks. */
export function appBase(h: Headers) {
  const env = process.env.APP_URL?.replace(/\/$/, "");
  if (env) return env;
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

/**
 * Twilio's request signature: HMAC-SHA1 (auth token) of the full URL followed by each
 * POST parameter name+value, sorted by name, base64-encoded.
 */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>) {
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

export function validTwilioRequest(signature: string | null, url: string, params: Record<string, string>) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  const expected = Buffer.from(twilioSignature(token, url, params));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Read a Twilio webhook (form-encoded) and verify it really came from Twilio. */
export async function readTwilioWebhook(req: Request): Promise<{ ok: true; params: Record<string, string>; base: string } | { ok: false }> {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === "string") params[k] = v;
  });
  const base = appBase(req.headers);
  const u = new URL(req.url);
  const url = `${base}${u.pathname}${u.search}`;
  if (!validTwilioRequest(req.headers.get("x-twilio-signature"), url, params)) return { ok: false };
  return { ok: true, params, base };
}

/** Send a text through Twilio. Returns the message SID. */
export async function sendTwilioSms(from: string, to: string, body: string, statusCallback?: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio isn't configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)");
  const api = (process.env.TWILIO_API_BASE ?? "https://api.twilio.com").replace(/\/$/, "");
  const form = new URLSearchParams({ From: from, To: to, Body: body });
  if (statusCallback) form.set("StatusCallback", statusCallback);
  const res = await fetch(`${api}/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
  if (!res.ok) throw new Error(`Twilio ${res.status}${json.code ? ` (${json.code})` : ""}: ${json.message ?? "send failed"}`);
  return json.sid ?? null;
}

/** Only fetch recordings from Twilio itself (or the test API base), never an arbitrary URL. */
export function isTwilioMediaUrl(url: string) {
  try {
    const u = new URL(url);
    const testBase = process.env.TWILIO_API_BASE ? new URL(process.env.TWILIO_API_BASE).host : null;
    return (u.protocol === "https:" && (u.hostname === "api.twilio.com" || u.hostname.endsWith(".twilio.com"))) || (testBase !== null && u.host === testBase);
  } catch {
    return false;
  }
}

/** Fetch a call recording (Twilio may require auth on media). */
export async function fetchRecording(recordingUrl: string) {
  if (!isTwilioMediaUrl(recordingUrl)) return new Response(null, { status: 400 });
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  return fetch(`${recordingUrl}.mp3`, { headers: sid && token ? { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` } : {} });
}

/* ---------- TwiML ---------- */

export const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function twiml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { headers: { "Content-Type": "text/xml" } });
}

/* ---------- phone numbers ---------- */

/** "(555) 123-4567" -> "+15551234567". US/Canada numbers; other numbers must include +country code. */
export function toE164(input: string | null | undefined) {
  if (!input) return null;
  const s = input.trim();
  const digits = s.replace(/\D/g, "");
  if (s.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function prettyPhone(e164: string | null | undefined) {
  if (!e164) return "";
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

/** Carrier keywords Twilio handles automatically for opt-out / opt-in. */
export const OPT_OUT = /^\s*(stop|stopall|unsubscribe|cancel|end|quit|optout|revoke)\s*$/i;
export const OPT_IN = /^\s*(start|unstop|yes)\s*$/i;
