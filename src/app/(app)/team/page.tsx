import { redirect } from "next/navigation";
import { asc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Business, Role } from "@/db/schema";
import { createUser, resetUserPassword, setUserActive, updateUser } from "@/app/auth-actions";
import { ActionForm } from "@/components/ActionForm";
import { fmtDate, label } from "@/lib/format";
import { ROLE_INFO, can, homeFor, requireSession } from "@/lib/session";

const ROLES: Role[] = ["owner", "manager", "staff"];

export default async function TeamPage() {
  const session = await requireSession();
  if (!can(session.user, "manage_team")) redirect(homeFor(session));
  const [people, access] = await Promise.all([
    db.select().from(schema.users).orderBy(sql`${schema.users.active} desc`, asc(schema.users.role), asc(schema.users.name)),
    db.select().from(schema.userBusinesses),
  ]);
  const biz = session.businesses;
  const bizName = Object.fromEntries(biz.map((b) => [b.id, b]));
  const accessOf = (userId: string) => access.filter((a) => a.userId === userId).map((a) => a.businessId);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="text-sm text-muted">Give each person their own login. Removing someone never affects anyone else.</p>
      </div>

      <section className="card">
        <div className="card-title">Roles</div>
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r}>
              <dt className="font-medium">{label(r)}</dt>
              <dd className="text-muted">{ROLE_INFO[r]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <details className="card" open={people.length <= 1}>
        <summary className="cursor-pointer text-sm font-semibold">+ Add a person</summary>
        <ActionForm action={createUser} submit="Add person" className="mt-4 grid gap-3 sm:grid-cols-2" resetOnSuccess>
          <label className="field">Name<input className="input" name="name" required /></label>
          <label className="field">Email (their login)<input className="input" type="email" name="email" required /></label>
          <RoleSelect defaultValue="staff" />
          <label className="field">Temporary password<input className="input" name="password" minLength={8} required autoComplete="new-password" placeholder="At least 8 characters" /></label>
          <BusinessChecks businesses={biz} checked={biz.length === 1 ? [biz[0].id] : []} />
        </ActionForm>
      </details>

      <section className="space-y-3">
        {people.map((p) => {
          const mine = accessOf(p.id);
          const isMe = p.id === session.user.id;
          return (
            <details key={p.id} className={`card ${p.active ? "" : "opacity-60"}`}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{p.name}</span>
                  {isMe && <span className="ml-1 text-xs text-muted">(you)</span>}
                  <span className="ml-2 text-xs text-muted">{p.email}</span>
                </span>
                <span className="pill bg-accent/15 text-accent">{label(p.role)}</span>
                <span className="flex gap-1">
                  {p.role === "owner" ? (
                    <span className="text-xs text-muted">All businesses</span>
                  ) : (
                    mine.map((id) => bizName[id] && (
                      <span key={id} className="flex items-center gap-1 text-xs text-muted">
                        <span className="h-2 w-2 rounded-full" style={{ background: bizName[id].color }} />
                        {bizName[id].name}
                      </span>
                    ))
                  )}
                </span>
                <span className="text-xs text-muted">{p.active ? (p.lastLoginAt ? `Last sign-in ${fmtDate(p.lastLoginAt)}` : "Never signed in") : "Deactivated"}</span>
              </summary>

              <div className="mt-4 space-y-5 border-t border-line pt-4">
                <ActionForm action={updateUser.bind(null, p.id)} submit="Save changes" className="grid gap-3 sm:grid-cols-2">
                  <label className="field">Name<input className="input" name="name" defaultValue={p.name} required /></label>
                  <RoleSelect defaultValue={p.role} />
                  <BusinessChecks businesses={biz} checked={mine} />
                </ActionForm>

                <ActionForm action={resetUserPassword.bind(null, p.id)} submit="Set new password" className="grid gap-3 sm:grid-cols-2">
                  <label className="field">New password for {p.name}<input className="input" name="password" minLength={8} required autoComplete="new-password" /></label>
                  <p className="self-end text-xs text-muted">Signs them out of every device. Share the new password with them.</p>
                </ActionForm>

                {!isMe && (
                  <form action={setUserActive.bind(null, p.id, !p.active)}>
                    <button className="btn-ghost">{p.active ? "Deactivate (remove access)" : "Reactivate"}</button>
                    <span className="ml-3 text-xs text-muted">
                      {p.active ? "They're signed out immediately. Their records stay." : "They can sign in again with their existing password."}
                    </span>
                  </form>
                )}
              </div>
            </details>
          );
        })}
      </section>
    </div>
  );
}

function RoleSelect({ defaultValue }: { defaultValue: Role }) {
  return (
    <label className="field">
      Role
      <select className="input" name="role" defaultValue={defaultValue}>
        {ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
      </select>
    </label>
  );
}

function BusinessChecks({ businesses, checked }: { businesses: Business[]; checked: string[] }) {
  return (
    <fieldset className="field sm:col-span-2">
      <legend className="mb-1">Business access <span className="font-normal">(owners automatically see all)</span></legend>
      <div className="flex flex-wrap gap-3">
        {businesses.map((b) => (
          <label key={b.id} className="flex items-center gap-2 text-sm font-normal text-ink">
            <input type="checkbox" name="businessIds" value={b.id} defaultChecked={checked.includes(b.id)} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
            {b.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
