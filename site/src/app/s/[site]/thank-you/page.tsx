import Link from "next/link";
import { Icon } from "@/components/Icon";
import { LeadConversion } from "@/components/Tracking";
import { getSite, telHref } from "@/lib/site";

export const metadata = { title: "Thank you", robots: { index: false } };

export default async function ThankYou({ params }: { params: Promise<{ site: string }> }) {
  const s = await getSite((await params).site);
  return (
    <section className="py-24">
      <LeadConversion />
      <div className="wrap max-w-xl text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white"><Icon name="check" className="h-7 w-7" /></span>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Thanks, we got your request!</h1>
        <p className="lead mt-3">{s.business.name} will contact you within one business day, usually sooner.</p>
        {s.business.phone && <p className="mt-6">Need us sooner? Call <a className="font-semibold text-brand" href={telHref(s.business.phone)}>{s.business.phone}</a></p>}
        <Link href="/" className="btn-outline mt-8">Back to the home page</Link>
      </div>
    </section>
  );
}
