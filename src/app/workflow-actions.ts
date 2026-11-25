"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FormState } from "@/app/auth-actions";
import type { WorkflowSettings } from "@/db/schema";
import { requireBusiness } from "@/lib/session";
import { STEPS, defaultMessage, sendOnTheWay, sendProgress, sendWelcome } from "@/lib/workflow";

const { businesses, jobPhotos, jobUpdates } = schema;
const refresh = (slug: string) => revalidatePath(`/b/${slug}`, "layout");
const sentText = (r: { channels: string[]; error: string | null } | null) =>
  !r ? "" : r.channels.length ? ` Sent by ${r.channels.join(" and ").replace("sms", "text")}.` : r.error ? ` Not sent: ${r.error}.` : "";

/** Messages & rules (owner). */
export async function saveWorkflowSettings(slug: string, _: FormState, form: FormData): Promise<FormState> {
  const { business: b } = await requireBusiness(slug, "manage_business");
  const steps: WorkflowSettings["steps"] = {};
  for (const { key } of STEPS) {
    const msg = String(form.get(`${key}_message`) ?? "").trim().slice(0, 1000);
    steps[key] = {
      enabled: form.get(`${key}_enabled`) === "on",
      sms: form.get(`${key}_sms`) === "on",
      email: form.get(`${key}_email`) === "on",
      // Saved only when it differs from the default, so improved defaults still reach you.
      message: msg && msg !== defaultMessage(key) ? msg : undefined,
    };
  }
  const prepGuide = String(form.get("prepGuide") ?? "").split("\n").map((l) => l.replace(/^[-•*\s]+/, "").trim()).filter(Boolean).slice(0, 30);
  const window = Number(form.get("arrivalWindowMinutes"));
  const before = Number(form.get("reminderDaysBefore"));
  const settings: WorkflowSettings = {
    steps,
    prepGuide: prepGuide.length ? prepGuide : undefined,
    arrivalWindowMinutes: Number.isFinite(window) && window >= 0 && window <= 240 ? Math.round(window) : 30,
    reminderDaysBefore: [1, 2, 3].includes(before) ? before : 1,
  };
  await db.update(businesses).set({ workflowSettings: settings }).where(eq(businesses.id, b.id));
  refresh(slug);
  return { ok: "Saved. New messages use these settings." };
}

/** Post a progress update (photos were uploaded first) and, if chosen, send it to the customer. */
export async function postProgress(slug: string, jobId: string, note: string, photoIds: string[], notify: boolean): Promise<FormState> {
  const { business: b, user } = await requireBusiness(slug);
  const text = note.trim().slice(0, 1000);
  if (!text && !photoIds.length) return { error: "Write an update or add photos." };
  const r = await sendProgress(b, jobId, text || "New photos from the job.", user.id, notify);
  if (photoIds.length) {
    await db
      .update(jobPhotos)
      .set({ updateId: r.id })
      .where(and(eq(jobPhotos.businessId, b.id), eq(jobPhotos.jobId, jobId), inArray(jobPhotos.id, photoIds.slice(0, 20)), isNull(jobPhotos.updateId)));
  }
  refresh(slug);
  return { ok: `Update posted to the customer's project page.${notify ? sentText(r) : ""}` };
}

export async function onTheWay(slug: string, jobId: string, _: FormState, form: FormData): Promise<FormState> {
  const { business: b, user } = await requireBusiness(slug);
  const eta = Number(form.get("eta"));
  const r = await sendOnTheWay(b, jobId, Number.isFinite(eta) && eta > 0 ? Math.round(eta) : null, user.id);
  refresh(slug);
  if ("error" in r && !("channels" in r)) return { error: r.error as string };
  return "channels" in r && r.channels.length ? { ok: `Customer told you're on the way.${sentText(r)}` } : { error: `Not sent: ${"error" in r ? r.error : "unknown"}` };
}

export async function resendWelcome(slug: string, jobId: string, _: FormState, _f: FormData): Promise<FormState> {
  const { business: b, user } = await requireBusiness(slug);
  const r = await sendWelcome(b, jobId, { userId: user.id, force: true });
  refresh(slug);
  return r?.channels.length ? { ok: `Project page link sent.${sentText(r)}` } : { error: `Not sent: ${r?.error ?? "job not found"}` };
}

export async function deleteUpdate(slug: string, updateId: string) {
  const { business: b } = await requireBusiness(slug);
  await db.delete(jobUpdates).where(and(eq(jobUpdates.id, updateId), eq(jobUpdates.businessId, b.id)));
  refresh(slug);
}
