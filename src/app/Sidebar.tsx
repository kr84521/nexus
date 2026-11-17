import { Activity, ArrowUpCircle, Clock, CloudDownload, EyeOff, FolderPlus, LayoutGrid, Plus, RefreshCw, Search, Settings, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { STATUS_META, STATUS_ORDER } from "@/lib/status";
import { STORE_META, STORE_ORDER } from "@/lib/stores";
import { useLibrary, type Filter } from "@/stores/library";
import { useUpdate } from "@/stores/update";
import type { Store } from "@/types";
import { AddGameModal } from "@/features/library/AddGameModal";

export function Sidebar() {
  const { games, collections, filter, page, scanning, setFilter, setPage, scan, createCollection, setPaletteOpen } = useLibrary();
  const updateReady = useUpdate((s) => s.state.status === "available");
  const [addOpen, setAddOpen] = useState(false);
  const [newColl, setNewColl] = useState<string | null>(null);

  const counts = useMemo(() => {
    const visible = games.filter((g) => !g.hidden);
    const perStore = Object.fromEntries(STORE_ORDER.map((s) => [s, 0])) as Record<Store, number>;
    for (const g of visible) for (const src of g.sources) perStore[src.store]++;
    const perStatus = Object.fromEntries(STATUS_ORDER.map((s) => [s, visible.filter((g) => g.status === s).length]));
    return {
      perStatus,
      all: visible.length,
      favorites: visible.filter((g) => g.favorite).length,
      recent: visible.filter((g) => g.lastPlayed).length,
      hidden: games.length - visible.length,
      perStore,
    };
  }, [games]);

  const isActive = (f: Filter) => page === "library" && JSON.stringify(f) === JSON.stringify(filter);

  const item = (f: Filter, icon: React.ReactNode, label: string, count?: number, color?: string) => (
    <button
      key={JSON.stringify(f)}
      onClick={() => setFilter(f)}
      className={`focus-ring group flex w-full items-center gap-2.5 rounded-card px-2.5 py-[7px] text-[13px] transition
        ${isActive(f) ? "bg-accent/16 text-fg font-medium" : "text-muted hover:bg-fg/6 hover:text-fg"}`}
    >
      <span className="flex size-5 shrink-0 items-center justify-center" style={color ? { color } : undefined}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {count !== undefined && <span className="text-[11px] tabular-nums text-muted/70">{count}</span>}
    </button>
  );

  return (
    <aside className="flex w-[232px] shrink-0 flex-col gap-1 overflow-y-auto px-3 pb-3">
      <nav className="flex flex-col gap-0.5">
        {item({ type: "all" }, <LayoutGrid size={16} />, "Todos los juegos", counts.all)}
        {item({ type: "favorites" }, <Star size={16} />, "Favoritos", counts.favorites)}
        {item({ type: "recent" }, <Clock size={16} />, "Recientes", counts.recent)}
        <button
          onClick={() => setPage("stats")}
          className={`focus-ring flex w-full items-center gap-2.5 rounded-card px-2.5 py-[7px] text-[13px] transition
            ${page === "stats" ? "bg-accent/16 font-medium text-fg" : "text-muted hover:bg-fg/6 hover:text-fg"}`}
        >
          <Activity size={16} /> <span className="flex-1 text-left">Actividad</span>
        </button>
        <button
          onClick={() => setPaletteOpen(true)}
          className="focus-ring flex w-full items-center gap-2.5 rounded-card px-2.5 py-[7px] text-[13px] text-muted transition hover:bg-fg/6 hover:text-fg"
        >
          <Search size={16} /> <span className="flex-1 text-left">Búsqueda rápida</span>
          <kbd className="rounded border border-line px-1 text-[10px]">Ctrl K</kbd>
        </button>
      </nav>

      {STATUS_ORDER.some((s) => counts.perStatus[s] > 0) && (
        <>
          <SectionLabel>Estado</SectionLabel>
          <nav className="flex flex-col gap-0.5">
            {STATUS_ORDER.filter((s) => counts.perStatus[s] > 0).map((s) =>
              item(
                { type: "status", status: s },
                <span className="size-2.5 rounded-full" style={{ background: STATUS_META[s].color }} />,
                STATUS_META[s].label,
                counts.perStatus[s],
              ),
            )}
          </nav>
        </>
      )}

      <SectionLabel>Tiendas</SectionLabel>
      <nav className="flex flex-col gap-0.5">
        {STORE_ORDER.filter((s) => counts.perStore[s] > 0).map((s) =>
          item({ type: "store", store: s }, <StoreDot store={s} />, STORE_META[s].label, counts.perStore[s]),
        )}
        {counts.all === 0 && <p className="px-2.5 py-1 text-xs text-muted/70">Escanea para detectar tiendas.</p>}
        <button
          onClick={() => setPage("owned")}
          className={`focus-ring flex w-full items-center gap-2.5 rounded-card px-2.5 py-[7px] text-[13px] transition
            ${page === "owned" ? "bg-accent/16 font-medium text-fg" : "text-muted hover:bg-fg/6 hover:text-fg"}`}
        >
          <CloudDownload size={16} style={{ color: STORE_META.steam.color }} />
          <span className="flex-1 text-left">Steam · no instalados</span>
        </button>
      </nav>

      <SectionLabel
        action={
          <button onClick={() => setNewColl("")} className="rounded p-0.5 text-muted hover:text-fg" title="Nueva colección">
            <Plus size={14} />
          </button>
        }
      >
        Colecciones
      </SectionLabel>
      <nav className="flex flex-col gap-0.5">
        {collections.map((c) =>
          item(
            { type: "collection", id: c.id },
            <FolderPlus size={15} />,
            c.name,
            games.filter((g) => !g.hidden && g.collections.includes(c.id)).length,
          ),
        )}
        {newColl !== null && (
          <input
            autoFocus
            value={newColl}
            placeholder="Nombre de la colección"
            onChange={(e) => setNewColl(e.target.value)}
            onBlur={() => setNewColl(null)}
            onKeyDown={async (e) => {
              if (e.key === "Escape") setNewColl(null);
              if (e.key === "Enter" && newColl.trim()) {
                const c = await createCollection(newColl);
                setNewColl(null);
                if (c) setFilter({ type: "collection", id: c.id });
              }
            }}
            className="focus-ring mx-1 h-8 rounded-card border border-line bg-surface-2 px-2 text-xs"
          />
        )}
      </nav>

      <div className="flex-1" />

      <nav className="flex flex-col gap-0.5 border-t border-line/70 pt-2">
        {item({ type: "hidden" }, <EyeOff size={15} />, "Ocultos", counts.hidden)}
        <button
          onClick={() => setAddOpen(true)}
          className="focus-ring flex w-full items-center gap-2.5 rounded-card px-2.5 py-[7px] text-[13px] text-muted transition hover:bg-fg/6 hover:text-fg"
        >
          <Plus size={16} /> Añadir juego
        </button>
        <button
          onClick={() => scan()}
          disabled={scanning}
          className="focus-ring flex w-full items-center gap-2.5 rounded-card px-2.5 py-[7px] text-[13px] text-muted transition hover:bg-fg/6 hover:text-fg disabled:opacity-50"
        >
          <RefreshCw size={16} className={scanning ? "animate-spin" : ""} /> {scanning ? "Escaneando…" : "Escanear"}
        </button>
        <button
          onClick={() => setPage("settings")}
          className={`focus-ring flex w-full items-center gap-2.5 rounded-card px-2.5 py-[7px] text-[13px] transition
            ${page === "settings" ? "bg-accent/16 font-medium text-fg" : "text-muted hover:bg-fg/6 hover:text-fg"}`}
        >
          <Settings size={16} /> Ajustes
          {updateReady && (
            <span
              title="Hay una actualización de Nexus disponible"
              className="ml-auto flex items-center gap-1 rounded-full bg-accent px-1.5 py-px text-[10px] font-medium text-accent-fg"
            >
              <ArrowUpCircle size={11} /> Nueva versión
            </span>
          )}
        </button>
      </nav>

      <AddGameModal open={addOpen} onClose={() => setAddOpen(false)} />
    </aside>
  );
}

function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mt-4 mb-1 flex items-center justify-between px-2.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted/80">{children}</span>
      {action}
    </div>
  );
}

export function StoreDot({ store, size = 10 }: { store: Store; size?: number }) {
  return (
    <span
      className="inline-block rounded-full"
      style={{ width: size, height: size, background: STORE_META[store].color, boxShadow: `0 0 8px ${STORE_META[store].color}66` }}
    />
  );
}
