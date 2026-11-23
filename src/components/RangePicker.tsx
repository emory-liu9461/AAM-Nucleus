"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RANGES } from "@/lib/ranges";

export function RangePicker({ value }: { value: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <select
      className="input w-auto"
      value={value}
      onChange={(e) => {
        const p = new URLSearchParams(params);
        p.set("range", e.target.value);
        router.push(`${path}?${p}`);
      }}
    >
      {RANGES.map((r) => (
        <option key={r.key} value={r.key}>
          {r.label}
        </option>
      ))}
    </select>
  );
}
