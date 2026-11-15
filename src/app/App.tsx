import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { Toasts } from "@/components/Toasts";
import { ArtworkBackdrop } from "@/features/library/ArtworkBackdrop";
import { LibraryView } from "@/features/library/LibraryView";
import { GameDetail } from "@/features/game-detail/GameDetail";
import { SettingsView } from "@/features/settings/SettingsView";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";

export function App() {
  const { page, selectedId, games, loaded, load, scan, refreshGame, setFetchingArt } = useLibrary();
  const loadSettings = useSettings((s) => s.load);
  const selected = games.find((g) => g.id === selectedId) ?? null;

  // Arranque: ajustes + biblioteca; si está vacía, escanea automáticamente.
  useEffect(() => {
    (async () => {
      await loadSettings();
      await load();
      if (useLibrary.getState().games.length === 0) scan(true);
    })();
  }, [loadSettings, load, scan]);

  // Eventos del backend: arte descargado en segundo plano.
  useEffect(() => {
    const unlisten = [
      listen<string>("artwork-updated", (e) => refreshGame(e.payload)),
      listen("artwork-done", () => setFetchingArt(false)),
    ];
    return () => {
      unlisten.forEach((p) => p.then((f) => f()));
    };
  }, [refreshGame, setFetchingArt]);

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
