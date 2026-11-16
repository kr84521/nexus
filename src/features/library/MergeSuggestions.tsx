import { GitMerge, X } from "lucide-react";
import { useEffect, useState } from "react";
import { StoreDot } from "@/app/Sidebar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { api, errorText } from "@/lib/api";
import { artSrc, displayTitle } from "@/lib/art";
import { useLibrary } from "@/stores/library";
import { toast } from "@/stores/toast";
import type { Game } from "@/types";

interface Pair {
  a: Game;
  b: Game;
}

/** Posibles duplicados entre tiendas: aviso en la biblioteca + modal para fusionar o ignorar. */
export function useMergeSuggestions() {
  const games = useLibrary((s) => s.games);
  const [pairs, setPairs] = useState<Pair[]>([]);

  useEffect(() => {
    if (games.length === 0) return;
    api
      .mergeSuggestions()
      .then((list) => {
        const byId = new Map(games.map((g) => [g.id, g]));
        setPairs(list.flatMap((p) => (byId.has(p.a) && byId.has(p.b) ? [{ a: byId.get(p.a)!, b: byId.get(p.b)! }] : [])));
      })
      .catch(() => setPairs([]));
  }, [games]);

  return pairs;
}

export function MergeSuggestionsBanner({ pairs, onReview }: { pairs: Pair[]; onReview: () => void }) {
  if (pairs.length === 0) return null;
  return (
    <button
      onClick={onReview}
      className="mx-7 mb-3 flex items-center gap-3 rounded-card border border-accent/40 bg-accent/10 px-4 py-2 text-left text-sm hover:bg-accent/15"
    >
      <GitMerge size={16} className="text-accent" />
      <span className="flex-1">
        {pairs.length === 1 ? "Hay un posible duplicado" : `Hay ${pairs.length} posibles duplicados`} entre tiendas (el mismo juego dos veces).
      </span>
      <span className="font-medium text-accent">Revisar</span>
    </button>
  );
}

export function MergeSuggestionsModal({ pairs, open, onClose }: { pairs: Pair[]; open: boolean; onClose: () => void }) {
  const load = useLibrary((s) => s.load);
  const [busy, setBusy] = useState(false);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());

  const merge = async (p: Pair) => {
    setBusy(true);
    try {
      // Se conserva el que tenga más datos del usuario (horas, arte); el otro se fusiona en él.
      const score = (g: Game) => g.playtimeSecs * 10 + (g.artwork.cover ? 5 : 0) + g.playCount;
      const [into, from] = score(p.a) >= score(p.b) ? [p.a, p.b] : [p.b, p.a];
      await api.mergeGames(into.id, from.id);
      await load();
      toast.success(`${displayTitle(from)} fusionado en ${displayTitle(into)}`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const ignore = async (p: Pair) => {
    const key = `${p.a.id}|${p.b.id}`;
    const next = new Set(ignored).add(key);
    setIgnored(next);
    try {
      const settings = await api.getSettings();
      const prev = Array.isArray(settings.ignoredMergePairs) ? (settings.ignoredMergePairs as string[]) : [];
      await api.setSetting("ignoredMergePairs", Array.from(new Set([...prev, key])));
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const visible = pairs.filter((p) => !ignored.has(`${p.a.id}|${p.b.id}`));

  return (
    <Modal open={open} onClose={onClose} title="Posibles duplicados" width="max-w-2xl">
      <div className="flex flex-col gap-3 p-5">
        <p className="text-sm text-muted">
          Estos juegos parecen el mismo en tiendas distintas. Al fusionar, las instalaciones, horas y colecciones se juntan en
          una sola ficha y podrás elegir con qué tienda jugar.
        </p>
        {visible.length === 0 && <p className="py-6 text-center text-sm text-muted">No queda nada por revisar.</p>}
        {visible.map((p) => (
          <div key={`${p.a.id}|${p.b.id}`} className="flex items-center gap-3 rounded-card border border-line p-3">
            <Side g={p.a} />
            <GitMerge size={18} className="shrink-0 text-muted" />
            <Side g={p.b} />
            <div className="flex shrink-0 flex-col gap-1.5">
              <Button variant="primary" size="sm" onClick={() => merge(p)} disabled={busy}>
                Fusionar
              </Button>
              <Button size="sm" onClick={() => ignore(p)} disabled={busy}>
                <X size={13} /> No son el mismo
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function Side({ g }: { g: Game }) {
  const cover = artSrc(g, "cover");
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <span className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-surface-2">{cover && <img src={cover} alt="" className="size-full object-cover" />}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{displayTitle(g)}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          {g.sources.map((s) => (
            <StoreDot key={s.id} store={s.store} size={7} />
          ))}
          {g.playtimeSecs > 0 && `${Math.round(g.playtimeSecs / 3600)} h`}
        </span>
      </span>
    </div>
  );
}
