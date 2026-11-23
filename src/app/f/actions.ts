"use server";

import { headers } from "next/headers";
import { businessByFormKey, clientIp, createWebsiteLead, normalize } from "@/lib/intake";

export type QuoteState = { ok?: boolean; error?: string } | null;

export async function submitQuote(key: string, channel: "embed" | "hosted", _: QuoteState, form: FormData): Promise<QuoteState> {
  const business = await businessByFormKey(key);
  if (!business) return { error: "This form is no longer accepting requests." };
  const raw: Record<string, unknown> = {};
  form.forEach((v, k) => {
    if (typeof v === "string") raw[k] = v;
  });
  const result = await createWebsiteLead(business, normalize(raw), { ip: clientIp(await headers()), channel });
  return result.ok ? { ok: true } : { error: result.error };
}
