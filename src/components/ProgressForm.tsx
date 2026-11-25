"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postProgress } from "@/app/workflow-actions";
import { resize } from "./PhotoUploader";

/** Post a progress update with photos to the customer's project page (and text/email them). */
export function ProgressForm({ slug, jobId }: { slug: string; jobId: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; msg?: string; ok?: string; error?: string }>({ busy: false });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const note = String(new FormData(form).get("note") ?? "");
    const notify = (form.elements.namedItem("notify") as HTMLInputElement).checked;
    const files = Array.from((form.elements.namedItem("files") as HTMLInputElement).files ?? []).slice(0, 12);
    const ids: string[] = [];
    try {
      for (const [i, f] of files.entries()) {
        setState({ busy: true, msg: `Uploading photo ${i + 1} of ${files.length}…` });
        const { blob, width, height } = await resize(f);
        const fd = new FormData();
        fd.set("b", slug);
        fd.set("job", jobId);
        fd.set("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
        fd.set("width", String(width));
        fd.set("height", String(height));
        const res = await fetch("/api/job-photos", { method: "POST", body: fd });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Upload failed");
        ids.push(json.id);
      }
      setState({ busy: true, msg: "Posting…" });
      const r = await postProgress(slug, jobId, note, ids, notify);
      if (r?.error) return setState({ busy: false, error: r.error });
      form.reset();
      setState({ busy: false, ok: r?.ok });
      router.refresh();
    } catch (err) {
      setState({ busy: false, error: err instanceof Error ? err.message : "Something went wrong" });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <textarea className="input w-full" name="note" rows={2} placeholder="e.g. Prep and priming done on the front. Painting the trim tomorrow." maxLength={1000} />
      <div className="flex flex-wrap items-center gap-3">
        <input className="text-sm" type="file" name="files" accept="image/jpeg,image/png,image/webp,image/heic" multiple aria-label="Photos" />
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="notify" defaultChecked /> Text/email the customer</label>
        <button className="btn" disabled={state.busy}>{state.busy ? state.msg : "Post update"}</button>
      </div>
      {state.error && <p className="text-sm text-bad">{state.error}</p>}
      {state.ok && <p className="text-sm text-good">{state.ok}</p>}
    </form>
  );
}
