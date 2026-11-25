import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { recordCheckout, stripeWebhookSecret, verifyStripeSignature } from "@/lib/stripe";

/*
 * Stripe webhook for one business: POST /api/stripe/webhook/<business id>
 * Add it in that business's Stripe Dashboard (Developers → Webhooks) for the events
 * checkout.session.completed and checkout.session.async_payment_succeeded.
 */
export async function POST(req: Request, { params }: { params: Promise<{ business: string }> }) {
  const { business } = await params;
  if (!/^[0-9a-f-]{36}$/.test(business)) return new Response("Not found", { status: 404 });
  const [b] = await db.select().from(schema.businesses).where(eq(schema.businesses.id, business));
  const secret = b ? stripeWebhookSecret(b) : null;
  if (!b || !secret) return new Response("Not configured", { status: 404 });
  const body = await req.text();
  if (!verifyStripeSignature(body, req.headers.get("stripe-signature"), secret)) return new Response("Bad signature", { status: 400 });
  let event: { type?: string; data?: { object?: Parameters<typeof recordCheckout>[1] } };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if ((event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") && event.data?.object) {
    await recordCheckout(b, event.data.object);
  }
  return Response.json({ received: true });
}
