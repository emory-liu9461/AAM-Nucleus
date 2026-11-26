"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/*
 * Native quote form that posts to the Nucleus lead API. Ad/UTM tags from the
 * visitor's landing page (saved by <TrackAttribution/>) are sent with the lead.
 */
export function QuoteForm({
  endpoint, services, defaultService, compact = false, heading, businessName = "us",
}: {
  businessName?: string;
  endpoint: string | null;
  services: string[];
  defaultService?: string;
  compact?: boolean;
  heading?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<{ pending: boolean; error?: string }>({ pending: false });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!endpoint) return setState({ pending: false, error: "Online quotes are paused. Please call us." });
    setState({ pending: true });
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    let attr: Record<string, string> = {};
    try { attr = JSON.parse(sessionStorage.getItem("site_attr") || "{}"); } catch {}
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, ...attr, page_url: attr.page_url || location.href, form_name: compact ? "site-hero" : "site-quote", _channel: "site" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) return setState({ pending: false, error: json.error || "Something went wrong. Please call us." });
      router.push("/thank-you");
    } catch {
      setState({ pending: false, error: "Couldn't send. Check your connection or call us." });
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      {heading && <h2 className="text-xl font-bold sm:col-span-2">{heading}</h2>}
      <label className="field">Name<input className="input" name="name" autoComplete="name" required /></label>
      <label className="field">Phone<input className="input" name="phone" type="tel" autoComplete="tel" required /></label>
      <label className="field sm:col-span-2">Email<input className="input" name="email" type="email" autoComplete="email" /></label>
      {!compact && <label className="field sm:col-span-2">Project address<input className="input" name="address" autoComplete="street-address" /></label>}
      <label className="field sm:col-span-2">Service
        <select className="input" name="service" defaultValue={defaultService ?? ""} required>
          <option value="" disabled>Choose a service</option>
          {services.map((s) => <option key={s}>{s}</option>)}
          <option>Something else</option>
        </select>
      </label>
      <label className="field sm:col-span-2">When would you like the work to start?
        <select className="input" name="timeline" defaultValue="">
          <option value="">Choose one</option>
          {["As soon as possible (urgent)", "Within a month", "1–3 months", "3+ months", "Just getting prices"].map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>
      <label className="field sm:col-span-2">Project details{compact ? " (optional)" : ""}
        <textarea className="input" name="message" rows={compact ? 2 : 4} placeholder="What do you need done?" />
      </label>
      <label className="flex items-start gap-2 text-sm font-normal text-muted sm:col-span-2">
        <input type="checkbox" name="marketing_consent" value="yes" className="mt-1" />
        <span>Also send me occasional offers and tips from {businessName.replace(/\.+$/, "")}. Unsubscribe anytime.</span>
      </label>
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label>Company website<input name="company_website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <div className="sm:col-span-2">
        {state.error && <p className="mb-2 text-sm font-medium text-red-700" role="alert">{state.error}</p>}
        <button className="btn-primary w-full text-base" disabled={state.pending}>{state.pending ? "Sending…" : "Get my free quote"}</button>
        <p className="mt-2 text-center text-xs text-muted">
          No obligation. By sending this, you agree we can contact you about your request by phone, text or email.{compact && <> Bigger project? <a href="/quote" className="font-semibold text-brand hover:underline">Use the detailed form</a>.</>}
        </p>
      </div>
    </form>
  );
}
