import { GitMerge, Scissors } from "lucide-react";
import { useState } from "react";
import { StoreDot } from "@/app/Sidebar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { api, errorText } from "@/lib/api";
import { displayTitle } from "@/lib/art";
import { STORE_META } from "@/lib/stores";
import { useLibrary } from "@/stores/library";
import { toast } from "@/stores/toast";
import type { Game } from "@/types";

/** Instalaciones del juego: separar una en un juego propio o fusionar este juego con otro. */
export function SourcesPanel({ game }: { game: Game }) {
  const { games, upsert, select, load } = useLibrary();
  const [mergeOpen, setMergeOpen] = useState(false);
  const [q, setQ] = useState("");

  const split = async (sourceId: string) => {
    try {
      const created = await api.splitSource(sourceId);
      await load();
      select(created.id);
      toast.success(`${displayTitle(created)} separado`);
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const merge = async (other: Game) => {
    try {
      const merged = await api.mergeGames(game.id, other.id);
      await load();
      upsert(merged);
      setMergeOpen(false);
      toast.success(`${displayTitle(other)} fusionado en ${displayTitle(merged)}`);
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const term = q.trim().toLowerCase();
  const others = games
    .filter((g) => g.id !== game.id && (!term || displayTitle(g).toLowerCase().includes(term)))
    .slice(0, 30);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-fg/70">
      {game.sources.map((s) => (
        <span key={s.id} className="flex items-center gap-1.5 rounded-full border border-line bg-bg/40 py-1 pr-1.5 pl-2.5 backdrop-blur">
          <StoreDot store={s.store} size={7} /> {STORE_META[s.store].label}
          {game.sources.length > 1 && (
            <button onClick={() => split(s.id)} title="Separar en un juego propio" className="rounded-full p-0.5 text-muted hover:bg-fg/10 hover:text-fg">
              <Scissors size={11} />
            </button>
          )}
        </span>
      ))}
      <button
        onClick={() => setMergeOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-dashed border-line px-2.5 py-1 text-muted hover:border-accent hover:text-fg"
      >
        <GitMerge size={11} /> Fusionar con…
      </button>

      <Modal open={mergeOpen} onClose={() => setMergeOpen(false)} title={`Fusionar otro juego en "${displayTitle(game)}"`} width="max-w-md">
        <div className="flex flex-col gap-3 p-4">
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar juego…" />
          <p className="text-xs text-muted">Las instalaciones, el tiempo de juego y las colecciones del otro juego pasan a este.</p>
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {others.map((g) => (
              <li key={g.id}>
                <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={() => merge(g)}>
                  {g.sources.map((s) => (
                    <StoreDot key={s.id} store={s.store} size={7} />
                  ))}
                  <span className="truncate">{displayTitle(g)}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </div>
  );
}
