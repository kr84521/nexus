import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { Check, ExternalLink, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Row, Section, Slider, Toggle } from "@/components/ui/Field";
import { api, errorText } from "@/lib/api";
import { ACCENTS, PRESETS, type FontChoice, type PresetId } from "@/lib/theme";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { toast } from "@/stores/toast";
import { FoldersSection } from "./FoldersSection";
import { UpdateSection } from "./UpdateSection";

export function SettingsView() {
  const { theme, updateTheme, resetTheme, sgdbApiKey, setApiKey } = useSettings();
  const setFetchingArt = useLibrary((s) => s.setFetchingArt);
  const fetchingArt = useLibrary((s) => s.fetchingArt);
  const [keyDraft, setKeyDraft] = useState(sgdbApiKey);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const closeToTray = useSettings((s) => s.closeToTray);
  const setCloseToTray = useSettings((s) => s.setCloseToTray);

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

        <UpdateSection />

        <Section title="Sistema">
          <Row label="Abrir al iniciar Windows" hint="Arranca escondido en la bandeja del sistema, junto al reloj">
            <Toggle checked={autostart ?? false} onChange={toggleAutostart} />
          </Row>
          <Row label="Cerrar a la bandeja" hint="Al cerrar la ventana Nexus sigue en la bandeja; sal desde su menú">
            <Toggle checked={closeToTray} onChange={setCloseToTray} />
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
