/** Nucleus wordmark. Swaps to the white version in dark mode. */
export function Logo({ className = "h-8" }: { className?: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/nucleus-logo.svg" alt="Nucleus" className={`${className} w-auto dark:hidden`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/nucleus-logo-white.svg" alt="Nucleus" className={`${className} hidden w-auto dark:block`} />
    </>
  );
}
