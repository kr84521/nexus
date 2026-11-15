import { ArrowDownAZ, Gamepad2, Search } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { STORE_META } from "@/lib/stores";
import { selectVisible, useLibrary, type SortKey } from "@/stores/library";
import { GameCard } from "./GameCard";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "title", label: "Título" },
  { key: "lastPlayed", label: "Jugado recientemente" },
  { key: "added", label: "Añadido" },
  { key: "playCount", label: "Más jugados" },
];

export function LibraryView() {
  const state = useLibrary();
  const { filter, search, sort, loaded, scanning, games, collections, setSearch, setSort, scan } = state;
  const visible = useMemo(() => selectVisible(state), [state.games, filter, search, sort]); // eslint-disable-line react-hooks/exhaustive-deps

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
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-8">
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
        ) : (
          <div className="cover-grid">
            {visible.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
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
