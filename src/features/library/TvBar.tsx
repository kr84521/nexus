import { Minimize2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { STORE_META, STORE_ORDER } from "@/lib/stores";
import { useLibrary, type Filter } from "@/stores/library";
import logo from "@/assets/logo.png";

/** Barra superior del modo TV: filtros como pestañas grandes (LB/RB con mando), reloj y salida. */
export function TvBar() {
  const { games, collections, filter, setFilter, setTvMode, setPaletteOpen } = useLibrary();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const tabs = useMemo(() => {
    const stores = new Set(games.filter((g) => !g.hidden).flatMap((g) => g.sources.map((s) => s.store)));
    const list: { f: Filter; label: string }[] = [
      { f: { type: "all" }, label: "Todos" },
      { f: { type: "favorites" }, label: "Favoritos" },
      { f: { type: "recent" }, label: "Recientes" },
      ...STORE_ORDER.filter((s) => stores.has(s)).map((s) => ({ f: { type: "store", store: s } as Filter, label: STORE_META[s].label })),
      ...collections.map((c) => ({ f: { type: "collection", id: c.id } as Filter, label: c.name })),
    ];
    return list;
  }, [games, collections]);

  const key = JSON.stringify(filter);

  return (
    <div className="flex h-16 shrink-0 items-center gap-6 px-10" data-nav="skip">
      <img src={logo} alt="" className="size-8" draggable={false} />
      <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto" data-nav="">
        {tabs.map((t) => (
          <button
            key={t.label}
            onClick={() => setFilter(t.f)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              JSON.stringify(t.f) === key ? "bg-accent text-accent-fg" : "text-fg/70 hover:bg-fg/8 hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <button onClick={() => setPaletteOpen(true)} className="rounded-full p-2 text-fg/70 hover:bg-fg/8 hover:text-fg" title="Buscar">
        <Search size={20} />
      </button>
      <span className="text-sm tabular-nums text-fg/70">
        {now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
      </span>
      <button onClick={() => setTvMode(false)} className="rounded-full p-2 text-fg/70 hover:bg-fg/8 hover:text-fg" title="Salir del modo TV (F11)">
        <Minimize2 size={20} />
      </button>
    </div>
  );
}
