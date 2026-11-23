"use client";

import { useState } from "react";

export function CopyField({ value, multiline = false }: { value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the text is selectable */
    }
  };
  return (
    <div className="flex items-start gap-2">
      {multiline ? (
        <pre className="input min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-xs">{value}</pre>
      ) : (
        <input className="input min-w-0 flex-1 font-mono text-xs" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
      )}
      <button type="button" className="btn-ghost shrink-0" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
    </div>
  );
}
