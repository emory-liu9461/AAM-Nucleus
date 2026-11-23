import type { Metadata } from "next";
import { PageHero } from "@/components/Sections";
import { getSite } from "@/lib/site";

export const revalidate = 3600;
type Props = { params: Promise<{ site: string }> };

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Privacy policy", alternates: { canonical: "/privacy" } };
}

// A plain-language starting point. Have it reviewed for your state and the ad platforms you use.
export default async function Privacy({ params }: Props) {
  const s = await getSite((await params).site);
  const b = s.business;
  return (
    <>
      <PageHero title="Privacy policy" />
      <section className="py-14">
        <div className="wrap prose-site max-w-3xl">
          <p>This policy explains how {b.name} collects and uses information when you visit this website or request a quote.</p>
          <h2 className="mb-2 mt-6 text-xl font-bold text-ink">What we collect</h2>
          <p>When you request a quote, we collect the details you enter, such as your name, phone number, email, project address and project description. We also record how you found us (for example, the ad or search that brought you here) so we can tell which marketing works.</p>
          <p>Like most websites, we may use analytics and advertising tools (such as Google Analytics, Google Ads or the Meta Pixel) that use cookies to measure visits and the performance of our ads.</p>
          <h2 className="mb-2 mt-6 text-xl font-bold text-ink">How we use it</h2>
          <p>We use your information to respond to your request, prepare estimates, schedule and complete work, and send related communications. We do not sell your personal information.</p>
          <h2 className="mb-2 mt-6 text-xl font-bold text-ink">Your choices</h2>
          <p>You can ask us to update or delete your information at any time{b.email ? <> by emailing <a className="text-brand" href={`mailto:${b.email}`}>{b.email}</a></> : ""}{b.phone ? <> or calling {b.phone}</> : ""}. You can block or delete cookies in your browser settings.</p>
          <p className="text-sm">Last updated {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}.</p>
        </div>
      </section>
    </>
  );
}
