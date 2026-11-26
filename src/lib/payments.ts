import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Business, Invoice, PaymentSettings } from "@/db/schema";

const { invoices, payments } = schema;

export type PaymentMethod = (typeof schema.paymentMethod.enumValues)[number];

/** Canadian wording, in the order shown in the Record payment menu. */
export const PAYMENT_METHODS: [PaymentMethod, string][] = [
  ["etransfer", "Interac e-Transfer"],
  ["cash", "Cash"],
  ["check", "Cheque"],
  ["card", "Card"],
  ["ach", "Bank transfer (EFT)"],
  ["financing", "Financing"],
  ["other", "Other"],
];
export const paymentLabel = (m: string) => PAYMENT_METHODS.find(([k]) => k === m)?.[1] ?? m;

/** Money handed to a person: an owner confirms it when someone else records it. */
export const HANDED_IN: PaymentMethod[] = ["cash", "check"];
export const needsConfirming = (method: string, recordedByOwner: boolean) => HANDED_IN.includes(method as PaymentMethod) && !recordedByOwner;

/** Set the invoice's status from what's been paid (after adding or removing a payment). */
export async function syncInvoiceStatus(inv: Pick<Invoice, "id" | "amount" | "status">) {
  const [{ paid }] = await db.select({ paid: sql<number>`coalesce(sum(${payments.amount}),0)` }).from(payments).where(eq(payments.invoiceId, inv.id));
  if (inv.status === "void") return Number(paid);
  const status = Number(paid) >= inv.amount ? "paid" : Number(paid) > 0 ? "partial" : inv.status === "draft" ? "draft" : "sent";
  await db.update(invoices).set({ status }).where(eq(invoices.id, inv.id));
  return Number(paid);
}

/** The ways a customer can pay, as set in Settings → Online payments (shown on invoices). */
export function paymentWays(b: Pick<Business, "paymentSettings">, card: boolean) {
  const ps: PaymentSettings = b.paymentSettings ?? {};
  return [
    card && "card",
    ps.etransferEmail && "e-Transfer",
    (ps.chequePayableTo || ps.chequeAddress) && "cheque",
    ps.cashNote && "cash",
  ].filter(Boolean) as string[];
}

export const joinWays = (ways: string[]) => (ways.length <= 1 ? ways.join("") : `${ways.slice(0, -1).join(", ")} or ${ways.at(-1)}`);
