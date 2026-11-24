"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Resizes photos in the browser (max 1600px, JPEG) before uploading, so big phone photos upload fast. */
async function resize(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("resize failed"))), "image/jpeg", 0.82));
  return { blob, width, height };
}

export function PhotoUploader({ slug, services, areas }: { slug: string; services: { slug: string; name: string }[]; areas: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<{ busy: boolean; msg?: string; error?: string }>({ busy: false });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const files = Array.from((form.elements.namedItem("files") as HTMLInputElement).files ?? []);
    if (!files.length) return setStatus({ busy: false, error: "Choose one or more photos" });
    const shared = new FormData(form);
    let done = 0;
    const failed: string[] = [];
    for (const f of files) {
      setStatus({ busy: true, msg: `Uploading ${done + 1} of ${files.length}…` });
      try {
        const { blob, width, height } = await resize(f);
        const fd = new FormData();
        fd.set("b", slug);
        fd.set("file", new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }));
        fd.set("width", String(width));
        fd.set("height", String(height));
        for (const k of ["caption", "service", "area", "kind"]) fd.set(k, String(shared.get(k) ?? ""));
        const res = await fetch("/api/photos", { method: "POST", body: fd });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "upload failed");
        done++;
      } catch (err) {
        failed.push(`${f.name}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
    form.reset();
    setStatus({ busy: false, msg: done ? `Uploaded ${done} photo${done === 1 ? "" : "s"}. They appear on your website within about a minute.` : undefined, error: failed.length ? failed.join(" · ") : undefined });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card grid gap-3 sm:grid-cols-2">
      <label className="field sm:col-span-2">Photos (you can pick several)
        <input className="input" type="file" name="files" accept="image/jpeg,image/png,image/webp,image/heic" multiple />
      </label>
      <label className="field">Type
        <select className="input" name="kind" defaultValue="photo">
          <option value="photo">Finished project</option>
          <option value="before">Before</option>
          <option value="after">After</option>
        </select>
      </label>
      <label className="field">Caption (optional)<input className="input" name="caption" maxLength={200} placeholder="Exterior repaint, Kanata" /></label>
      <label className="field">Service (optional; also shows on that service&apos;s page)
        <select className="input" name="service" defaultValue="">
          <option value="">—</option>
          {services.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
        </select>
      </label>
      <label className="field">Area (optional)
        <select className="input" name="area" defaultValue="">
          <option value="">—</option>
          {areas.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className="btn" disabled={status.busy}>{status.busy ? status.msg : "Upload"}</button>
        {!status.busy && status.msg && <p className="text-sm text-good">{status.msg}</p>}
        {status.error && <p className="text-sm text-bad">{status.error}</p>}
      </div>
    </form>
  );
}
