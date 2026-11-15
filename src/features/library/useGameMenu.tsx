import { EyeOff, FolderOpen, Image as ImageIcon, Play, SlidersHorizontal, Star, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import type { MenuEntry, MenuPosition } from "@/components/ui/ContextMenu";
import { api, errorText } from "@/lib/api";
import { STORE_META } from "@/lib/stores";
import { useLibrary } from "@/stores/library";
import { toast } from "@/stores/toast";
import type { Game } from "@/types";

/** Entradas del menú contextual de un juego (compartidas por la cuadrícula y la ficha). */
export function useGameMenu(game: Game) {
  const [at, setAt] = useState<MenuPosition | null>(null);
  const open = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAt({ x: e.clientX, y: e.clientY });
  }, []);
  const close = useCallback(() => setAt(null), []);

  const { launch, toggleFavorite, toggleHidden, removeGame, collections, toggleInCollection, openArt, openLaunchOptions } =
    useLibrary();
  const installPath = game.sources.find((s) => s.installPath)?.installPath;

  const entries: MenuEntry[] = [
    ...(game.sources.length > 1
      ? game.sources.map<MenuEntry>((s) => ({
          label: `Jugar con ${STORE_META[s.store].label}`,
          icon: <Play size={14} />,
          onClick: () => launch(game.id, s.id),
        }))
      : [{ label: "Jugar", icon: <Play size={14} />, onClick: () => launch(game.id) } as MenuEntry]),
    "separator",
    { label: "Favorito", icon: <Star size={14} />, checked: game.favorite, onClick: () => toggleFavorite(game.id) },
    ...collections.map<MenuEntry>((c) => ({
      label: c.name,
      checked: game.collections.includes(c.id),
      onClick: () => toggleInCollection(c.id, game.id),
    })),
    "separator",
    { label: "Cambiar arte", icon: <ImageIcon size={14} />, onClick: () => openArt(game.id) },
    { label: "Opciones de lanzamiento…", icon: <SlidersHorizontal size={14} />, onClick: () => openLaunchOptions(game.id) },
    ...(installPath
      ? [
          {
            label: "Abrir carpeta",
            icon: <FolderOpen size={14} />,
            onClick: () => api.openInstallFolder(game.id).catch((e) => toast.error(errorText(e))),
          } as MenuEntry,
        ]
      : []),
    { label: game.hidden ? "Mostrar" : "Ocultar", icon: <EyeOff size={14} />, onClick: () => toggleHidden(game.id) },
    ...(game.sources.every((s) => s.store === "manual")
      ? ["separator" as const, { label: "Quitar de la biblioteca", icon: <Trash2 size={14} />, danger: true, onClick: () => removeGame(game.id) } as MenuEntry]
      : []),
  ];

  return { at, open, close, entries };
}
