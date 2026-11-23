import { changeMyPassword, updateMyName } from "@/app/auth-actions";
import { ActionForm } from "@/components/ActionForm";
import { label } from "@/lib/format";
import { ROLE_INFO, requireSession } from "@/lib/session";

export default async function AccountPage() {
  const { user, businesses } = await requireSession();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Your account</h1>
        <p className="text-sm text-muted">
          {user.email} · {label(user.role)}: {ROLE_INFO[user.role]}
        </p>
        {user.role !== "owner" && (
          <p className="mt-1 text-sm text-muted">
            Access: {businesses.length ? businesses.map((b) => b.name).join(", ") : "no businesses yet. Ask the owner."}
          </p>
        )}
      </div>
      <section className="card">
        <div className="card-title">Name</div>
        <ActionForm action={updateMyName} submit="Save" className="grid gap-3">
          <input className="input" name="name" defaultValue={user.name} required />
        </ActionForm>
      </section>
      <section className="card">
        <div className="card-title">Change password</div>
        <ActionForm action={changeMyPassword} submit="Change password" className="grid gap-3 sm:grid-cols-3" resetOnSuccess>
          <label className="field">Current password<input className="input" type="password" name="current" required autoComplete="current-password" /></label>
          <label className="field">New password<input className="input" type="password" name="password" minLength={8} required autoComplete="new-password" /></label>
          <label className="field">Confirm new password<input className="input" type="password" name="confirm" minLength={8} required autoComplete="new-password" /></label>
        </ActionForm>
      </section>
    </div>
  );
}
