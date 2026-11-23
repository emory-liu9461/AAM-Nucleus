"use client";

import { useActionState } from "react";
import { login } from "../actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={action} className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <h1 className="text-xl font-semibold">Nucleus</h1>
          <p className="text-sm text-muted">Sign in to your dashboard</p>
        </div>
        <label className="field">
          Password
          <input className="input" type="password" name="password" autoFocus required />
        </label>
        {state?.error && <p className="text-sm text-bad">{state.error}</p>}
        <button className="btn w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
