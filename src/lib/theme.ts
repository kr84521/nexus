// Sistema de temas: un objeto Theme se traduce a variables CSS en :root.
// Todos los componentes usan esas variables (vía clases de Tailwind definidas en styles.css),
// así que cualquier cambio se aplica en vivo.

export type FontChoice = "inter" | "grotesk" | "system";
export type PresetId = "midnight" | "oled" | "slate" | "light";

export interface Palette {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  muted: string;
}

export interface Theme {
  preset: PresetId;
  palette: Palette;
  accent: string;
  font: FontChoice;
  /** Radio de esquinas en px */
  radius: number;
  /** Ancho de portada en la cuadrícula en px */
  coverWidth: number;
  /** Separación de la cuadrícula en px */
  gap: number;
  showTitles: boolean;
  showStoreBadges: boolean;
  /** Fondo de la biblioteca con el héroe del juego bajo el cursor */
  dynamicBackground: boolean;
  /** Desenfoque del héroe en px (0-60) */
  heroBlur: number;
  /** Oscurecimiento del héroe en % (0-90) */
  heroDim: number;
  /** Paneles con efecto cristal */
  glass: boolean;
  animations: boolean;
  /** Usar el color dominante de la portada como acento en la ficha */
  gameAccent: boolean;
  /** Reproducir el tráiler de fondo en la ficha */
  trailers: boolean;
  /** Disposición de la biblioteca */
  layout: "grid" | "rows";
}

export const PRESETS: Record<PresetId, { label: string; palette: Palette; accent: string }> = {
  midnight: {
    label: "Medianoche",
    accent: "#7c5cff",
    palette: {
      bg: "#0b0d12",
      surface: "#12151c",
      surface2: "#1a1e28",
      border: "#252a36",
      text: "#eef0f6",
      muted: "#8a90a2",
    },
  },
  oled: {
    label: "OLED",
    accent: "#22d3ee",
    palette: {
      bg: "#000000",
      surface: "#0a0a0a",
      surface2: "#141414",
      border: "#1f1f1f",
      text: "#f5f5f5",
      muted: "#8a8a8a",
    },
  },
  slate: {
    label: "Pizarra",
    accent: "#f97316",
    palette: {
      bg: "#1b1f27",
      surface: "#232833",
      surface2: "#2c3240",
      border: "#3a4152",
      text: "#e8ebf2",
      muted: "#9aa1b3",
    },
  },
  light: {
    label: "Claro",
    accent: "#4f46e5",
    palette: {
      bg: "#f3f4f8",
      surface: "#ffffff",
      surface2: "#e9ebf2",
      border: "#d9dce6",
      text: "#141824",
      muted: "#5f6678",
    },
  },
};

export const ACCENTS = ["#7c5cff", "#22d3ee", "#f97316", "#ef4444", "#22c55e", "#eab308", "#ec4899", "#4f46e5", "#e5e7eb"];

export const DEFAULT_THEME: Theme = {
  preset: "midnight",
  palette: PRESETS.midnight.palette,
  accent: PRESETS.midnight.accent,
  font: "inter",
  radius: 12,
  coverWidth: 184,
  gap: 22,
  showTitles: true,
  showStoreBadges: true,
  dynamicBackground: true,
  heroBlur: 28,
  heroDim: 62,
  glass: true,
  animations: true,
  gameAccent: true,
  trailers: true,
  layout: "grid",
};

const FONTS: Record<FontChoice, string> = {
  inter: `"Inter Variable", system-ui, sans-serif`,
  grotesk: `"Space Grotesk Variable", system-ui, sans-serif`,
  system: `"Segoe UI Variable", "Segoe UI", system-ui, sans-serif`,
};

/** Texto legible (negro o blanco) sobre un color dado. */
export function contrastText(hex: string): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? "#0b0d12" : "#ffffff";
}

export function isLight(p: Palette): boolean {
  return contrastText(p.bg) === "#0b0d12";
}

export function applyTheme(t: Theme) {
  const s = document.documentElement.style;
  const p = t.palette;
  s.setProperty("--bg", p.bg);
  s.setProperty("--surface", p.surface);
  s.setProperty("--surface-2", p.surface2);
  s.setProperty("--border", p.border);
  s.setProperty("--text", p.text);
  s.setProperty("--muted", p.muted);
  s.setProperty("--accent", t.accent);
  s.setProperty("--accent-fg", contrastText(t.accent));
  s.setProperty("--radius", `${t.radius}px`);
  s.setProperty("--cover-w", `${t.coverWidth}px`);
  s.setProperty("--gap", `${t.gap}px`);
  s.setProperty("--hero-blur", `${t.heroBlur}px`);
  s.setProperty("--hero-dim", `${t.heroDim / 100}`);
  s.setProperty("--font", FONTS[t.font]);
  s.setProperty("color-scheme", isLight(p) ? "light" : "dark");
  document.documentElement.dataset.glass = String(t.glass);
  document.documentElement.dataset.motion = String(t.animations);
}

/** Mezcla un tema guardado con los valores por defecto (por si faltan claves de versiones anteriores). */
export function normalizeTheme(raw: unknown): Theme {
  if (!raw || typeof raw !== "object") return DEFAULT_THEME;
  const r = raw as Partial<Theme>;
  return { ...DEFAULT_THEME, ...r, palette: { ...DEFAULT_THEME.palette, ...(r.palette ?? {}) } };
}
