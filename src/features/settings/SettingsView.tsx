import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { Check, ExternalLink, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Row, Section, Slider, Toggle } from "@/components/ui/Field";
import { api, errorText } from "@/lib/api";
import { ACCENTS, PRESETS, type FontChoice, type PresetId } from "@/lib/theme";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { toast } from "@/stores/toast";
import type { SteamAccount } from "@/types";
import { FoldersSection } from "./FoldersSection";
import { UpdateSection } from "./UpdateSection";
import { BackgroundRow, BackupSection, ThemeFileRow } from "./BackupSection";
import { EmulatorsSection } from "./EmulatorsSection";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

export function SettingsView() {
  const { theme, updateTheme, resetTheme, sgdbApiKey, setApiKey } = useSettings();
  const setFetchingArt = useLibrary((s) => s.setFetchingArt);
  const fetchingArt = useLibrary((s) => s.fetchingArt);
  const [keyDraft, setKeyDraft] = useState(sgdbApiKey);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const closeToTray = useSettings((s) => s.closeToTray);
  const setCloseToTray = useSettings((s) => s.setCloseToTray);
  const quickSearch = useSettings((s) => s.quickSearch);
  const setQuickSearch = useSettings((s) => s.setQuickSearch);
  const [shortcutDraft, setShortcutDraft] = useState(quickSearch.shortcut);
  const savesDir = useSettings((s) => s.savesDir);
  const setSavesDir = useSettings((s) => s.setSavesDir);
  const autoBackupSaves = useSettings((s) => s.autoBackupSaves);
  const setAutoBackupSaves = useSettings((s) => s.setAutoBackupSaves);
  const steamWebApiKey = useSettings((s) => s.steamWebApiKey);
  const setSteamWebApiKey = useSettings((s) => s.setSteamWebApiKey);
  const steamId = useSettings((s) => s.steamId);
  const setSteamId = useSettings((s) => s.setSteamId);
  const [steamKeyDraft, setSteamKeyDraft] = useState(steamWebApiKey);
  const [steamIdDraft, setSteamIdDraft] = useState(steamId);
  const [accounts, setAccounts] = useState<SteamAccount[]>([]);
  const [manualId, setManualId] = useState(false);
  const discordAppId = useSettings((s) => s.discordAppId);
  const setDiscordAppId = useSettings((s) => s.setDiscordAppId);
  const [discordDraft, setDiscordDraft] = useState(discordAppId);
  const nativeNotifications = useSettings((s) => s.nativeNotifications);
  const setNativeNotifications = useSettings((s) => s.setNativeNotifications);
  const load = useLibrary((s) => s.load);
  const [syncing, setSyncing] = useState(false);
  const syncSteam = async () => {
    setSyncing(true);
    try {
      const r = await api.syncSteam();
      await load();
      toast.success(`Steam: ${r.owned} juegos en tu cuenta, ${r.updated} con horas (${r.hours} h en total)`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSyncing(false);
    }
  };
  useEffect(() => {
    api
      .steamAccounts()
      .then((list) => {
        setAccounts(list);
        // Un SteamID escrito a mano que no es de ninguna cuenta de este PC: mostrar el campo manual.
        if (steamId && !list.some((a) => a.steamId === steamId)) setManualId(true);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const chooseAccount = async (value: string) => {
    if (value === "__manual") {
      setManualId(true);
      return;
    }
    setManualId(false);
    setSteamIdDraft(value);
    await setSteamId(value);
    if (steamWebApiKey) await syncSteam();
  };
  const autoAccount = accounts[0];

  useEffect(() => {
    isEnabled().then(setAutostart).catch(() => setAutostart(false));
  }, []);

  const toggleAutostart = async (v: boolean) => {
    try {
      await (v ? enable() : disable());
      setAutostart(v);
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const choosePreset = (id: PresetId) =>
    updateTheme({ preset: id, palette: PRESETS[id].palette, accent: PRESETS[id].accent });

  return (
    <div className="h-full overflow-y-auto px-7 pb-10">
      <header className="flex items-center gap-4 pt-2 pb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
        <div className="flex-1" />
        <Button size="sm" onClick={() => useSettings.getState().openOnboarding()}>
          <Sparkles size={14} /> Asistente de configuración
        </Button>
        <Button size="sm" onClick={resetTheme}>
          <RotateCcw size={14} /> Restablecer tema
        </Button>
      </header>

      <div className="grid max-w-5xl grid-cols-1 gap-5 xl:grid-cols-2">
        <Section title="Tema">
          <Row label="Preset">
            <div className="flex gap-2">
              {(Object.keys(PRESETS) as PresetId[]).map((id) => (
                <button
                  key={id}
                  onClick={() => choosePreset(id)}
                  title={PRESETS[id].label}
                  className={`focus-ring flex h-9 items-center gap-2 rounded-card border px-3 text-xs transition ${
                    theme.preset === id ? "border-accent bg-accent/12" : "border-line hover:bg-fg/6"
                  }`}
                >
                  <span
                    className="size-4 rounded-full border border-black/20"
                    style={{ background: `linear-gradient(135deg, ${PRESETS[id].palette.bg} 50%, ${PRESETS[id].palette.surface2} 50%)` }}
                  />
                  {PRESETS[id].label}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Color de acento">
            <div className="flex items-center gap-1.5">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  onClick={() => updateTheme({ accent: c })}
                  className="focus-ring flex size-6 items-center justify-center rounded-full transition hover:scale-110"
                  style={{ background: c }}
                >
                  {theme.accent === c && <Check size={13} className="text-white drop-shadow" />}
                </button>
              ))}
              <input
                type="color"
                value={theme.accent}
                onChange={(e) => updateTheme({ accent: e.target.value })}
                className="ml-1 size-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
                title="Color personalizado"
              />
            </div>
          </Row>
          <Row label="Fuente">
            <select
              value={theme.font}
              onChange={(e) => updateTheme({ font: e.target.value as FontChoice })}
              className="focus-ring h-9 rounded-card border border-line bg-surface-2/70 px-2 text-sm"
            >
              <option value="inter">Inter</option>
              <option value="grotesk">Space Grotesk</option>
              <option value="system">Sistema</option>
            </select>
          </Row>
          <Row label="Radio de esquinas">
            <Slider value={theme.radius} min={0} max={24} unit="px" onChange={(v) => updateTheme({ radius: v })} />
          </Row>
          <Row label="Efecto cristal" hint="Desenfoque en paneles y menús">
            <Toggle checked={theme.glass} onChange={(v) => updateTheme({ glass: v })} />
          </Row>
          <Row label="Animaciones">
            <Toggle checked={theme.animations} onChange={(v) => updateTheme({ animations: v })} />
          </Row>
          <Row label="Acento por juego" hint="La ficha usa el color dominante de la portada">
            <Toggle checked={theme.gameAccent} onChange={(v) => updateTheme({ gameAccent: v })} />
          </Row>
          <Row label="Tráilers de fondo" hint="Reproduce el tráiler en silencio en la ficha del juego">
            <Toggle checked={theme.trailers} onChange={(v) => updateTheme({ trailers: v })} />
          </Row>
          <BackgroundRow />
          <ThemeFileRow />
        </Section>

        <Section title="Biblioteca">
          <Row label="Tamaño de portada">
            <Slider value={theme.coverWidth} min={120} max={320} step={4} unit="px" onChange={(v) => updateTheme({ coverWidth: v })} />
          </Row>
          <Row label="Separación">
            <Slider value={theme.gap} min={8} max={48} unit="px" onChange={(v) => updateTheme({ gap: v })} />
          </Row>
          <Row label="Mostrar títulos">
            <Toggle checked={theme.showTitles} onChange={(v) => updateTheme({ showTitles: v })} />
          </Row>
          <Row label="Insignias de tienda" hint="Puntos de color en cada portada">
            <Toggle checked={theme.showStoreBadges} onChange={(v) => updateTheme({ showStoreBadges: v })} />
          </Row>
          <Row label="Fondo dinámico" hint="El fondo del juego bajo el cursor se muestra desenfocado">
            <Toggle checked={theme.dynamicBackground} onChange={(v) => updateTheme({ dynamicBackground: v })} />
          </Row>
          <Row label="Desenfoque del fondo">
            <Slider value={theme.heroBlur} min={0} max={60} unit="px" onChange={(v) => updateTheme({ heroBlur: v })} />
          </Row>
          <Row label="Oscurecer fondo">
            <Slider value={theme.heroDim} min={0} max={90} unit="%" onChange={(v) => updateTheme({ heroDim: v })} />
          </Row>
        </Section>

        <FoldersSection />

        <EmulatorsSection />

        <Section title="Cuenta de Steam · Web API">
          <Row label="Clave de la Web API" hint="Para logros, horas acumuladas y tu biblioteca completa. El perfil debe tener «Detalles del juego» en público">
            <Input type="password" value={steamKeyDraft} onChange={(e) => setSteamKeyDraft(e.target.value)} placeholder="Pega tu clave" className="w-64" />
            <Button variant="primary" size="sm" onClick={() => setSteamWebApiKey(steamKeyDraft)} disabled={steamKeyDraft.trim() === steamWebApiKey}>
              Guardar
            </Button>
          </Row>
          <Row label="Obtener una clave" hint="Gratis; en «Nombre de dominio» puedes poner localhost">
            <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-accent hover:underline">
              steamcommunity.com/dev/apikey <ExternalLink size={13} />
            </a>
          </Row>
          <Row
            label="Cuenta"
            hint={
              accounts.length > 1
                ? "En este PC han iniciado sesión varias cuentas de Steam: elige la tuya. Al cambiarla se vuelve a sincronizar"
                : "Cuenta de Steam de la que se leen horas, biblioteca y logros"
            }
          >
            <select
              value={manualId ? "__manual" : steamId}
              onChange={(e) => chooseAccount(e.target.value)}
              className="focus-ring h-9 max-w-72 rounded-card border border-line bg-surface-2/70 px-2 text-sm"
            >
              <option value="">
                Automática{autoAccount ? ` (${autoAccount.personaName || autoAccount.accountName})` : ""}
              </option>
              {accounts.map((a) => (
                <option key={a.steamId} value={a.steamId}>
                  {a.personaName || a.accountName} · {a.accountName}
                </option>
              ))}
              <option value="__manual">Otra (escribir SteamID64)…</option>
            </select>
          </Row>
          {manualId && (
            <Row label="SteamID64" hint="Número de 17 cifras de tu perfil (steamid.io lo muestra a partir de tu URL)">
              <Input value={steamIdDraft} onChange={(e) => setSteamIdDraft(e.target.value)} placeholder="7656119…" className="w-56 font-mono text-xs" />
              <Button variant="outline" size="sm" onClick={() => chooseAccount(steamIdDraft.trim())} disabled={steamIdDraft.trim() === steamId}>
                Aplicar
              </Button>
            </Row>
          )}
          <Row label="Sincronizar ahora" hint="Trae las horas acumuladas en Steam y tu lista de juegos. También se hace al arrancar Nexus">
            <Button variant="outline" size="sm" onClick={syncSteam} disabled={syncing || !steamWebApiKey}>
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} /> Sincronizar
            </Button>
          </Row>
        </Section>

        <Section title="Discord">
          <Row label="Application ID" hint="Muestra «Jugando a …» en tu perfil de Discord mientras juegas. Vacío = desactivado">
            <Input value={discordDraft} onChange={(e) => setDiscordDraft(e.target.value)} placeholder="123456789012345678" className="w-56 font-mono text-xs" />
            <Button variant="primary" size="sm" onClick={() => setDiscordAppId(discordDraft)} disabled={discordDraft.trim() === discordAppId}>
              Guardar
            </Button>
          </Row>
          <Row label="Cómo conseguirlo" hint="Crea una aplicación llamada «Nexus» y copia su Application ID. No hace falta nada más">
            <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-accent hover:underline">
              discord.com/developers <ExternalLink size={13} />
            </a>
          </Row>
        </Section>

        <Section title="Partidas guardadas">
          <Row label="Copia automática al salir" hint="Al terminar cada sesión se guarda una copia de las partidas (se conservan 5 por juego)">
            <Toggle checked={autoBackupSaves} onChange={setAutoBackupSaves} />
          </Row>
          <Row label="Carpeta de las copias" hint={savesDir || "Por defecto, dentro de los datos de Nexus. Elige una carpeta de OneDrive o Drive para tenerlas en la nube"}>
            {savesDir && (
              <Button size="sm" onClick={() => setSavesDir("")}>
                Por defecto
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const d = await openDialog({ directory: true, multiple: false, title: "Carpeta para las copias de partidas" });
                if (typeof d === "string") setSavesDir(d);
              }}
            >
              Elegir carpeta
            </Button>
          </Row>
        </Section>

        <BackupSection />

        <UpdateSection />

        <Section title="Sistema">
          <Row label="Abrir al iniciar Windows" hint="Arranca escondido en la bandeja del sistema, junto al reloj">
            <Toggle checked={autostart ?? false} onChange={toggleAutostart} />
          </Row>
          <Row label="Notificaciones de Windows" hint="Avisos del sistema (tiempo jugado, copias) cuando Nexus está en la bandeja o sin foco">
            <Toggle checked={nativeNotifications} onChange={setNativeNotifications} />
          </Row>
          <Row label="Cerrar a la bandeja" hint="Al cerrar la ventana Nexus sigue en la bandeja; sal desde su menú">
            <Toggle checked={closeToTray} onChange={setCloseToTray} />
          </Row>
          <Row label="Atajo global de búsqueda" hint="Abre la búsqueda rápida desde cualquier sitio, incluso con Nexus en la bandeja">
            <Toggle checked={quickSearch.enabled} onChange={(v) => setQuickSearch({ ...quickSearch, enabled: v })} />
          </Row>
          <Row label="Combinación" hint="Teclas unidas con +: CommandOrControl, Shift, Alt, Space, letras, F1-F12…">
            <Input
              value={shortcutDraft}
              onChange={(e) => setShortcutDraft(e.target.value)}
              disabled={!quickSearch.enabled}
              className="w-56 font-mono text-xs disabled:opacity-40"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!quickSearch.enabled || shortcutDraft.trim() === quickSearch.shortcut}
              onClick={() => setQuickSearch({ ...quickSearch, shortcut: shortcutDraft.trim() })}
            >
              Aplicar
            </Button>
          </Row>
        </Section>

        <Section title="Arte · SteamGridDB">
          <Row
            label="API key"
            hint="Necesaria para portadas, fondos y logos alternativos"
          >
            <Input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder="Pega tu clave"
              className="w-64"
            />
            <Button variant="primary" size="sm" onClick={() => setApiKey(keyDraft)} disabled={keyDraft.trim() === sgdbApiKey}>
              Guardar
            </Button>
          </Row>
          <Row label="Obtener una clave" hint="Gratis, en Preferences → API">
            <a
              href="https://www.steamgriddb.com/profile/preferences/api"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-sm text-accent hover:underline"
            >
              steamgriddb.com <ExternalLink size={13} />
            </a>
          </Row>
          <Row label="Reintentar metadatos" hint="Descripción, géneros y tráiler desde la Store de Steam">
            <Button variant="outline" size="sm" onClick={() => api.refetchMissingMetadata().catch((e) => toast.error(errorText(e)))}>
              Reintentar
            </Button>
          </Row>
          <Row label="Reintentar arte que falte" hint="Vuelve a buscar portadas para los juegos sin arte">
            <Button
              variant="outline"
              size="sm"
              disabled={fetchingArt}
              onClick={() => {
                setFetchingArt(true);
                api.refetchMissingArt().catch((e) => toast.error(errorText(e)));
              }}
            >
              {fetchingArt ? "Descargando…" : "Reintentar"}
            </Button>
          </Row>
        </Section>
      </div>
    </div>
  );
}
