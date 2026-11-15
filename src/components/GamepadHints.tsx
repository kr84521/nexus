import { Gamepad2 } from "lucide-react";

const HINTS: [string, string][] = [
  ["A", "Abrir"],
  ["B", "Atrás"],
  ["X", "Jugar"],
  ["Y", "Favorito"],
  ["LB/RB", "Filtro"],
];

/** Barra de ayuda que aparece cuando hay un mando conectado. */
export function GamepadHints() {
  return (
    <div className="panel pointer-events-none fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-full border border-line px-4 py-1.5 text-xs text-muted shadow-xl">
      <Gamepad2 size={14} className="text-accent" />
      {HINTS.map(([btn, label]) => (
        <span key={btn} className="flex items-center gap-1.5">
          <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-fg">{btn}</kbd>
          {label}
        </span>
      ))}
    </div>
  );
}
