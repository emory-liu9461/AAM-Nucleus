export const metadata = { title: "Website preview", robots: { index: false } };

export default function NotConfigured() {
  return (
    <main className="wrap py-24">
      <h1 className="text-2xl font-bold">Website preview</h1>
      <p className="mt-2 text-muted">
        This is the preview address for your business websites. Each business&apos;s site appears on its own domain once it&apos;s
        connected. To preview one here, add <code className="rounded bg-surface px-1">?site=</code> and the business&apos;s slug
        to this address, for example <code className="rounded bg-surface px-1">?site=business-one</code>.
      </p>
      <p className="mt-2 text-sm text-muted">The slug is in the business&apos;s address in Nucleus: /b/<strong>slug</strong>.</p>
    </main>
  );
}
