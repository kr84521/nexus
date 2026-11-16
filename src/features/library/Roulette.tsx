import { Dices, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { artSrc, displayTitle } from "@/lib/art";
import { useLibrary } from "@/stores/library";
import type { Game } from "@/types";
import { FallbackCover } from "./GameCard";

type Pool = "all" | "backlog" | "favorites" | "unplayed";

/** "¿A qué juego hoy?": elige un juego al azar con una animación de ruleta. */
export function Roulette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const games = useLibrary((s) => s.games);
  const launch = useLibrary((s) => s.launch);
  const select = useLibrary((s) => s.select);
  const [pool, setPool] = useState<Pool>("all");
  const [current, setCurrent] = useState<Game | null>(null);
  const [spinning, setSpinning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const candidates = games.filter((g) => {
    if (g.hidden || g.status === "completed" || g.status === "dropped") return false;
    if (pool === "backlog") return g.status === "backlog";
    if (pool === "favorites") return g.favorite;
    if (pool === "unplayed") return !g.lastPlayed && g.playtimeSecs === 0;
    return true;
  });

  const spin = () => {
    if (candidates.length === 0 || spinning) return;
    setSpinning(true);
    const winner = candidates[Math.floor(Math.random() * candidates.length)];
    // Pasa rápido por portadas al azar y va frenando hasta pararse en el ganador.
    let step = 0;
    const total = 18 + Math.floor(Math.random() * 6);
    const tick = () => {
      step++;
      if (step >= total) {
        setCurrent(winner);
        setSpinning(false);
        return;
      }
      setCurrent(candidates[Math.floor(Math.random() * candidates.length)]);
      timer.current = setTimeout(tick, 60 + Math.pow(step / total, 2.2) * 420);
    };
    tick();
  };

  useEffect(() => {
    if (open) {
      setCurrent(null);
      const t = setTimeout(spin, 250);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pool]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const cover = current ? artSrc(current, "cover") : null;

  return (
    <Modal open={open} onClose={onClose} title="¿A qué juego hoy?" width="max-w-md">
      <div className="flex flex-col items-center gap-5 p-6">
        <div className="flex gap-1 rounded-full border border-line p-1 text-xs">
          {(
            [
              ["all", "Todos"],
              ["backlog", "Pendientes"],
              ["favorites", "Favoritos"],
              ["unplayed", "Sin jugar"],
            ] as [Pool, string][]
          ).map(([p, label]) => (
            <button
              key={p}
              onClick={() => setPool(p)}
              className={`rounded-full px-3 py-1 transition ${pool === p ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={`aspect-[2/3] w-56 overflow-hidden rounded-card bg-surface-2 shadow-2xl ring-1 ring-line transition ${spinning ? "scale-95 blur-[1px]" : "scale-100"}`}>
          {current ? (
            cover ? (
              <img src={cover} alt="" className="size-full object-cover" />
            ) : (
              <FallbackCover title={displayTitle(current)} large />
            )
          ) : (
            <div className="flex size-full items-center justify-center text-muted">
              <Dices size={40} />
            </div>
          )}
        </div>

        <div className="min-h-7 text-center text-lg font-semibold">
          {candidates.length === 0 ? <span className="text-sm text-muted">No hay juegos en este grupo</span> : current && !spinning ? displayTitle(current) : "…"}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={spin} disabled={spinning || candidates.length === 0}>
            <Dices size={16} /> Otra vez
          </Button>
          <Button
            variant="outline"
            disabled={spinning || !current}
            onClick={() => {
              if (!current) return;
              onClose();
              select(current.id);
            }}
          >
            Ver ficha
          </Button>
          <Button
            variant="primary"
            disabled={spinning || !current}
            onClick={() => {
              if (!current) return;
              onClose();
              launch(current.id);
            }}
          >
            <Play size={16} fill="currentColor" /> Jugar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
