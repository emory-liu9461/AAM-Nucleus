import glyphs from "./logo-glyphs.json";

/*
 * Arcus logos drawn from a business name: "Arcus Maintenance Suite" -> the keystone arch,
 * ARCUS, and MAINTENANCE SUITE underneath. Same geometry and lettering (Montserrat Bold /
 * SemiBold, as outlines) as the files in public/brand/arcus, so generated and ready-made
 * logos match. KEEP IN SYNC with src/lib/arcus-logo.ts (Nucleus).
 */

export type LogoVariant = "horizontal" | "white" | "stacked" | "mark";
export const LOGO_VARIANTS: LogoVariant[] = ["horizontal", "white", "stacked", "mark"];

const INK = "#1C2B3A";
type Font = { upm: number; g: Record<string, [number, string]> };
const FONTS = glyphs as unknown as Record<"700" | "600", Font>;

/** "Arcus Maintenance Suite" -> { word: "ARCUS", sub: "MAINTENANCE SUITE" }. Unknown characters are dropped. */
export function splitName(name: string) {
  const clean = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 &\-'.,/+]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const [word, ...rest] = clean.split(" ");
  return { word: word || "ARCUS", sub: rest.join(" ").slice(0, 40) };
}

/** Text as outlined paths, and its width. track is extra spacing in em (as in the build script). */
function text(weight: "700" | "600", s: string, size: number, track = 0) {
  const f = FONTS[weight];
  const k = size / f.upm;
  let x = 0;
  const parts: string[] = [];
  for (const ch of s) {
    const g = f.g[ch];
    if (!g) continue;
    if (g[1]) parts.push(`<path transform="translate(${(x * k).toFixed(2)} 0) scale(${k.toFixed(5)} ${(-k).toFixed(5)})" d="${g[1]}"/>`);
    x += g[0] + track * f.upm;
  }
  return { svg: parts.join(""), width: (x - track * f.upm) * k };
}

const at = (x: number, y: number, fill: string, inner: string) => `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" fill="${fill}">${inner}</g>`;
const doc = (w: number, h: number, body: string, title: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>`;

/** Semicircular arch of 7 stones on two piers; the keystone takes the accent colour. Drawn in a 120 x 100 box. */
function arch(ox: number, oy: number, scale: number, stone: string, key: string) {
  const cx = 60, cy = 58, R = 56, r = 34, gap = 2.2, n = 7;
  const rad = (a: number) => (a * Math.PI) / 180;
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = 180 - (i * 180) / n - (i === 0 ? 0 : gap / 2);
    const a1 = 180 - ((i + 1) * 180) / n + (i === n - 1 ? 0 : gap / 2);
    const Ro = R + (i === Math.floor(n / 2) ? 5 : 0);
    const pts = [
      [cx + Ro * Math.cos(rad(a0)), cy - Ro * Math.sin(rad(a0))],
      [cx + Ro * Math.cos(rad(a1)), cy - Ro * Math.sin(rad(a1))],
      [cx + r * Math.cos(rad(a1)), cy - r * Math.sin(rad(a1))],
      [cx + r * Math.cos(rad(a0)), cy - r * Math.sin(rad(a0))],
    ];
    parts.push(`<path d="M${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L")}Z" fill="${i === Math.floor(n / 2) ? key : stone}"/>`);
  }
  const w = R - r;
  parts.push(`<rect x="${(cx - R).toFixed(1)}" y="${(cy + gap).toFixed(1)}" width="${w}" height="${(100 - cy - gap).toFixed(1)}" fill="${stone}"/>`);
  parts.push(`<rect x="${(cx + r).toFixed(1)}" y="${(cy + gap).toFixed(1)}" width="${w}" height="${(100 - cy - gap).toFixed(1)}" fill="${stone}"/>`);
  return `<g transform="translate(${ox.toFixed(1)} ${oy.toFixed(1)}) scale(${scale})">${parts.join("")}</g>`;
}

/** A lighter version of the accent for dark backgrounds. */
export function onDark(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#F0A24E";
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.35);
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
}

/** The SVG for a business name, in one variant. accent = keystone and second-line colour. */
export function arcusLogo(name: string, accent: string, variant: LogoVariant = "horizontal") {
  const { word, sub } = splitName(name);
  const title = name.replace(/[<>&"]/g, "");
  const dark = onDark(accent);
  if (variant === "mark") {
    const s = 3.1;
    return doc(512, 512, `<rect width="512" height="512" rx="112" fill="${INK}"/>` + arch((512 - 120 * s) / 2, (512 - 100 * s) / 2 + 8, s, "#FFFFFF", dark), title);
  }
  const W = text("700", word, 62, 0.12);
  if (variant === "stacked") {
    const S = sub ? text("600", sub, 17.2, 0.36) : null;
    const w = Math.max(W.width, S?.width ?? 0) + 8;
    let body = arch((w - 120 * 1.1) / 2, 0, 1.1, INK, accent) + at((w - W.width) / 2, 172, INK, W.svg);
    if (S) body += at((w - S.width) / 2, 202, accent, S.svg);
    return doc(w, S ? 210 : 180, body, title);
  }
  const white = variant === "white";
  const ink = white ? "#FFFFFF" : INK;
  const key = white ? dark : accent;
  const x = 128;
  if (!sub) return doc(x + W.width + 6, 96, arch(0, 4, 0.88, ink, key) + at(x, 75, ink, W.svg), title);
  const S = text("600", sub, 22, 0.22);
  return doc(x + Math.max(W.width, S.width) + 6, 96, arch(0, 4, 0.88, ink, key) + at(x, 58, ink, W.svg) + at(x + 2, 92, key, S.svg), title);
}

/** Short hash so a logo URL changes when the name or colour does (busts browser caches). */
export function logoVersion(name: string, accent: string) {
  let h = 0;
  for (const ch of `${name}|${accent}`) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}
