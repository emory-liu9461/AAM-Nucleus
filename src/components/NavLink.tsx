"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, exact, children, className = "" }: { href: string; exact?: boolean; children: React.ReactNode; className?: string }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${active ? "bg-bg font-semibold text-ink" : "text-muted hover:text-ink"} ${className}`}
    >
      {children}
    </Link>
  );
}
