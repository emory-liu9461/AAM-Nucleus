import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readTwilioWebhook, twiml } from "@/lib/twilio";

/* Call from Nucleus, step 2: you answered your phone, so now dial the customer from the business number. */
const esc = (s: string) => s.replace(/[<>&"']/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[ch]!);

export async function POST(req: Request) {
  const hook = await readTwilioWebhook(req);
  if (!hook.ok) return new Response("Invalid signature", { status: 403 });
  const id = new URL(req.url).searchParams.get("c") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return twiml("<Hangup/>");
  const [row] = await db.select({ call: schema.calls, first: schema.contacts.firstName, last: schema.contacts.lastName }).from(schema.calls).leftJoin(schema.contacts, eq(schema.contacts.id, schema.calls.contactId)).where(eq(schema.calls.id, id));
  if (!row || row.call.direction !== "out") return twiml("<Hangup/>");
  const name = `${row.first ?? ""} ${row.last ?? ""}`.trim() || "the customer";
  return twiml(
    `<Say>Connecting you to ${esc(name)}.</Say>` +
      `<Dial callerId="${esc(row.call.fromNumber)}" timeout="25" action="${esc(`${hook.base}/api/twilio/voice/bridge-done?c=${id}`)}" method="POST"><Number>${esc(row.call.toNumber)}</Number></Dial>`,
  );
}
