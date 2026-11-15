import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo } from "react";
import { GamepadHints } from "@/components/GamepadHints";
import { Toasts } from "@/components/Toasts";
import { ArtworkPicker } from "@/features/artwork/ArtworkPicker";
import { ArtworkBackdrop } from "@/features/library/ArtworkBackdrop";
import { LibraryView } from "@/features/library/LibraryView";
import { GameDetail } from "@/features/game-detail/GameDetail";
import { SettingsView } from "@/features/settings/SettingsView";
import { useGamepad } from "@/lib/gamepad";
import { checkForUpdate } from "@/lib/updater";
import { toast } from "@/stores/toast";
import { cycleFilter, useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";

export function App() {
  const { page, selectedId, artTarget, games, loaded, load, scan, refreshGame, setFetchingArt, setRunning, openArt } =
    useLibrary();
  const loadSettings = useSettings((s) => s.load);
  const selected = games.find((g) => g.id === selectedId) ?? null;
  const artGame = games.find((g) => g.id === artTarget) ?? null;

  // Arranque: ajustes + biblioteca; si está vacía, escanea automáticamente.
  useEffect(() => {
    (async () => {
      await loadSettings();
      await load();
      if (useLibrary.getState().games.length === 0) scan(true);
      if (!import.meta.env.DEV) {
        const u = await checkForUpdate();
        if (u.status === "available") toast.info(`Nexus ${u.update.version} disponible: instálala desde Ajustes`);
      }
    })();
  }, [loadSettings, load, scan]);

  // Eventos del backend: arte en segundo plano, juegos en ejecución, bandeja.
  useEffect(() => {
    const unlisten = [
      listen<string>("artwork-updated", (e) => refreshGame(e.payload)),
      listen("artwork-done", () => setFetchingArt(false)),
      listen<{ gameId: string; running: boolean }>("game-running", (e) => setRunning(e.payload.gameId, e.payload.running)),
      listen("scan-requested", () => scan()),
    ];
    return () => {
      unlisten.forEach((p) => p.then((f) => f()));
    };
  }, [refreshGame, setFetchingArt, setRunning, scan]);

  // Mando.
  const gamepadActions = useMemo(
    () => ({
      back: () => {
        const s = useLibrary.getState();
        if (s.artTarget) s.openArt(null);
        else if (s.selectedId) s.select(null);
        else if (s.page !== "library") s.setPage("library");
        else window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      },
      play: (id: string) => useLibrary.getState().launch(id),
      favorite: (id: string) => useLibrary.getState().toggleFavorite(id),
      cycleFilter,
    }),
    [],
  );
  const gamepad = useGamepad(gamepadActions);

  // Atajos globales.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        useLibrary.getState().setPage("library");
        requestAnimationFrame(() => document.getElementById("library-search")?.focus());
      }
      if (e.key === "F5") {
        e.preventDefault();
        useLibrary.getState().scan();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative flex h-full flex-col bg-bg text-fg">
      <ArtworkBackdrop />
      <TitleBar />
      <div className="relative z-10 flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative min-w-0 flex-1 overflow-hidden rounded-tl-[calc(var(--radius)+8px)] border-t border-l border-line/60 bg-bg/55">
          <AnimatePresence mode="wait">
            {selected ? (
              <GameDetail key={`detail-${selected.id}`} game={selected} />
            ) : page === "settings" ? (
              <Page key="settings">
                <SettingsView />
              </Page>
            ) : (
              <Page key="library">{loaded && <LibraryView />}</Page>
            )}
          </AnimatePresence>
        </main>
      </div>
      {artGame && <ArtworkPicker game={artGame} open onClose={() => openArt(null)} />}
      {gamepad && <GamepadHints />}
      <Toasts />
    </div>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="h-full pt-3"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.16 }}
    >
      {children}
    </motion.div>
  );
}
