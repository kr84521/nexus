import { Play, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { StoreDot } from "@/app/Sidebar";
import { artSrc, displayTitle, formatPlaytime } from "@/lib/art";
import { useLibrary } from "@/stores/library";
import type { Game } from "@/types";

/** Puntuación de coincidencia: menor es mejor; null si no coincide. */
function score(title: string, q: string): number | null {
  const t = title.toLowerCase();
  if (t.startsWith(q)) return 0;
  if (t.split(/[\s:\-–]+/).some((w) => w.startsWith(q))) return 1;
  if (t.includes(q)) return 2;
  // Subsecuencia (p. ej. "cp77" → "Cyberpunk 2077")
  let i = 0;
  for (const c of t) if (c === q[i]) i++;
  return i === q.length ? 3 : null;
}

/** Búsqueda rápida (Ctrl+K / atajo global): escribe y Enter lanza el juego. */
export function CommandPalette() {
  const open = useLibrary((s) => s.paletteOpen);
  const setOpen = useLibrary((s) => s.setPaletteOpen);
  const games = useLibrary((s) => s.games);
  const launch = useLibrary((s) => s.launch);
  const select = useLibrary((s) => s.select);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo<Game[]>(() => {
    const term = q.trim().toLowerCase();
    const pool = games.filter((g) => !g.hidden);
    if (!term) {
      return pool
        .filter((g) => g.lastPlayed)
        .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
        .slice(0, 8);
    }
    return pool
      .map((g) => ({ g, s: score(displayTitle(g), term) }))
      .filter((x): x is { g: Game; s: number } => x.s !== null)
      .sort((a, b) => a.s - b.s || (b.g.lastPlayed ?? 0) - (a.g.lastPlayed ?? 0))
      .slice(0, 10)
      .map((x) => x.g);
  }, [games, q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setCursor(0), [q]);

  const close = () => setOpen(false);
  const run = (g: Game | undefined, detail = false) => {
    if (!g) return;
    close();
    if (detail) select(g.id);
    else launch(g.id);
  };

  const onKey = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        run(results[cursor], e.shiftKey);
        break;
      case "Tab":
        e.preventDefault();
        run(results[cursor], true);
        break;
      case "Escape":
        close();
        break;
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[55] flex items-start justify-center bg-black/50 pt-[14vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
          <motion.div
            data-modal
            className="panel w-full max-w-xl overflow-hidden rounded-[calc(var(--radius)+6px)] border border-line shadow-2xl"
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.14 }}
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search size={18} className="text-muted" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder="Escribe el nombre de un juego…"
                className="h-13 w-full bg-transparent py-4 text-base outline-none placeholder:text-muted/70"
              />
              <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[10px] text-muted">Esc</kbd>
            </div>
            <ul className="max-h-[52vh] overflow-y-auto p-2">
              {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Sin resultados</li>}
              {results.map((g, i) => {
                const cover = artSrc(g, "cover");
                return (
                  <li key={g.id}>
                    <button
                      onMouseEnter={() => setCursor(i)}
                      onClick={(e) => run(g, e.shiftKey)}
                      className={`flex w-full items-center gap-3 rounded-card px-2.5 py-2 text-left transition ${
                        i === cursor ? "bg-accent/16" : "hover:bg-fg/6"
                      }`}
                    >
                      <span className="h-12 w-8 shrink-0 overflow-hidden rounded-md bg-surface-2">
                        {cover && <img src={cover} alt="" className="size-full object-cover" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{displayTitle(g)}</span>
                        <span className="flex items-center gap-2 text-xs text-muted">
                          {g.sources.map((s) => (
                            <StoreDot key={s.id} store={s.store} size={6} />
                          ))}
                          {g.playtimeSecs > 0 && <span>{formatPlaytime(g.playtimeSecs)}</span>}
                        </span>
                      </span>
                      {i === cursor && (
                        <span className="flex items-center gap-1 text-xs text-accent">
                          <Play size={12} fill="currentColor" /> Enter
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex gap-4 border-t border-line px-4 py-2 text-[11px] text-muted">
              <span>↑↓ moverse</span>
              <span>Enter jugar</span>
              <span>Tab / Shift+Enter ficha</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
