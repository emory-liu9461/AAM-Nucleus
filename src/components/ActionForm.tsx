"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/auth-actions";
import { keepValuesOnSubmit } from "./useKeepValues";

/** A form whose server action returns { error } or { ok }, shown under the fields. */
export function ActionForm({
  action,
  submit,
  pendingText = "Saving…",
  className = "",
  children,
  resetOnSuccess = false,
  confirm,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  submit: string;
  pendingText?: string;
  className?: string;
  children: React.ReactNode;
  resetOnSuccess?: boolean;
  confirm?: string; // ask "are you sure?" before submitting
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form onSubmit={(e) => { if (confirm && !window.confirm(confirm)) { e.preventDefault(); return; } keepValuesOnSubmit(formAction)(e); }} className={className} key={resetOnSuccess && state?.ok ? state.ok : undefined}>
      {children}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-full">
        <button className="btn" disabled={pending}>
          {pending ? pendingText : submit}
        </button>
        {state?.error && <p className="text-sm text-bad">{state.error}</p>}
        {state?.ok && <p className="text-sm text-good">{state.ok}</p>}
      </div>
    </form>
  );
}
