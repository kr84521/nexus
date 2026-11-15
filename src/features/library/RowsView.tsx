import { Play } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { artSrc, displayTitle } from "@/lib/art";
import { STORE_META, STORE_ORDER } from "@/lib/stores";
import { useLibrary } from "@/stores/library";
import type { Game } from "@/types";
import { GameCard } from "./GameCard";

/** Vista "Destacados": un juego grande arriba y filas horizontales por categoría. */
export function RowsView({ games }: { games: Game[] }) {
  const { collections, hoveredId, select, launch } = useLibrary();

  const rows = useMemo(() => {
    const recent = games.filter((g) => g.lastPlayed).sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0));
    const list: { key: string; title: string; games: Game[] }[] = [
      { key: "recent", title: "Continuar jugando", games: recent.slice(0, 20) },
      { key: "fav", title: "Favoritos", games: games.filter((g) => g.favorite) },
      ...collections.map((c) => ({ key: c.id, title: c.name, games: games.filter((g) => g.collections.includes(c.id)) })),
      ...STORE_ORDER.map((s) => ({
        key: `store-${s}`,
        title: STORE_META[s].label,
        games: games.filter((g) => g.sources.some((src) => src.store === s)),
      })),
    ];
    return { recent, rows: list.filter((r) => r.games.length > 0) };
  }, [games, collections]);

  const featured = games.find((g) => g.id === hoveredId) ?? rows.recent[0] ?? games[0];
  if (!featured) return null;

  const hero = artSrc(featured, "hero");
  const logo = artSrc(featured, "logo");

  return (
    <div className="flex flex-col gap-8 pb-4">
      {/* Destacado */}
      <section className="relative -mx-7 h-[360px] overflow-hidden">
        {hero ? (
          <img key={hero} src={hero} alt="" className="absolute inset-0 size-full object-cover" draggable={false} />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-accent/30 via-surface-2 to-bg" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg/80 via-bg/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 px-14 pb-8">
          {logo ? (
            <img src={logo} alt={displayTitle(featured)} className="max-h-[90px] max-w-[380px] object-contain object-left drop-shadow-xl" draggable={false} />
          ) : (
            <h2 className="text-4xl font-bold tracking-tight drop-shadow-lg">{displayTitle(featured)}</h2>
          )}
          {featured.meta?.description && (
            <p className="max-w-xl text-sm leading-relaxed text-fg/75 line-clamp-2">{featured.meta.description}</p>
          )}
          <div className="flex items-center gap-2">
            <Button variant="primary" size="lg" onClick={() => launch(featured.id)}>
              <Play size={18} fill="currentColor" /> Jugar
            </Button>
            <Button variant="outline" size="lg" onClick={() => select(featured.id)} className="bg-bg/40 backdrop-blur">
              Detalles
            </Button>
          </div>
        </div>
      </section>

      {rows.rows.map((row) => (
        <section key={row.key} className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">
            {row.title} <span className="ml-1 text-sm font-normal text-muted">{row.games.length}</span>
          </h3>
          <div className="-mx-2 flex gap-[var(--gap)] overflow-x-auto px-2 pt-1 pb-3">
            {row.games.map((g) => (
              <div key={g.id} className="w-[var(--cover-w)] shrink-0">
                <GameCard game={g} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
