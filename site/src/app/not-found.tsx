import Link from "next/link";

export default function NotFound() {
  return (
    <main className="wrap py-24 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 text-3xl font-bold">We couldn&apos;t find that page</h1>
      <p className="mt-2 text-muted">It may have moved. Try the home page instead.</p>
      <Link href="/" className="btn-primary mt-6">Go to the home page</Link>
    </main>
  );
}
