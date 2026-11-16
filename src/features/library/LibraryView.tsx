import { ArrowDownAZ, Dices, Gamepad2, LayoutGrid, Rows3, Search, Tag, Tv } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { MergeSuggestionsBanner, MergeSuggestionsModal, useMergeSuggestions } from "./MergeSuggestions";
import { Roulette } from "./Roulette";
import { useVirtualGrid } from "@/lib/useVirtualGrid";
import { Button } from "@/components/ui/Button";
import { STORE_META } from "@/lib/stores";
import { selectVisible, useLibrary, type SortKey } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { STATUS_META } from "@/lib/status";
import { GameCard } from "./GameCard";
import { RowsView } from "./RowsView";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "title", label: "Título" },
  { key: "lastPlayed", label: "Jugado recientemente" },
  { key: "added", label: "Añadido" },
  { key: "playCount", label: "Más jugados" },
  { key: "rating", label: "Valoración" },
  { key: "size", label: "Tamaño en disco" },
];

export function LibraryView() {
  const state = useLibrary();
  const { filter, search, sort, loaded, scanning, games, collections, setSearch, setSort, setFilter, scan, tvMode, setTvMode } = state;
  const scrollRef = useRef<HTMLDivElement>(null);
  const coverWidth = useSettings((s) => s.theme.coverWidth);
  const gap = useSettings((s) => s.theme.gap);
  const showTitles = useSettings((s) => s.theme.showTitles);
  const visible = useMemo(() => selectVisible(state), [state.games, filter, search, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const layout = useSettings((s) => s.theme.layout);
  const updateTheme = useSettings((s) => s.updateTheme);
  const genres = useMemo(() => {
    const count = new Map<string, number>();
    for (const g of games) if (!g.hidden) for (const ge of g.meta?.genres ?? []) count.set(ge, (count.get(ge) ?? 0) + 1);
    return Array.from(count.entries()).sort((a, b) => b[1] - a[1]);
  }, [games]);
  const showRows = layout === "rows" && filter.type === "all" && !search.trim();
  const [roulette, setRoulette] = useState(false);
  const [reviewMerges, setReviewMerges] = useState(false);
  const mergePairs = useMergeSuggestions();
  const vg = useVirtualGrid(scrollRef, showRows ? 0 : visible.length, tvMode ? Math.max(coverWidth, 240) : coverWidth, gap, showTitles);

  const heading = (() => {
    switch (filter.type) {
      case "all":
        return "Todos los juegos";
      case "favorites":
        return "Favoritos";
      case "recent":
        return "Recientes";
      case "hidden":
        return "Ocultos";
      case "store":
        return STORE_META[filter.store].label;
      case "collection":
        return collections.find((c) => c.id === filter.id)?.name ?? "Colección";
      case "genre":
        return filter.genre;
      case "status":
        return STATUS_META[filter.status].label;
    }
  })();

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 px-7 pt-2 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
        <span className="text-sm text-muted">{visible.length}</span>
        <div className="flex-1" />
        <label className="relative">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar…  (Ctrl+F)"
            id="library-search"
            className="focus-ring h-9 w-64 rounded-full border border-line bg-surface/70 pr-3 pl-9 text-sm placeholder:text-muted/70"
          />
        </label>
        {genres.length > 0 && (
          <label className="relative flex items-center gap-1.5 text-sm text-muted">
            <Tag size={15} />
            <select
              value={filter.type === "genre" ? filter.genre : ""}
              onChange={(e) => setFilter(e.target.value ? { type: "genre", genre: e.target.value } : { type: "all" })}
              className="focus-ring h-9 max-w-44 appearance-none rounded-full border border-line bg-surface/70 pr-3 pl-2 text-sm text-fg"
            >
              <option value="">Género</option>
              {genres.map(([g, n]) => (
                <option key={g} value={g}>
                  {g} ({n})
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="relative flex items-center gap-1.5 text-sm text-muted">
          <ArrowDownAZ size={15} />
          <select
            value={filter.type === "recent" ? "lastPlayed" : sort}
            disabled={filter.type === "recent"}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="focus-ring h-9 appearance-none rounded-full border border-line bg-surface/70 pr-3 pl-2 text-sm text-fg"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => setRoulette(true)}
          title="¿A qué juego hoy?"
          className="focus-ring flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface/70 text-muted hover:text-fg"
        >
          <Dices size={15} />
        </button>
        {!tvMode && (
          <button
            onClick={() => setTvMode(true)}
            title="Modo TV (F11)"
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface/70 text-muted hover:text-fg"
          >
            <Tv size={15} />
          </button>
        )}
        <div className="flex overflow-hidden rounded-full border border-line bg-surface/70">
          <button
            onClick={() => updateTheme({ layout: "grid" })}
            title="Cuadrícula"
            className={`flex h-9 w-9 items-center justify-center transition ${layout === "grid" ? "bg-accent/18 text-accent" : "text-muted hover:text-fg"}`}
          >
            <LayoutGrid size={15} />
          </button>
          <button
            onClick={() => updateTheme({ layout: "rows" })}
            title="Destacados"
            className={`flex h-9 w-9 items-center justify-center transition ${layout === "rows" ? "bg-accent/18 text-accent" : "text-muted hover:text-fg"}`}
          >
            <Rows3 size={15} />
          </button>
        </div>
      </header>

      {filter.type === "all" && !tvMode && <MergeSuggestionsBanner pairs={mergePairs} onReview={() => setReviewMerges(true)} />}
      <Roulette open={roulette} onClose={() => setRoulette(false)} />
      <MergeSuggestionsModal pairs={mergePairs} open={reviewMerges} onClose={() => setReviewMerges(false)} />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-7 pb-8">
        {!loaded ? null : games.length === 0 ? (
          <Empty
            icon={<Gamepad2 size={44} />}
            title="Tu biblioteca está vacía"
            text="Nexus detecta los juegos instalados de Steam, Epic, GOG, EA, Ubisoft, Battle.net y Xbox."
            action={
              <Button variant="primary" size="lg" onClick={() => scan()} disabled={scanning}>
                {scanning ? "Escaneando…" : "Escanear ahora"}
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <Empty icon={<Search size={40} />} title="Nada por aquí" text="Ningún juego coincide con este filtro." />
        ) : showRows ? (
          <RowsView games={visible} />
        ) : (
          <div data-virtual-grid style={{ paddingTop: vg.padTop, paddingBottom: vg.padBottom }}>
            <div className="cover-grid">
              {visible.slice(vg.start, vg.end).map((g) => (
                <GameCard key={g.id} game={g} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <span className="text-muted/60">{icon}</span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-sm text-sm text-muted">{text}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
