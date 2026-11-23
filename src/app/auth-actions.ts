"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import { SESSION_COOKIE, SESSION_DAYS, safeEqual, signSession } from "@/lib/auth";
import { DUMMY_HASH, MIN_PASSWORD, hashPassword, verifyPassword } from "@/lib/password";
import { homeFor, requirePermission, requireSession } from "@/lib/session";

const { users, userBusinesses, businesses } = schema;

export type FormState = { error?: string; ok?: string } | null;

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const ROLES: Role[] = ["owner", "manager", "staff"];
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

async function startSession(userId: string, version: number) {
  (await cookies()).set(SESSION_COOKIE, await signSession(userId, version), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 864e5 / 1000,
  });
}

const findByEmail = async (email: string) =>
  (await db.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`))[0];

const userCount = async () => Number((await db.select({ c: sql<number>`count(*)` }).from(users))[0].c);

/* ---------- sign in / out ---------- */

export async function login(_: FormState, form: FormData): Promise<FormState> {
  if (!process.env.AUTH_SECRET) return { error: "Server not configured: set AUTH_SECRET in the hosting environment variables, then redeploy." };
  const email = str(form, "email");
  const password = String(form.get("password") ?? "");
  const user = email ? await findByEmail(email) : undefined;
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) return { error: "Incorrect email or password" };
  if (!user.active) return { error: "This account has been deactivated. Ask the owner to reactivate it." };
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await startSession(user.id, user.sessionVersion);
  redirect(await homePathFor(user.id));
}

async function homePathFor(userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  const list =
    u.role === "owner"
      ? await db.select().from(businesses).where(eq(businesses.archived, false))
      : (
          await db
            .select({ b: businesses })
            .from(userBusinesses)
            .innerJoin(businesses, eq(businesses.id, userBusinesses.businessId))
            .where(and(eq(userBusinesses.userId, u.id), eq(businesses.archived, false)))
        ).map((r) => r.b);
  return homeFor({ user: u, businesses: list });
}

/**
 * First-run setup: creates the first owner account. Only works while there are
 * no users, and requires OWNER_PASSWORD (the setup code) so a stranger who finds
 * the site first can't claim it.
 */
export async function setupOwner(_: FormState, form: FormData): Promise<FormState> {
  const code = (process.env.OWNER_PASSWORD ?? "").trim();
  if (!code || !process.env.AUTH_SECRET)
    return { error: "Server not configured: set OWNER_PASSWORD (setup code) and AUTH_SECRET, then redeploy." };
  if ((await userCount()) > 0) return { error: "Setup is already complete. Sign in instead." };
  if (!safeEqual(str(form, "setupCode"), code)) return { error: "Setup code is incorrect (it's the OWNER_PASSWORD value)" };
  const name = str(form, "name");
  const email = str(form, "email");
  const password = String(form.get("password") ?? "");
  if (!name) return { error: "Enter your name" };
  if (!emailOk(email)) return { error: "Enter a valid email" };
  if (password.length < MIN_PASSWORD) return { error: `Password must be at least ${MIN_PASSWORD} characters` };
  if (password !== String(form.get("confirm") ?? "")) return { error: "Passwords don't match" };
  const [u] = await db.insert(users).values({ name, email, passwordHash: await hashPassword(password), role: "owner" }).returning();
  await startSession(u.id, u.sessionVersion);
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

/* ---------- your own account ---------- */

export async function updateMyName(_: FormState, form: FormData): Promise<FormState> {
  const { user } = await requireSession();
  const name = str(form, "name");
  if (!name) return { error: "Enter your name" };
  await db.update(users).set({ name }).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
  return { ok: "Saved" };
}

export async function changeMyPassword(_: FormState, form: FormData): Promise<FormState> {
  const { user } = await requireSession();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("password") ?? "");
  if (!(await verifyPassword(current, user.passwordHash))) return { error: "Current password is incorrect" };
  if (next.length < MIN_PASSWORD) return { error: `New password must be at least ${MIN_PASSWORD} characters` };
  if (next !== String(form.get("confirm") ?? "")) return { error: "Passwords don't match" };
  const version = user.sessionVersion + 1; // signs out your other devices
  await db.update(users).set({ passwordHash: await hashPassword(next), sessionVersion: version }).where(eq(users.id, user.id));
  await startSession(user.id, version);
  return { ok: "Password changed. Other devices have been signed out." };
}

/* ---------- team management (owner only) ---------- */

async function activeOwnerCount(excludeId?: string) {
  const where = excludeId
    ? and(eq(users.role, "owner"), eq(users.active, true), ne(users.id, excludeId))
    : and(eq(users.role, "owner"), eq(users.active, true));
  return Number((await db.select({ c: sql<number>`count(*)` }).from(users).where(where))[0].c);
}

async function setAccess(userId: string, businessIds: string[]) {
  await db.delete(userBusinesses).where(eq(userBusinesses.userId, userId));
  if (!businessIds.length) return;
  const valid = await db.select({ id: businesses.id }).from(businesses).where(inArray(businesses.id, businessIds));
  if (valid.length) await db.insert(userBusinesses).values(valid.map((b) => ({ userId, businessId: b.id })));
}

export async function createUser(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("manage_team");
  const name = str(form, "name");
  const email = str(form, "email");
  const role = str(form, "role") as Role;
  const password = String(form.get("password") ?? "");
  const access = form.getAll("businessIds").map(String);
  if (!name) return { error: "Enter a name" };
  if (!emailOk(email)) return { error: "Enter a valid email" };
  if (!ROLES.includes(role)) return { error: "Pick a role" };
  if (password.length < MIN_PASSWORD) return { error: `Temporary password must be at least ${MIN_PASSWORD} characters` };
  if (role !== "owner" && access.length === 0) return { error: "Give them access to at least one business" };
  if (await findByEmail(email)) return { error: "Someone with that email already has an account" };
  const [u] = await db.insert(users).values({ name, email, role, passwordHash: await hashPassword(password) }).returning();
  if (role !== "owner") await setAccess(u.id, access);
  revalidatePath("/team");
  return { ok: `${name} added. Share their email and temporary password with them.` };
}

export async function updateUser(userId: string, _: FormState, form: FormData): Promise<FormState> {
  await requirePermission("manage_team");
  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target) return { error: "User not found" };
  const role = str(form, "role") as Role;
  const name = str(form, "name");
  const access = form.getAll("businessIds").map(String);
  if (!ROLES.includes(role)) return { error: "Pick a role" };
  if (!name) return { error: "Enter a name" };
  if (target.role === "owner" && role !== "owner" && (await activeOwnerCount(target.id)) === 0)
    return { error: "There must always be at least one active owner" };
  if (role !== "owner" && access.length === 0) return { error: "Give them access to at least one business" };
  await db.update(users).set({ role, name }).where(eq(users.id, userId));
  await setAccess(userId, role === "owner" ? [] : access);
  revalidatePath("/", "layout");
  return { ok: "Saved" };
}

export async function setUserActive(userId: string, active: boolean) {
  const { user: me } = await requirePermission("manage_team");
  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target) throw new Error("User not found");
  if (!active && target.id === me.id) throw new Error("You can't deactivate yourself");
  if (!active && target.role === "owner" && (await activeOwnerCount(target.id)) === 0)
    throw new Error("There must always be at least one active owner");
  // Bumping sessionVersion signs them out of every device immediately.
  await db
    .update(users)
    .set({ active, sessionVersion: target.sessionVersion + 1 })
    .where(eq(users.id, userId));
  revalidatePath("/team");
}

export async function resetUserPassword(userId: string, _: FormState, form: FormData): Promise<FormState> {
  const { user: me } = await requirePermission("manage_team");
  const password = String(form.get("password") ?? "");
  if (password.length < MIN_PASSWORD) return { error: `Password must be at least ${MIN_PASSWORD} characters` };
  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target) return { error: "User not found" };
  const version = target.sessionVersion + 1;
  await db.update(users).set({ passwordHash: await hashPassword(password), sessionVersion: version }).where(eq(users.id, userId));
  if (target.id === me.id) await startSession(me.id, version);
  return { ok: `Password reset. ${target.name} has been signed out everywhere.` };
}
