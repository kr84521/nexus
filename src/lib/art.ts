import { convertFileSrc } from "@tauri-apps/api/core";
import type { ArtKind, Game } from "@/types";

/** URL servible por el webview para una imagen de arte local (con cache-busting). */
export function artSrc(game: Game, kind: ArtKind): string | null {
  const path = game.artwork[kind];
  if (!path) return null;
  return `${convertFileSrc(path)}?v=${game.artworkVersion}`;
}

export function displayTitle(game: Game): string {
  return game.customTitle || game.title;
}

/** Color estable derivado del título, para portadas de reserva. */
export function titleHue(title: string): number {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) % 360;
  return h;
}

export function relativeTime(ms: number | null): string {
  if (!ms) return "Nunca";
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60000);
  if (min < 1) return "Ahora mismo";
  if (min < 60) return `Hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `Hace ${d} ${d === 1 ? "día" : "días"}`;
  return new Date(ms).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}
