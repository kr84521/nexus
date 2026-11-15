import {
  ArrowLeft,
  ChevronDown,
  Clock,
  EyeOff,
  FolderOpen,
  FolderPlus,
  Image as ImageIcon,
  Pencil,
  Play,
  Save,
  SlidersHorizontal,
  Star,
  Timer,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type CSSProperties } from "react";
import { StoreDot } from "@/app/Sidebar";
import { Button, IconButton } from "@/components/ui/Button";
import { artSrc, displayTitle, formatPlaytime, relativeTime } from "@/lib/art";
import { api, errorText } from "@/lib/api";
import { STORE_META } from "@/lib/stores";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { contrastText } from "@/lib/theme";
import { toast } from "@/stores/toast";
import type { Game } from "@/types";
import { FallbackCover } from "@/features/library/GameCard";
import { SavesPanel } from "./SavesPanel";
import { SourcesPanel } from "./SourcesPanel";
import { TrailerVideo } from "./TrailerVideo";

export function GameDetail({ game }: { game: Game }) {
  const {
    select,
    launch,
    toggleFavorite,
    toggleHidden,
    removeGame,
    upsert,
    collections,
    toggleInCollection,
    openArt,
    openLaunchOptions,
  } = useLibrary();
  const artOpen = useLibrary((s) => s.artTarget !== null);
  const running = useLibrary((s) => !!s.running[game.id]);
  const gameAccent = useSettings((s) => s.theme.gameAccent);
  const trailers = useSettings((s) => s.theme.trailers);
  const [showFull, setShowFull] = useState(false);
  const [savesOpen, setSavesOpen] = useState(false);
  const accentStyle: CSSProperties | undefined =
    gameAccent && game.artColor
      ? ({ "--accent": game.artColor, "--accent-fg": contrastText(game.artColor) } as CSSProperties)
      : undefined;
  const trailer = trailers ? game.meta?.trailerUrl : null;
  const meta = game.meta;
  const [menu, setMenu] = useState<"sources" | "collections" | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");

  const hero = artSrc(game, "hero");
  const logo = artSrc(game, "logo");
  const cover = artSrc(game, "cover");
  const title = displayTitle(game);
  const preferred = game.sources.find((s) => s.id === game.preferredSource) ?? game.sources[0];
  const installPath = game.sources.find((s) => s.installPath)?.installPath;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !artOpen && !editing && !savesOpen) select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select, artOpen, editing, savesOpen]);

  const saveTitle = async () => {
    setEditing(false);
    const t = draftTitle.trim();
    if (t === title) return;
    try {
      upsert(await api.setCustomTitle(game.id, t === game.title ? null : t));
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <motion.div
      data-game-id={game.id}
      style={accentStyle}
      className="relative flex h-full flex-col overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={() => setMenu(null)}
    >
      {/* Héroe */}
      <div className="absolute inset-x-0 top-0 h-[62%]">
        {trailer ? (
          <TrailerVideo key={trailer} src={trailer} poster={hero ?? game.meta?.trailerPoster ?? undefined} />
        ) : hero ? (
          <img src={hero} alt="" className="size-full object-cover" draggable={false} />
        ) : (
          <div className="size-full bg-gradient-to-br from-accent/30 via-surface-2 to-bg" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg/70 via-transparent to-transparent" />
      </div>

      <div className="relative z-10 flex items-center px-7 pt-1">
        <Button onClick={() => select(null)} size="sm" className="-ml-2 bg-bg/40 backdrop-blur">
          <ArrowLeft size={15} /> Biblioteca
        </Button>
      </div>

      <div className="relative z-10 mt-auto flex items-end gap-8 px-9 pb-9">
        {/* Portada */}
        <button
          onClick={() => openArt(game.id)}
          className="focus-ring group relative aspect-[2/3] w-[220px] shrink-0 overflow-hidden rounded-card shadow-2xl shadow-black/60 ring-1 ring-fg/10"
          title="Cambiar arte"
        >
          {cover ? (
            <img src={cover} alt="" className="size-full object-cover" draggable={false} />
          ) : (
            <FallbackCover title={title} large />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition group-hover:opacity-100">
            <span className="flex items-center gap-2 text-sm font-medium text-white">
              <ImageIcon size={16} /> Cambiar arte
            </span>
          </span>
        </button>

        {/* Info */}
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="min-h-[96px]">
            {logo && !editing ? (
              <img src={logo} alt={title} className="max-h-[120px] max-w-[480px] object-contain drop-shadow-xl" draggable={false} />
            ) : editing ? (
              <input
                autoFocus
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTitle();
                  if (e.key === "Escape") setEditing(false);
                }}
                className="focus-ring w-full max-w-xl rounded-card border border-line bg-surface/80 px-3 py-2 text-3xl font-bold tracking-tight"
              />
            ) : (
              <h1 className="text-5xl font-bold tracking-tight drop-shadow-lg">{title}</h1>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-fg/75">
            {running ? (
              <span className="flex items-center gap-1.5 font-medium text-emerald-300">
                <span className="size-2 animate-pulse rounded-full bg-emerald-400" /> Jugando ahora
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Clock size={14} /> {relativeTime(game.lastPlayed)}
              </span>
            )}
            {game.playtimeSecs > 0 && (
              <span className="flex items-center gap-1.5">
                <Timer size={14} /> {formatPlaytime(game.playtimeSecs)}
              </span>
            )}
            {game.playCount > 0 && <span>{game.playCount} {game.playCount === 1 ? "sesión" : "sesiones"}</span>}
          </div>

          <SourcesPanel game={game} />

          {meta && (meta.description || meta.genres.length > 0) && (
            <div className="flex max-w-2xl flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg/70">
                {meta.releaseYear && <span>{meta.releaseYear}</span>}
                {meta.developer && <span>{meta.developer}</span>}
                {meta.genres.map((g) => (
                  <span key={g} className="rounded-full bg-fg/10 px-2 py-0.5">
                    {g}
                  </span>
                ))}
              </div>
              {meta.description && (
                <p
                  onClick={() => setShowFull((v) => !v)}
                  className={`cursor-pointer text-sm leading-relaxed text-fg/80 ${showFull ? "" : "line-clamp-2"}`}
                  title={showFull ? "Mostrar menos" : "Mostrar más"}
                >
                  {meta.description}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-card shadow-lg shadow-accent/25">
              <Button variant="primary" size="lg" className="rounded-none shadow-none" onClick={() => launch(game.id)} autoFocus>
                <Play size={18} fill="currentColor" /> Jugar
              </Button>
              {game.sources.length > 1 && (
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setMenu(menu === "sources" ? null : "sources")}
                    className="flex h-12 items-center border-l border-accent-fg/20 bg-accent px-2.5 text-accent-fg hover:brightness-110"
                  >
                    <ChevronDown size={16} />
                  </button>
                  <Dropdown open={menu === "sources"}>
                    {game.sources.map((s) => (
                      <MenuItem
                        key={s.id}
                        active={s.id === preferred?.id}
                        onClick={async () => {
                          setMenu(null);
                          upsert(await api.setPreferredSource(game.id, s.id));
                          launch(game.id, s.id);
                        }}
                      >
                        <StoreDot store={s.store} size={8} /> Jugar con {STORE_META[s.store].label}
                      </MenuItem>
                    ))}
                  </Dropdown>
                </div>
              )}
            </div>

            <IconButton
              onClick={() => toggleFavorite(game.id)}
              active={game.favorite}
              title={game.favorite ? "Quitar de favoritos" : "Favorito"}
              className="size-12 bg-bg/40 backdrop-blur"
            >
              <Star size={18} fill={game.favorite ? "currentColor" : "none"} />
            </IconButton>

            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <IconButton
                onClick={() => setMenu(menu === "collections" ? null : "collections")}
                active={game.collections.length > 0}
                title="Colecciones"
                className="size-12 bg-bg/40 backdrop-blur"
              >
                <FolderPlus size={18} />
              </IconButton>
              <Dropdown open={menu === "collections"}>
                {collections.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted">Crea una colección desde la barra lateral.</div>
                )}
                {collections.map((c) => (
                  <MenuItem key={c.id} active={game.collections.includes(c.id)} onClick={() => toggleInCollection(c.id, game.id)}>
                    <span
                      className={`size-3.5 rounded border ${game.collections.includes(c.id) ? "border-accent bg-accent" : "border-muted"}`}
                    />
                    {c.name}
                  </MenuItem>
                ))}
              </Dropdown>
            </div>

            <IconButton
              title="Renombrar"
              className="size-12 bg-bg/40 backdrop-blur"
              onClick={() => {
                setDraftTitle(title);
                setEditing(true);
              }}
            >
              <Pencil size={17} />
            </IconButton>
            <IconButton title="Cambiar arte" className="size-12 bg-bg/40 backdrop-blur" onClick={() => openArt(game.id)}>
              <ImageIcon size={18} />
            </IconButton>
            <IconButton title="Partidas guardadas" className="size-12 bg-bg/40 backdrop-blur" onClick={() => setSavesOpen(true)}>
              <Save size={18} />
            </IconButton>
            <IconButton
              title="Opciones de lanzamiento"
              className="size-12 bg-bg/40 backdrop-blur"
              active={!!(game.launchOptions.args || game.launchOptions.preCommand || game.launchOptions.postCommand || game.launchOptions.closeStoreOnExit || game.launchOptions.runAsAdmin)}
              onClick={() => openLaunchOptions(game.id)}
            >
              <SlidersHorizontal size={18} />
            </IconButton>
            {installPath && (
              <IconButton
                title="Abrir carpeta"
                className="size-12 bg-bg/40 backdrop-blur"
                onClick={() => api.openInstallFolder(game.id).catch((e) => toast.error(errorText(e)))}
              >
                <FolderOpen size={18} />
              </IconButton>
            )}
            <IconButton
              title={game.hidden ? "Mostrar" : "Ocultar"}
              active={game.hidden}
              className="size-12 bg-bg/40 backdrop-blur"
              onClick={() => toggleHidden(game.id)}
            >
              <EyeOff size={18} />
            </IconButton>
            {game.sources.every((s) => s.store === "manual") && (
              <IconButton
                title="Quitar de la biblioteca"
                className="size-12 bg-bg/40 text-red-400 backdrop-blur hover:bg-red-500/15"
                onClick={() => removeGame(game.id)}
              >
                <Trash2 size={18} />
              </IconButton>
            )}
          </div>
        </div>
      </div>
      <SavesPanel game={game} open={savesOpen} onClose={() => setSavesOpen(false)} />
    </motion.div>
  );
}

function Dropdown({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="panel absolute top-full left-0 z-20 mt-2 min-w-[220px] overflow-hidden rounded-card border border-line py-1 shadow-2xl"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.12 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MenuItem({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-fg/8 ${active ? "text-fg" : "text-fg/80"}`}
    >
      {children}
    </button>
  );
}
