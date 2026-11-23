import type { transcript } from "@/lib/assistant";

/** Chat bubbles for an AI-assistant conversation. */
export function Transcript({ lines }: { lines: ReturnType<typeof transcript> }) {
  return (
    <div className="mt-3 space-y-2 rounded-lg bg-bg p-3 text-sm">
      {lines.map((l, i) =>
        l.role === "event" ? (
          <p key={i} className="text-center text-xs font-medium text-muted">{l.text}</p>
        ) : (
          <div key={i} className={`flex ${l.role === "customer" ? "justify-end" : ""}`}>
            <p className={`max-w-[80%] whitespace-pre-wrap rounded-xl px-3 py-2 ${l.role === "customer" ? "bg-accent text-white" : "border border-line bg-panel"}`}>{l.text}</p>
          </div>
        ),
      )}
    </div>
  );
}
