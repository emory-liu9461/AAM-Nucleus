import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getBusiness } from "@/lib/business";
import { fmtDate, label, money } from "@/lib/format";

const { contacts, jobs } = schema;

export default async function ContactsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string }> }) {
  const [{ slug }, { q = "" }] = await Promise.all([params, searchParams]);
  const b = await getBusiness(slug);
  const like = `%${q}%`;
  const rows = await db
    .select({
      c: contacts,
      jobsCount: sql<number>`(select count(*) from ${jobs} where ${jobs.contactId} = ${contacts.id})`,
      lifetime: sql<number>`(select coalesce(sum(contract_value),0) from ${jobs} where ${jobs.contactId} = ${contacts.id} and status <> 'cancelled')`,
    })
    .from(contacts)
    .where(
      q
        ? sql`${contacts.businessId} = ${b.id} and (${contacts.firstName} || ' ' || ${contacts.lastName} ilike ${like} or ${contacts.phone} ilike ${like} or ${contacts.email} ilike ${like} or ${contacts.address} ilike ${like})`
        : eq(contacts.businessId, b.id),
    )
    .orderBy(desc(contacts.createdAt))
    .limit(300);

  return (
    <div className="space-y-4">
      <form className="flex gap-2">
        <input className="input max-w-sm" name="q" defaultValue={q} placeholder="Search name, phone, email, address" />
        <button className="btn-ghost">Search</button>
      </form>
      <section className="card overflow-x-auto p-0">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th>Source</th><th className="text-right">Jobs</th><th className="text-right">Lifetime value</th><th>Added</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted">No contacts found.</td></tr>}
            {rows.map(({ c, jobsCount, lifetime }) => (
              <tr key={c.id}>
                <td className="font-medium">{c.firstName} {c.lastName}</td>
                <td>{c.phone}</td>
                <td className="text-muted">{c.email}</td>
                <td className="text-muted">{[c.address, c.city].filter(Boolean).join(", ")}</td>
                <td className="text-muted">{label(c.source)}</td>
                <td className="text-right">{Number(jobsCount)}</td>
                <td className="text-right">{money(Number(lifetime))}</td>
                <td className="text-muted">{fmtDate(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
