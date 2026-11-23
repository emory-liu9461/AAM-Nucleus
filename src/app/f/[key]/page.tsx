import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { businessByFormKey } from "@/lib/intake";
import { QuoteForm } from "./QuoteForm";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const PASS_THROUGH = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "page", "ref"];

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const b = await businessByFormKey((await params).key);
  return { title: b ? `Request a quote · ${b.name}` : "Form not found", robots: { index: false } };
}

export default async function HostedForm({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Search> }) {
  const [{ key }, sp] = await Promise.all([params, searchParams]);
  const b = await businessByFormKey(key);
  if (!b) notFound();
  const embedded = sp.embed === "1";
  const hidden = Object.fromEntries(
    PASS_THROUGH.map((k) => [k === "page" ? "page_url" : k === "ref" ? "referrer" : k, typeof sp[k] === "string" ? (sp[k] as string).slice(0, 500) : ""]),
  );
  const services = (b.formServices ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

  return (
    <main className={embedded ? "embedded p-1" : "flex min-h-screen items-start justify-center p-4 sm:items-center"} style={{ ["--accent" as string]: b.color }}>
      <div className={embedded ? "" : "card w-full max-w-lg p-6"}>
        {!embedded && (
          <div className="mb-4 flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: b.color }} />
            <span className="font-semibold">{b.name}</span>
            {b.phone && <a href={`tel:${b.phone}`} className="ml-auto text-sm text-muted hover:text-ink">{b.phone}</a>}
          </div>
        )}
        <QuoteForm
          formKey={b.formKey}
          channel={embedded ? "embed" : "hosted"}
          heading={b.formHeading || "Request a free quote"}
          thankYou={b.formThankYou || `Thanks! ${b.name} will be in touch shortly.`}
          services={services}
          hidden={hidden}
          embedded={embedded}
        />
      </div>
    </main>
  );
}
