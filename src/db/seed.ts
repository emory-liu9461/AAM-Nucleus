/**
 * Demo data: two placeholder businesses with ~12 months of leads, jobs, invoices,
 * payments and upcoming schedule. Rename them in Settings or wipe with `--reset`.
 *   npm run db:seed            # only seeds if there are no businesses yet
 *   npm run db:seed -- --reset # wipes everything first
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client, { schema });

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
const between = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));
const day = 864e5;
const iso = (d: Date) => d.toISOString().slice(0, 10);

const FIRST = ["James", "Maria", "Robert", "Linda", "Michael", "Patricia", "David", "Jennifer", "Chris", "Susan", "Daniel", "Karen", "Mark", "Lisa", "Paul", "Nancy", "Kevin", "Angela", "Brian", "Megan"];
const LAST = ["Smith", "Johnson", "Garcia", "Miller", "Davis", "Martinez", "Wilson", "Anderson", "Thomas", "Moore", "Jackson", "Lee", "Harris", "Clark", "Lewis", "Walker", "Young", "Allen"];
const STREETS = ["Oak St", "Maple Ave", "Cedar Ln", "Pine Rd", "Elm Dr", "Lakeview Ct", "Hillcrest Blvd", "Ridge Way"];
const SOURCES = ["website", "website", "google", "google", "referral", "referral", "facebook", "angi", "repeat"] as const;

const BUSINESSES = [
  {
    name: "Business One Roofing",
    slug: "business-one",
    trade: "Roofing",
    color: "#2563eb",
    projects: ["Full roof replacement", "Storm damage repair", "Gutter replacement", "Roof leak repair", "Skylight install", "Metal roof install"],
    value: [4_000, 28_000] as const,
    crews: ["Crew A", "Crew B"],
  },
  {
    name: "Business Two Remodeling",
    slug: "business-two",
    trade: "Remodeling",
    color: "#ea580c",
    projects: ["Kitchen remodel", "Bathroom remodel", "Basement finish", "Deck build", "Flooring install", "Home addition"],
    value: [8_000, 85_000] as const,
    crews: ["Team North", "Team South"],
  },
];

async function main() {
  const reset = process.argv.includes("--reset");
  const existing = await db.select().from(schema.businesses);
  if (existing.length && !reset) {
    console.log(`Skipping seed: ${existing.length} business(es) already exist. Use --reset to wipe.`);
    return;
  }
  if (reset) {
    await db.delete(schema.businesses); // cascades to everything
    console.log("Wiped existing data.");
  }

  const now = new Date();
  for (const b of BUSINESSES) {
    const [biz] = await db
      .insert(schema.businesses)
      .values({ name: b.name, slug: b.slug, trade: b.trade, color: b.color, phone: "(555) 010-0000", email: `office@${b.slug}.example` })
      .returning();

    let invoiceNo = 1000;
    const leadCount = between(70, 95);
    for (let i = 0; i < leadCount; i++) {
      const created = new Date(now.getTime() - between(0, 365) * day);
      const source = pick(SOURCES);
      const [contact] = await db
        .insert(schema.contacts)
        .values({
          businessId: biz.id,
          firstName: pick(FIRST),
          lastName: pick(LAST),
          phone: `(555) ${between(200, 999)}-${String(between(0, 9999)).padStart(4, "0")}`,
          email: `customer${i}@example.com`,
          address: `${between(100, 9999)} ${pick(STREETS)}`,
          city: "Springfield",
          state: "IL",
          zip: "62704",
          source,
          createdAt: created,
        })
        .returning();

      const value = between(b.value[0], b.value[1]) * 100;
      const ageDays = (now.getTime() - created.getTime()) / day;
      // Older leads are mostly decided; recent ones are still in the pipeline.
      let stage: (typeof schema.leadStage.enumValues)[number];
      if (ageDays > 30) stage = rand() < 0.42 ? "won" : rand() < 0.85 ? "lost" : "estimate_sent";
      else stage = pick(["new", "contacted", "site_visit", "estimate_sent", "won", "lost"] as const);
      const closedAt = stage === "won" || stage === "lost" ? new Date(Math.min(now.getTime(), created.getTime() + between(5, 25) * day)) : null;

      const project = pick(b.projects);
      const [lead] = await db
        .insert(schema.leads)
        .values({ businessId: biz.id, contactId: contact.id, title: project, stage, source, estimatedValue: value, createdAt: created, closedAt })
        .returning();

      if (stage !== "won" || !closedAt) continue;

      const start = new Date(closedAt.getTime() + between(7, 21) * day);
      const duration = between(2, b.trade === "Roofing" ? 5 : 30);
      const end = new Date(start.getTime() + duration * day);
      const status = end < now ? "completed" : start < now ? "in_progress" : "scheduled";
      const estCost = Math.round(value * (0.55 + rand() * 0.15));
      const [job] = await db
        .insert(schema.jobs)
        .values({
          businessId: biz.id,
          contactId: contact.id,
          leadId: lead.id,
          name: `${project} – ${contact.lastName}`,
          status,
          contractValue: value,
          estimatedCost: estCost,
          actualCost: status === "completed" ? Math.round(estCost * (0.9 + rand() * 0.25)) : 0,
          address: contact.address,
          startDate: iso(start),
          endDate: iso(end),
        })
        .returning();

      // Deposit at signing (30%), balance at completion.
      const deposit = Math.round(value * 0.3);
      const invs = [
        { amount: deposit, issued: closedAt, desc: "Deposit (30%)" },
        ...(status === "completed" ? [{ amount: value - deposit, issued: end, desc: "Final balance" }] : []),
      ];
      for (const inv of invs) {
        const due = new Date(inv.issued.getTime() + 15 * day);
        const paidFully = rand() < (due < now ? 0.88 : 0.4);
        const partial = !paidFully && rand() < 0.3;
        const [row] = await db
          .insert(schema.invoices)
          .values({
            businessId: biz.id,
            contactId: contact.id,
            jobId: job.id,
            number: `${b.slug === "business-one" ? "B1" : "B2"}-${invoiceNo++}`,
            description: inv.desc,
            status: paidFully ? "paid" : partial ? "partial" : "sent",
            amount: inv.amount,
            issuedAt: iso(inv.issued),
            dueAt: iso(due),
          })
          .returning();
        if (paidFully || partial) {
          const receivedAt = new Date(Math.min(now.getTime() - 3600e3, inv.issued.getTime() + between(1, 14) * day));
          await db.insert(schema.payments).values({
            businessId: biz.id,
            invoiceId: row.id,
            amount: paidFully ? inv.amount : Math.round(inv.amount / 2),
            method: inv.amount > 1_000_000 ? "ach" : pick(["card", "ach", "check"] as const),
            receivedAt,
          });
        }
      }

      if (status !== "completed") {
        const s = new Date(Math.max(start.getTime(), now.getTime() + between(0, 6) * day));
        s.setHours(7, 30, 0, 0);
        const e = new Date(s.getTime() + between(0, 4) * day);
        e.setHours(16, 0, 0, 0);
        await db.insert(schema.scheduleEvents).values({
          businessId: biz.id,
          jobId: job.id,
          contactId: contact.id,
          title: job.name,
          type: "job_work",
          startsAt: s,
          endsAt: e,
          assignee: pick(b.crews),
        });
      }
    }

    // A few upcoming site visits for open leads.
    for (let i = 0; i < 4; i++) {
      const s = new Date(now);
      s.setDate(s.getDate() + between(1, 6));
      s.setHours(between(8, 15), 0, 0, 0);
      await db.insert(schema.scheduleEvents).values({
        businessId: biz.id,
        title: `Site visit – ${pick(b.projects)}`,
        type: "site_visit",
        startsAt: s,
        endsAt: new Date(s.getTime() + 3600e3),
        assignee: "Owner",
      });
    }
    console.log(`Seeded ${b.name} (${leadCount} leads)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => client.end());
