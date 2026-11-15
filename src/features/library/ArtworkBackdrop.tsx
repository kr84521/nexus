import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { artSrc } from "@/lib/art";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";

/** Fondo de toda la ventana: héroe desenfocado del juego bajo el cursor (o del seleccionado). */
export function ArtworkBackdrop() {
  const enabled = useSettings((s) => s.theme.dynamicBackground);
  const customBg = useSettings((s) => s.theme.backgroundImage);
  const hoveredId = useLibrary((s) => s.hoveredId);
  const selectedId = useLibrary((s) => s.selectedId);
  const games = useLibrary((s) => s.games);
  const [src, setSrc] = useState<string | null>(null);

  // Pequeño retardo para no parpadear al mover el ratón por la cuadrícula.
  useEffect(() => {
    if (!enabled) {
      setSrc(null);
      return;
    }
    const id = hoveredId ?? selectedId;
    const g = games.find((x) => x.id === id);
    const next = g ? artSrc(g, "hero") : null;
    const t = setTimeout(() => setSrc(next), hoveredId ? 140 : 0);
    return () => clearTimeout(t);
  }, [enabled, hoveredId, selectedId, games]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {customBg && (
        <img src={convertFileSrc(customBg)} alt="" className="absolute inset-0 size-full object-cover" draggable={false} />
      )}
      <AnimatePresence>
        {src && (
          <motion.img
            key={src}
            src={src}
            alt=""
            className="hero-img absolute inset-0 size-full object-cover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        )}
      </AnimatePresence>
      <div className="absolute inset-0 bg-bg" style={{ opacity: "var(--hero-dim)" }} />
      <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-transparent to-bg" />
    </div>
  );
}
