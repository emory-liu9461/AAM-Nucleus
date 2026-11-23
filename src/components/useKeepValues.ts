"use client";

import { startTransition } from "react";

/**
 * React 19 clears a form after its action runs, which wipes what someone typed
 * when the server returns an error. Submitting via onSubmit keeps the values.
 */
export function keepValuesOnSubmit(dispatch: (form: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  };
}
