"use client";

import { useState } from "react";

/** A small "Copy link" button (for tables where a full copy field doesn't fit). */
export function CopyButton({ value, label = "Copy link", className = "btn-ghost py-1 text-xs" }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      title={value}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt("Copy this link:", value);
        }
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
