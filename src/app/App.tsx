import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo } from "react";
import { GamepadHints } from "@/components/GamepadHints";
import { Toasts } from "@/components/Toasts";
import { ArtworkPicker } from "@/features/artwork/ArtworkPicker";
import { LaunchOptionsModal } from "@/features/game-detail/LaunchOptionsModal";
import { CommandPalette } from "@/features/library/CommandPalette";
import { TvBar } from "@/features/library/TvBar";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { applyTheme } from "@/lib/theme";
import { StatsView } from "@/features/stats/StatsView";
import { OwnedView } from "@/features/library/OwnedView";
import { displayTitle, formatPlaytime } from "@/lib/art";
import { ArtworkBackdrop } from "@/features/library/ArtworkBackdrop";
import { LibraryView } from "@/features/library/LibraryView";
import { GameDetail } from "@/features/game-detail/GameDetail";
import { Onboarding } from "@/features/onboarding/Onboarding";
import { SettingsView } from "@/features/settings/SettingsView";
import { useGamepad } from "@/lib/gamepad";
import { toast } from "@/stores/toast";
import { cycleFilter, useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { UPDATE_INTERVAL_MS, useUpdate } from "@/stores/update";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";

export function App() {
  const {
    page,
    selectedId,
    artTarget,
    launchOptionsTarget,
    games,
    loaded,
    load,
    scan,
    refreshGame,
    setFetchingArt,
    setRunning,
    openArt,
    openLaunchOptions,
    tvMode,
  } = useLibrary();
  const launchOptionsGame = games.find((g) => g.id === launchOptionsTarget) ?? null;
  const loadSettings = useSettings((s) => s.load);
  const selected = games.find((g) => g.id === selectedId) ?? null;
  const artGame = games.find((g) => g.id === artTarget) ?? null;

  // Arranque: ajustes + biblioteca; si está vacía, escanea automáticamente.
  useEffect(() => {
    (async () => {
      await loadSettings();
      await load();
      if (useLibrary.getState().games.length === 0) scan(true);
    })();
  }, [loadSettings, load, scan]);

  // Actualizaciones: al arrancar y cada 6 h mientras Nexus siga abierto (p. ej. en la bandeja).
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const check = () => useUpdate.getState().check(true);
    check();
    const timer = setInterval(check, UPDATE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  // Eventos del backend: arte en segundo plano, juegos en ejecución, bandeja.
  useEffect(() => {
    const unlisten = [
      listen<string>("artwork-updated", (e) => refreshGame(e.payload)),
      listen("artwork-done", () => setFetchingArt(false)),
      listen<{ gameId: string; running: boolean }>("game-running", (e) => setRunning(e.payload.gameId, e.payload.running)),
      listen("scan-requested", () => scan()),
      listen("library-changed", () => load()),
      listen<{ gameId: string; files: number }>("saves-backed-up", (e) => {
        toast.success(`Copia de partidas guardada (${e.payload.files} archivos)`);
      }),
      listen<{ gameId: string; secs: number }>("session-ended", (e) => {
        const g = useLibrary.getState().games.find((x) => x.id === e.payload.gameId);
        toast.info(`${g ? displayTitle(g) : "Sesión"}: has jugado ${formatPlaytime(e.payload.secs)}`);
      }),
    ];
    return () => {
      unlisten.forEach((p) => p.then((f) => f()));
    };
  }, [refreshGame, setFetchingArt, setRunning, scan, load]);

  // Modo TV: pantalla completa + variables de tamaño.
  useEffect(() => {
    document.documentElement.dataset.tv = String(tvMode);
    applyTheme(useSettings.getState().theme);
    getCurrentWindow().setFullscreen(tvMode).catch(() => {});
    if (tvMode) requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-game-id]")?.focus());
  }, [tvMode]);

  // Mando.
  const gamepadActions = useMemo(
    () => ({
      back: () => {
        const s = useLibrary.getState();
        if (s.paletteOpen) s.setPaletteOpen(false);
        else if (s.launchOptionsTarget) s.openLaunchOptions(null);
        else if (s.artTarget) s.openArt(null);
        else if (s.selectedId) s.select(null);
        else if (s.page !== "library") s.setPage("library");
        else window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      },
      play: (id: string) => useLibrary.getState().launch(id),
      favorite: (id: string) => useLibrary.getState().toggleFavorite(id),
      cycleFilter,
      toggleTv: () => useLibrary.getState().setTvMode(!useLibrary.getState().tvMode),
    }),
    [],
  );
  const gamepad = useGamepad(gamepadActions);

  // Atajos globales.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useLibrary.getState().setPaletteOpen(!useLibrary.getState().paletteOpen);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        useLibrary.getState().setPage("library");
        requestAnimationFrame(() => document.getElementById("library-search")?.focus());
      }
      if (e.key === "F11") {
        e.preventDefault();
        useLibrary.getState().setTvMode(!useLibrary.getState().tvMode);
        return;
      }
      if (e.key === "Escape" && useLibrary.getState().tvMode) {
        const s = useLibrary.getState();
        if (!s.selectedId && !s.artTarget && !s.paletteOpen && !s.launchOptionsTarget) s.setTvMode(false);
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
      {tvMode ? <TvBar /> : <TitleBar />}
      <div className="relative z-10 flex min-h-0 flex-1">
        {!tvMode && <Sidebar />}
        <main
          className={`relative min-w-0 flex-1 overflow-hidden ${
            tvMode ? "bg-transparent" : "rounded-tl-[calc(var(--radius)+8px)] border-t border-l border-line/60 bg-bg/55"
          }`}
        >
          <AnimatePresence mode="wait">
            {selected ? (
              <GameDetail key={`detail-${selected.id}`} game={selected} />
            ) : page === "settings" ? (
              <Page key="settings">
                <SettingsView />
              </Page>
            ) : page === "stats" ? (
              <Page key="stats">
                <StatsView />
              </Page>
            ) : page === "owned" ? (
              <Page key="owned">
                <OwnedView />
              </Page>
            ) : (
              <Page key="library">{loaded && <LibraryView />}</Page>
            )}
          </AnimatePresence>
        </main>
      </div>
      {artGame && <ArtworkPicker game={artGame} open onClose={() => openArt(null)} />}
      {launchOptionsGame && <LaunchOptionsModal game={launchOptionsGame} onClose={() => openLaunchOptions(null)} />}
      <CommandPalette />
      <Onboarding />
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
