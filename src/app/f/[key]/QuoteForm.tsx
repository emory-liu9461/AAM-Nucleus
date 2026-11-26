"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitQuote } from "../actions";
import { keepValuesOnSubmit } from "@/components/useKeepValues";

const TIMELINES = ["As soon as possible (urgent)", "Within a month", "1–3 months", "3+ months", "Just getting prices"];

export function QuoteForm({
  formKey, channel, heading, thankYou, services, hidden, embedded,
}: {
  formKey: string;
  channel: "embed" | "hosted";
  heading: string;
  thankYou: string;
  services: string[];
  hidden: Record<string, string>;
  embedded: boolean;
}) {
  const [state, action, pending] = useActionState(submitQuote.bind(null, formKey, channel), null);
  const ref = useRef<HTMLDivElement>(null);

  // When embedded, tell the parent page our height so the iframe never scrolls.
  useEffect(() => {
    if (!embedded || !ref.current || window.parent === window) return;
    const el = ref.current;
    const send = () => window.parent.postMessage({ nucleusHeight: Math.ceil(el.getBoundingClientRect().bottom + window.scrollY + 8) }, "*");
    const ro = new ResizeObserver(send);
    ro.observe(el);
    send();
    return () => ro.disconnect();
  }, [embedded, state]);

  if (state?.ok)
    return (
      <div ref={ref} className="py-8 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white">✓</div>
        <p className="font-medium">{thankYou}</p>
      </div>
    );

  return (
    <div ref={ref}>
      <h1 className="mb-4 text-xl font-semibold">{heading}</h1>
      <form onSubmit={keepValuesOnSubmit(action)} className="grid gap-3 sm:grid-cols-2">
        <label className="field">Name *<input className="input" name="name" autoComplete="name" required /></label>
        <label className="field">Phone<input className="input" name="phone" type="tel" autoComplete="tel" /></label>
        <label className="field sm:col-span-2">Email<input className="input" name="email" type="email" autoComplete="email" /></label>
        <label className="field sm:col-span-2">Project address<input className="input" name="address" autoComplete="street-address" /></label>
        <label className="field sm:col-span-2">
          What do you need?
          {services.length ? (
            <select className="input" name="service" defaultValue="">
              <option value="" disabled>Choose a service</option>
              {services.map((s) => <option key={s}>{s}</option>)}
              <option>Something else</option>
            </select>
          ) : (
            <input className="input" name="service" placeholder="e.g. Roof replacement" />
          )}
        </label>
        <label className="field">When would you like the work to start?
          <select className="input" name="timeline" defaultValue="">
            <option value="">Choose one</option>
            {TIMELINES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="field">Ideal start date (optional)<input className="input" type="date" name="start_date" min={new Date(Date.now() + 864e5).toISOString().slice(0, 10)} /></label>
        <label className="field sm:col-span-2">Details<textarea className="input min-h-24" name="message" placeholder="Tell us about the project, budget…" /></label>
        <label className="flex items-start gap-2 text-sm text-muted sm:col-span-2">
          <input type="checkbox" name="marketing_consent" value="yes" className="mt-1" />
          <span>Also send me occasional offers and tips. Unsubscribe anytime.</span>
        </label>
        {/* Honeypot: hidden from people, filled by bots */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
          <label>Company website<input name="company_website" tabIndex={-1} autoComplete="off" /></label>
        </div>
        {Object.entries(hidden).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <div className="sm:col-span-2">
          {state?.error && <p className="mb-2 text-sm text-bad">{state.error}</p>}
          <button className="btn w-full py-2.5 text-base" disabled={pending}>{pending ? "Sending…" : "Request my quote"}</button>
          <p className="mt-2 text-center text-xs text-muted">By sending this, you agree we can contact you about your request by phone, text or email.</p>
        </div>
      </form>
    </div>
  );
}
