"use client";

/** Opens the browser's print dialog (choose "Save as PDF" to get a PDF). */
export function PrintButton({ label = "Print / save as PDF" }: { label?: string }) {
  return <button type="button" className="btn" onClick={() => window.print()}>{label}</button>;
}
