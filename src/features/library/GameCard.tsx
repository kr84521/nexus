import { Play, Star } from "lucide-react";
import { memo } from "react";
import { StoreDot } from "@/app/Sidebar";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { artSrc, displayTitle, titleHue } from "@/lib/art";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import type { Game } from "@/types";
import { useGameMenu } from "./useGameMenu";

export const GameCard = memo(function GameCard({ game }: { game: Game }) {
  const select = useLibrary((s) => s.select);
  const hover = useLibrary((s) => s.hover);
  const launch = useLibrary((s) => s.launch);
  const running = useLibrary((s) => !!s.running[game.id]);
  const showTitles = useSettings((s) => s.theme.showTitles);
  const showBadges = useSettings((s) => s.theme.showStoreBadges);
  const menu = useGameMenu(game);
  const cover = artSrc(game, "cover");
  const title = displayTitle(game);

  return (
    <>
      <button
        data-game-id={game.id}
        onClick={() => select(game.id)}
        onDoubleClick={() => launch(game.id)}
        onContextMenu={menu.open}
        onMouseEnter={() => hover(game.id)}
        onMouseLeave={() => hover(null)}
        className="focus-ring group flex w-full flex-col gap-2 text-left"
        title={title}
      >
        <div
          className={`relative aspect-[2/3] w-full overflow-hidden rounded-card bg-surface-2 shadow-md ring-1 transition
            duration-200 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-black/40 group-hover:ring-accent/70
            ${running ? "ring-emerald-400/80" : "ring-fg/8"}`}
        >
          {cover ? (
            <img src={cover} alt="" loading="lazy" decoding="async" className="size-full object-cover" draggable={false} />
          ) : (
            <FallbackCover title={title} />
          )}

          <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/70 via-transparent to-transparent p-3 opacity-0 transition group-hover:opacity-100">
            <span
              onClick={(e) => {
                e.stopPropagation();
                launch(game.id);
              }}
              className="flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-fg shadow-lg hover:brightness-110"
            >
              <Play size={12} fill="currentColor" /> Jugar
            </span>
          </div>

          {game.favorite && (
            <Star size={14} className="absolute top-2 right-2 fill-amber-400 text-amber-400 drop-shadow" />
          )}
          {showBadges && (
            <div className="absolute top-2 left-2 flex gap-1">
              {game.sources.map((s) => (
                <StoreDot key={s.id} store={s.store} size={8} />
              ))}
            </div>
          )}
          {running && (
            <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 backdrop-blur">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> Jugando
            </span>
          )}
        </div>
        {showTitles && <span className="truncate px-0.5 text-[12.5px] text-fg/85">{title}</span>}
      </button>
      {menu.at && <ContextMenu at={menu.at} entries={menu.entries} onClose={menu.close} />}
    </>
  );
});

export function FallbackCover({ title, large = false }: { title: string; large?: boolean }) {
  const h = titleHue(title);
  return (
    <div
      className="flex size-full items-end p-3"
      style={{
        background: `linear-gradient(160deg, hsl(${h} 45% 28%), hsl(${(h + 40) % 360} 50% 12%))`,
      }}
    >
      <span className={`line-clamp-3 font-semibold leading-tight text-white/90 ${large ? "text-2xl" : "text-sm"}`}>
        {title}
      </span>
    </div>
  );
}
