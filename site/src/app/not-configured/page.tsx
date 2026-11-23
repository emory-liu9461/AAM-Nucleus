export const metadata = { title: "Website not configured", robots: { index: false } };

export default function NotConfigured() {
  return (
    <main className="wrap py-24">
      <h1 className="text-2xl font-bold">This website isn&apos;t set up yet</h1>
      <p className="mt-2 text-muted">
        Set <code>DEFAULT_SITE</code> to a business slug from Nucleus, add <code>?site=&lt;slug&gt;</code> to the address, or connect a domain on
        the business&apos;s Website content page in Nucleus.
      </p>
    </main>
  );
}
