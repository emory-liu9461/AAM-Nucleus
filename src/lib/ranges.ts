export type RangeKey = "30d" | "mtd" | "qtd" | "ytd" | "12m" | "all";

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: "30d", label: "Last 30 days" },
  { key: "mtd", label: "Month to date" },
  { key: "qtd", label: "Quarter to date" },
  { key: "ytd", label: "Year to date" },
  { key: "12m", label: "Last 12 months" },
  { key: "all", label: "All time" },
];
