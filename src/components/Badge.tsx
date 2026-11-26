import { label } from "@/lib/format";

const TONES: Record<string, string> = {
  new: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  contacted: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  site_visit: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  estimate_sent: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  won: "bg-green-500/15 text-green-700 dark:text-green-300",
  lost: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
  scheduled: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  in_progress: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  completed: "bg-green-500/15 text-green-700 dark:text-green-300",
  cancelled: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
  draft: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
  sent: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  partial: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  paid: "bg-green-500/15 text-green-700 dark:text-green-300",
  void: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
  job_work: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  follow_up: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  other: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
  overdue: "bg-red-500/15 text-red-700 dark:text-red-300",
  approved: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  accepted: "bg-green-500/15 text-green-700 dark:text-green-300",
  declined: "bg-red-500/15 text-red-700 dark:text-red-300",
};

export function Badge({ value }: { value: string }) {
  return <span className={`pill ${TONES[value] ?? "bg-gray-500/15"}`}>{label(value)}</span>;
}
