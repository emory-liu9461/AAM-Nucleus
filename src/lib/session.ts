import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Business, Role, User } from "@/db/schema";
import { SESSION_COOKIE, verifySession } from "./auth";

const { users, businesses, userBusinesses } = schema;

/*
 * What each role can do. Owners: everything. Managers: full access to their
 * assigned businesses except team + business settings. Staff: leads, contacts,
 * jobs (no costs/margins) and schedule for their assigned businesses.
 */
export type Permission =
  | "view_financials" // dashboards, revenue, margins, job costs
  | "manage_invoices" // invoices + payments
  | "manage_business" // business settings, add/archive businesses
  | "manage_team" // users + access
  | "manage_staff"; // crew directory (contact details, calendar links)

const ROLE_PERMS: Record<Role, Permission[]> = {
  owner: ["view_financials", "manage_invoices", "manage_business", "manage_team", "manage_staff"],
  manager: ["view_financials", "manage_invoices", "manage_staff"],
  staff: [],
};

export const can = (user: Pick<User, "role">, perm: Permission) => ROLE_PERMS[user.role].includes(perm);

export const ROLE_INFO: Record<Role, string> = {
  owner: "Everything, across all businesses, including team and settings",
  manager: "Full access to assigned businesses, including revenue and invoices; no team or business settings",
  staff: "Leads, contacts, jobs and schedule for assigned businesses; no revenue, costs or invoices",
};

export type Session = { user: User; businesses: Business[] };

/** Current signed-in user + the businesses they can see, or null. Cached per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = await verifySession(token);
  if (!claims) return null;
  const [user] = await db.select().from(users).where(eq(users.id, claims.userId));
  if (!user || !user.active || user.sessionVersion !== claims.version) return null;
  const list =
    user.role === "owner"
      ? await db.select().from(businesses).where(eq(businesses.archived, false)).orderBy(asc(businesses.createdAt))
      : (
          await db
            .select({ b: businesses })
            .from(userBusinesses)
            .innerJoin(businesses, eq(businesses.id, userBusinesses.businessId))
            .where(and(eq(userBusinesses.userId, user.id), eq(businesses.archived, false)))
            .orderBy(asc(businesses.createdAt))
        ).map((r) => r.b);
  return { user, businesses: list };
});

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function requirePermission(perm: Permission): Promise<Session> {
  const s = await requireSession();
  if (!can(s.user, perm)) throw new Error("You don't have permission to do that");
  return s;
}

/**
 * Resolve a business by slug and check the current user may access it.
 * Owners can also open archived businesses (to restore them).
 */
export async function requireBusiness(slug: string, perm?: Permission) {
  const s = await requireSession();
  let business = s.businesses.find((b) => b.slug === slug);
  if (!business && s.user.role === "owner") {
    [business] = await db.select().from(businesses).where(eq(businesses.slug, slug));
  }
  if (!business) notFound();
  if (perm && !can(s.user, perm)) throw new Error("You don't have permission to do that");
  return { ...s, business };
}

/** Where to send a user who lands somewhere they can't see. */
export function homeFor(s: Session) {
  if (can(s.user, "view_financials")) return "/";
  return s.businesses[0] ? `/b/${s.businesses[0].slug}/leads` : "/account";
}

/** For pages: like requireBusiness, but sends users without the permission to Leads instead of erroring. */
export async function requireBusinessPage(slug: string, perm?: Permission) {
  const ctx = await requireBusiness(slug);
  if (perm && !can(ctx.user, perm)) redirect(`/b/${ctx.business.slug}/leads`);
  return ctx;
}
