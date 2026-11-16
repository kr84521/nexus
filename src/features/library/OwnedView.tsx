import { Clock, Download, ExternalLink, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { api, errorText } from "@/lib/api";
import { relativeTime } from "@/lib/art";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { toast } from "@/stores/toast";
import type { OwnedGame } from "@/types";

type Sort = "name" | "playtime" | "lastPlayed";

/** Juegos de tu cuenta de Steam que no están instalados: redescubrir e instalar. */
export function OwnedView() {
  const [games, setGames] = useState<OwnedGame[] | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [onlyPlayed, setOnlyPlayed] = useState(false);
  const hasKey = useSettings((s) => !!s.steamWebApiKey);
  const setPage = useLibrary((s) => s.setPage);

  useEffect(() => {
    api.steamOwnedNotInstalled().then(setGames).catch((e) => toast.error(errorText(e)));
  }, []);

  const visible = useMemo(() => {
    if (!games) return [];
    const term = q.trim().toLowerCase();
    return games
      .filter((g) => (!term || g.name.toLowerCase().includes(term)) && (!onlyPlayed || g.playtimeMin > 0))
      .sort((a, b) =>
        sort === "playtime"
          ? b.playtimeMin - a.playtimeMin || a.name.localeCompare(b.name)
          : sort === "lastPlayed"
            ? (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) || a.name.localeCompare(b.name)
            : a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
      );
  }, [games, q, sort, onlyPlayed]);

  const install = (g: OwnedGame) => {
    api.openPath(`steam://install/${g.appid}`).catch((e) => toast.error(errorText(e)));
    toast.info(`Steam abrirá la instalación de ${g.name}`);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 px-7 pt-2 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Steam · no instalados</h1>
        <span className="text-sm text-muted">{visible.length}</span>
        <div className="flex-1" />
        <label className="relative">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar…"
            className="focus-ring h-9 w-56 rounded-full border border-line bg-surface/70 pr-3 pl-9 text-sm placeholder:text-muted/70"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={onlyPlayed} onChange={(e) => setOnlyPlayed(e.target.checked)} className="accent-[var(--accent)]" />
          Solo jugados
        </label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="focus-ring h-9 appearance-none rounded-full border border-line bg-surface/70 px-3 text-sm text-fg"
        >
          <option value="name">Nombre</option>
          <option value="playtime">Más horas</option>
          <option value="lastPlayed">Jugado recientemente</option>
        </select>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-8">
        {!hasKey ? (
          <Empty text="Configura tu clave de la Web API de Steam en Ajustes y sincroniza para ver aquí los juegos que tienes comprados pero no instalados.">
            <Button variant="primary" onClick={() => setPage("settings")}>
              Ir a Ajustes
            </Button>
          </Empty>
        ) : games === null ? null : games.length === 0 ? (
          <Empty text="Todo lo que tienes en Steam está instalado, o aún no se ha sincronizado (Ajustes → Cuenta de Steam → Sincronizar)." />
        ) : (
          <div className="cover-grid">
            {visible.map((g) => (
              <div key={g.appid} className="group flex flex-col gap-2">
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-card bg-surface-2 shadow-md ring-1 ring-fg/8 transition group-hover:ring-accent/70">
                  <img
                    src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/library_600x900.jpg`}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                    onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
                  />
                  <span className="absolute inset-0 flex items-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-2 text-sm font-medium text-white opacity-0 transition group-hover:opacity-100">
                    {g.name}
                  </span>
                  <div className="absolute inset-x-0 bottom-0 flex translate-y-full justify-center gap-1.5 p-2 transition group-hover:translate-y-0">
                    <button onClick={() => install(g)} className="flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-fg shadow hover:brightness-110">
                      <Download size={12} /> Instalar
                    </button>
                    <button onClick={() => api.openPath(`steam://store/${g.appid}`)} className="rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80" title="Ver en Steam">
                      <ExternalLink size={12} />
                    </button>
                  </div>
                </div>
                <div className="px-0.5">
                  <div className="truncate text-[12.5px] text-fg/85">{g.name}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted">
                    <Clock size={11} />
                    {g.playtimeMin > 0 ? `${Math.round(g.playtimeMin / 60)} h` : "Sin jugar"}
                    {g.lastPlayed && <span>· {relativeTime(g.lastPlayed)}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Empty({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <p className="max-w-md text-sm text-muted">{text}</p>
      {children}
    </div>
  );
}
