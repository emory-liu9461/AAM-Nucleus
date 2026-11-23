"use client";

import { useActionState } from "react";
import { login, setupOwner } from "../auth-actions";
import { keepValuesOnSubmit } from "@/components/useKeepValues";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form onSubmit={keepValuesOnSubmit(action)} className="space-y-4">
      <label className="field">
        Email
        <input className="input" type="email" name="email" autoComplete="username" autoFocus required />
      </label>
      <label className="field">
        Password
        <input className="input" type="password" name="password" autoComplete="current-password" required />
      </label>
      {state?.error && <p className="text-sm text-bad">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      <p className="text-xs text-muted">Forgot your password? Ask the account owner to reset it.</p>
    </form>
  );
}

export function SetupForm() {
  const [state, action, pending] = useActionState(setupOwner, null);
  return (
    <form onSubmit={keepValuesOnSubmit(action)} className="space-y-3">
      <p className="rounded-lg bg-bg p-3 text-xs text-muted">
        First-time setup. Enter the <strong>setup code</strong> (the <code>OWNER_PASSWORD</code> value from your hosting
        settings), then choose the email and password you&apos;ll sign in with from now on.
      </p>
      <label className="field">Setup code<input className="input" type="password" name="setupCode" autoComplete="off" required /></label>
      <label className="field">Your name<input className="input" name="name" autoComplete="name" required /></label>
      <label className="field">Email<input className="input" type="email" name="email" autoComplete="username" required /></label>
      <label className="field">Password<input className="input" type="password" name="password" autoComplete="new-password" minLength={8} required /></label>
      <label className="field">Confirm password<input className="input" type="password" name="confirm" autoComplete="new-password" minLength={8} required /></label>
      {state?.error && <p className="text-sm text-bad">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Creating…" : "Create owner account"}</button>
    </form>
  );
}
