// The public quote form always renders in the light theme so it matches
// customer-facing websites, even when the visitor's device is in dark mode.
const LIGHT = `:root{color-scheme:light;--bg:#f6f7f9;--panel:#ffffff;--ink:#111827;--muted:#6b7280;--line:#e5e7eb;--good:#15803d;--bad:#b91c1c}
html:has(main.embedded),html:has(main.embedded) body{background:transparent}`;

export default function PublicFormLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LIGHT }} />
      {children}
    </>
  );
}
