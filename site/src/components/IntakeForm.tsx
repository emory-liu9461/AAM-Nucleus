"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

/*
 * Three-step customer intake: project → property → contact.
 * Shorter steps get more people to finish; answers arrive in Nucleus on the lead.
 */

const TIMELINES = ["As soon as possible (urgent)", "Within a month", "1–3 months", "3+ months", "Just getting prices"];
const BUDGETS = ["Under $5,000", "$5,000–$15,000", "$15,000–$30,000", "$30,000–$60,000", "$60,000+", "Not sure yet"];
const PROPERTY = ["Single-family home", "Townhouse / condo", "Multi-family / rental", "Commercial"];
const CONTACT = ["Phone call", "Text message", "Email"];
const BEST_TIME = ["Morning", "Afternoon", "Evening", "Any time"];
const HEARD = ["Google search", "Google Maps", "Facebook / Instagram", "Friend or neighbor", "Saw your truck or yard sign", "Angi / HomeAdvisor", "Worked with you before", "Other"];

const STEPS = ["Your project", "The property", "How to reach you"];

export function IntakeForm({ endpoint, services, defaultService, businessName = "us" }: { endpoint: string | null; services: string[]; defaultService?: string; businessName?: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [state, setState] = useState<{ pending: boolean; error?: string }>({ pending: false });

  // Only validate the fields on the current step before moving on.
  const stepValid = () => {
    const fields = formRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[data-step="${step}"] [name]`);
    for (const f of Array.from(fields ?? [])) {
      if (!f.checkValidity()) {
        f.reportValidity();
        return false;
      }
    }
    return true;
  };

  const next = () => {
    if (!stepValid()) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step < STEPS.length - 1) return next();
    if (!stepValid()) return;
    if (!endpoint) return setState({ pending: false, error: "Online quotes are paused. Please call us." });
    setState({ pending: true });
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    let attr: Record<string, string> = {};
    try { attr = JSON.parse(sessionStorage.getItem("site_attr") || "{}"); } catch {}
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, ...attr, page_url: attr.page_url || location.href, form_name: "site-intake", _channel: "site" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) return setState({ pending: false, error: json.error || "Something went wrong. Please call us." });
      router.push("/thank-you");
    } catch {
      setState({ pending: false, error: "Couldn't send. Check your connection or call us." });
    }
  }

  const minDate = new Date(Date.now() + 864e5).toISOString().slice(0, 10);

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="scroll-mt-28">
      {/* Progress */}
      <ol className="mb-6 grid grid-cols-3 gap-2" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button type="button" onClick={() => (i < step ? setStep(i) : undefined)} disabled={i > step}
              className="w-full text-left disabled:cursor-default" aria-current={i === step ? "step" : undefined}>
              <span className={`block h-1.5 rounded-full ${i <= step ? "bg-brand" : "bg-line"}`} />
              <span className={`mt-2 flex items-center gap-1.5 text-xs font-semibold sm:text-sm ${i === step ? "text-ink" : "text-muted"}`}>
                {i < step ? <Icon name="check" className="h-4 w-4 text-brand" /> : <span className="tabular-nums">{i + 1}.</span>}
                {label}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {/* Step 1: project */}
      <fieldset data-step="0" hidden={step !== 0} className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Your project</legend>
        <label className="field sm:col-span-2">What do you need help with? *
          <select className="input" name="service" defaultValue={defaultService ?? ""} required>
            <option value="" disabled>Choose a service</option>
            {services.map((s) => <option key={s}>{s}</option>)}
            <option>Something else</option>
          </select>
        </label>
        <label className="field sm:col-span-2">Tell us about the project *
          <textarea className="input" name="message" rows={4} required minLength={5}
            placeholder="What's going on, what you'd like done, sizes or rooms involved, anything we should know…" />
        </label>
        <Choice name="timeline" label="When would you like the work to start?" options={TIMELINES} required />
        <label className="field">Ideal start date <span className="text-xs font-normal text-muted">(optional)</span><input className="input" type="date" name="start_date" min={minDate} /></label>
        <Choice name="budget_range" label="Rough budget" options={BUDGETS} hint="Helps us suggest the right options" />
      </fieldset>

      {/* Step 2: property */}
      <fieldset data-step="1" hidden={step !== 1} className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">The property</legend>
        <label className="field sm:col-span-2">Project address *<input className="input" name="address" autoComplete="street-address" required /></label>
        <label className="field">City<input className="input" name="city" autoComplete="address-level2" /></label>
        <label className="field">Postal / ZIP code *<input className="input" name="zip" autoComplete="postal-code" autoCapitalize="characters" pattern="[0-9A-Za-z \-]{3,10}" required /></label>
        <Choice name="property_type" label="Property type" options={PROPERTY} />
        <Choice name="homeowner" label="Do you own the property?" options={["Yes", "No, I rent", "I manage it for the owner"]} />
      </fieldset>

      {/* Step 3: contact */}
      <fieldset data-step="2" hidden={step !== 2} className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">How to reach you</legend>
        <label className="field">First and last name *<input className="input" name="name" autoComplete="name" required /></label>
        <label className="field">Phone *<input className="input" name="phone" type="tel" autoComplete="tel" required /></label>
        <label className="field sm:col-span-2">Email<input className="input" name="email" type="email" autoComplete="email" /></label>
        <Choice name="contact_method" label="Best way to reach you" options={CONTACT} />
        <Choice name="best_time" label="Best time" options={BEST_TIME} />
        <label className="field">Preferred day for a site visit<input className="input" type="date" name="preferred_date" min={minDate} /></label>
        <label className="field">How did you hear about us?
          <select className="input" name="heard_about" defaultValue="">
            <option value="">Choose one</option>
            {HEARD.map((h) => <option key={h}>{h}</option>)}
          </select>
        </label>
        <label className="flex items-start gap-2 text-sm font-normal text-muted sm:col-span-2">
          <input type="checkbox" name="marketing_consent" value="yes" className="mt-1" />
          <span>Also send me occasional offers and tips from {businessName.replace(/\.+$/, "")}. Unsubscribe anytime.</span>
        </label>
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
          <label>Company website<input name="company_website" tabIndex={-1} autoComplete="off" /></label>
        </div>
      </fieldset>

      {state.error && <p className="mt-4 text-sm font-medium text-red-700" role="alert">{state.error}</p>}
      <div className="mt-6 flex items-center gap-3">
        {step > 0 && <button type="button" className="btn-outline" onClick={() => setStep(step - 1)}>Back</button>}
        <button className="btn-primary flex-1 text-base" disabled={state.pending}>
          {step < STEPS.length - 1 ? <>Continue <Icon name="arrow" className="h-4 w-4" /></> : state.pending ? "Sending…" : "Send my request"}
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-muted">Step {step + 1} of {STEPS.length} · Free, no obligation.{step === STEPS.length - 1 ? " By sending this, you agree we can contact you about your request by phone, text or email." : ""}</p>
    </form>
  );
}

/** A compact set of pill-style radio buttons. */
function Choice({ name, label, options, required, hint }: { name: string; label: string; options: string[]; required?: boolean; hint?: string }) {
  return (
    <fieldset className="field">
      <legend className="mb-1">{label}{required ? " *" : ""}{hint && <span className="block text-xs font-normal text-muted">{hint}</span>}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o, i) => (
          <label key={o} className="cursor-pointer">
            <input type="radio" name={name} value={o} required={required && i === 0} className="peer sr-only" />
            <span className="inline-block rounded-full border border-line bg-white px-3 py-1.5 text-sm font-normal text-ink transition peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand/30">{o}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
