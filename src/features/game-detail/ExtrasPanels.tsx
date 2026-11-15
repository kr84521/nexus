import { convertFileSrc } from "@tauri-apps/api/core";
import { ExternalLink, FolderOpen, Loader2, Lock, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { api, errorText } from "@/lib/api";
import { displayTitle, relativeTime } from "@/lib/art";
import type { Achievement, AchievementsReport, Game, NewsItem, Screenshot } from "@/types";

function useLoad<T>(open: boolean, key: string, fn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setData(null);
    setError(null);
    fn()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);
  return { data, error };
}

function Status({ error, loading, empty }: { error: string | null; loading: boolean; empty?: string }) {
  if (error) return <p className="p-6 text-center text-sm text-red-400">{error}</p>;
  if (loading)
    return (
      <p className="flex items-center justify-center gap-2 p-6 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Cargando…
      </p>
    );
  if (empty) return <p className="p-6 text-center text-sm text-muted">{empty}</p>;
  return null;
}

// ------------------------------------------------------------------ capturas

export function ScreenshotsPanel({ game, open, onClose }: { game: Game; open: boolean; onClose: () => void }) {
  const { data, error } = useLoad<Screenshot[]>(open, game.id, () => api.gameScreenshots(game.id));
  const [view, setView] = useState<Screenshot | null>(null);

  return (
    <Modal open={open} onClose={onClose} title={`Capturas · ${displayTitle(game)}`} width="max-w-5xl">
      <Status error={error} loading={!data} empty={data?.length === 0 ? "No hay capturas de Steam ni de la Game Bar para este juego." : undefined} />
      {data && data.length > 0 && (
        <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3 xl:grid-cols-4">
          {data.map((s) => (
            <button key={s.path} onClick={() => setView(s)} className="focus-ring group relative aspect-video overflow-hidden rounded-card bg-surface-2 ring-1 ring-line hover:ring-accent">
              <img src={convertFileSrc(s.path)} alt="" loading="lazy" className="size-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-[11px] text-white/90 opacity-0 transition group-hover:opacity-100">
                <span>{relativeTime(s.modified)}</span>
                <span>{s.source}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {view && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-6" onClick={() => setView(null)}>
          <img src={convertFileSrc(view.path)} alt="" className="max-h-full max-w-full rounded-card shadow-2xl" />
          <div className="absolute top-4 right-4 flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                api.openPath(view.path.replace(/[\\/][^\\/]+$/, ""));
              }}
              className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              title="Abrir carpeta"
            >
              <FolderOpen size={18} />
            </button>
            <button className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ novedades

export function NewsPanel({ game, open, onClose }: { game: Game; open: boolean; onClose: () => void }) {
  const { data, error } = useLoad<NewsItem[]>(open, game.id, () => api.gameNews(game.id));
  return (
    <Modal open={open} onClose={onClose} title={`Novedades · ${displayTitle(game)}`} width="max-w-2xl">
      <Status error={error} loading={!data} empty={data?.length === 0 ? "Sin noticias (solo disponible para juegos que están en Steam)." : undefined} />
      {data && data.length > 0 && (
        <ul className="divide-y divide-line/60">
          {data.map((n) => (
            <li key={n.url} className="px-5 py-4">
              <button onClick={() => api.openPath(n.url)} className="group flex w-full items-start justify-between gap-3 text-left">
                <span className="text-sm font-medium group-hover:text-accent">{n.title}</span>
                <ExternalLink size={14} className="mt-1 shrink-0 text-muted" />
              </button>
              <div className="mt-0.5 text-xs text-muted">
                {relativeTime(n.date)} · {n.feed}
              </div>
              {n.excerpt && <p className="mt-2 text-sm leading-relaxed text-fg/75 line-clamp-3">{n.excerpt}</p>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ logros

export function AchievementsPanel({ game, open, onClose }: { game: Game; open: boolean; onClose: () => void }) {
  const { data, error } = useLoad<AchievementsReport>(open, game.id, () => api.gameAchievements(game.id));
  const pct = data && data.total ? Math.round((data.unlocked / data.total) * 100) : 0;

  return (
    <Modal open={open} onClose={onClose} title={`Logros · ${displayTitle(game)}`} width="max-w-3xl">
      <Status error={error} loading={!data} empty={data?.total === 0 ? "Este juego no tiene logros de Steam." : undefined} />
      {data && data.total > 0 && (
        <div className="flex flex-col gap-4 p-5">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium">
                {data.unlocked} de {data.total} desbloqueados
              </span>
              <span className="tabular-nums text-muted">{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-fg/8">
              <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.items.map((a) => (
              <AchievementRow key={a.id} a={a} />
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

function AchievementRow({ a }: { a: Achievement }) {
  const secret = a.hidden && !a.unlocked;
  return (
    <li className={`flex items-center gap-3 rounded-card border border-line px-3 py-2 ${a.unlocked ? "" : "opacity-70"}`} title={a.description}>
      <span className="relative size-11 shrink-0 overflow-hidden rounded-md bg-surface-2">
        {!secret && <img src={a.unlocked ? a.icon : a.iconGray} alt="" className="size-full object-cover" loading="lazy" />}
        {secret && <Lock size={16} className="absolute inset-0 m-auto text-muted" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{secret ? "Logro oculto" : a.name}</span>
        <span className="block truncate text-xs text-muted">
          {secret ? "Desbloquéalo para ver los detalles" : a.description || " "}
        </span>
        <span className="mt-0.5 flex gap-2 text-[11px] text-muted">
          {a.unlocked && a.unlockTime && <span>{relativeTime(a.unlockTime)}</span>}
          {a.percent !== null && <span>{a.percent.toFixed(1)}% de jugadores</span>}
        </span>
      </span>
    </li>
  );
}
