import type { GameStatus } from "@/types";

export const STATUS_META: Record<GameStatus, { label: string; color: string }> = {
  none: { label: "Sin estado", color: "#8a90a2" },
  backlog: { label: "Pendiente", color: "#6366f1" },
  playing: { label: "Jugando", color: "#22c55e" },
  completed: { label: "Terminado", color: "#f59e0b" },
  dropped: { label: "Abandonado", color: "#ef4444" },
};

/** Estados seleccionables (sin "none"). */
export const STATUS_ORDER: GameStatus[] = ["backlog", "playing", "completed", "dropped"];
