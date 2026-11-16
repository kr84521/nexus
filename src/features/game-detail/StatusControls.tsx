import { Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, errorText } from "@/lib/api";
import { STATUS_META, STATUS_ORDER } from "@/lib/status";
import { useLibrary } from "@/stores/library";
import { toast } from "@/stores/toast";
import type { Game, GameStatus } from "@/types";

/** Estado del backlog, valoración con estrellas y notas (autoguardado). */
export function StatusControls({ game }: { game: Game }) {
  const upsert = useLibrary((s) => s.upsert);
  const [notes, setNotes] = useState(game.notes);
  const [hover, setHover] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => setNotes(game.notes), [game.id, game.notes]);

  const setStatus = async (status: GameStatus) => {
    try {
      upsert(await api.setStatus(game.id, status === game.status ? "none" : status));
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  const setRating = async (rating: number) => {
    try {
      upsert(await api.setRating(game.id, rating === game.rating ? 0 : rating));
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  const onNotes = (v: string) => {
    setNotes(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api.setNotes(game.id, v).then(upsert).catch((e) => toast.error(errorText(e)));
    }, 600);
  };

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_ORDER.map((s) => {
          const m = STATUS_META[s];
          const active = game.status === s;
          return (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`focus-ring flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                active ? "border-transparent text-white" : "border-line bg-bg/40 text-fg/70 backdrop-blur hover:text-fg"
              }`}
              style={active ? { background: m.color } : undefined}
            >
              <span className="size-1.5 rounded-full" style={{ background: active ? "white" : m.color }} />
              {m.label}
            </button>
          );
        })}
        <span className="mx-1 h-4 w-px bg-line" />
        <span className="flex items-center" onMouseLeave={() => setHover(0)} title="Tu valoración">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              className="focus-ring p-0.5 text-amber-400 transition hover:scale-110"
            >
              <Star size={16} fill={n <= (hover || game.rating) ? "currentColor" : "none"} className={n <= (hover || game.rating) ? "" : "text-fg/30"} />
            </button>
          ))}
        </span>
      </div>
      <textarea
        value={notes}
        onChange={(e) => onNotes(e.target.value)}
        placeholder="Notas: dónde te quedaste, qué build llevas, qué te falta…"
        rows={notes ? Math.min(6, notes.split("\n").length + 1) : 1}
        className="focus-ring w-full resize-none rounded-card border border-line/60 bg-bg/40 px-3 py-2 text-sm leading-relaxed backdrop-blur placeholder:text-muted/60"
      />
    </div>
  );
}
