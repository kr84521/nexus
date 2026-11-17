// Asistente de primer arranque: juegos detectados, clave de SteamGridDB, cuenta de Steam, estilo y arranque.
// Se abre solo la primera vez (ajuste `onboardingDone`) y se puede volver a abrir desde Ajustes.
// Todos los pasos son opcionales: cerrar o saltar marca el asistente como hecho para no insistir.
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { ArrowLeft, ArrowRight, Check, ExternalLink, Gamepad2, ImageIcon, Keyboard, Loader2, Palette, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Toggle } from "@/components/ui/Field";
import { api, errorText } from "@/lib/api";
import { STORE_META, STORE_ORDER } from "@/lib/stores";
import { PRESETS, type PresetId } from "@/lib/theme";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { toast } from "@/stores/toast";
import type { Store, SteamAccount } from "@/types";

const STEPS = ["Bienvenida", "Arte", "Steam", "Estilo", "Listo"] as const;

export function Onboarding() {
  const open = useSettings((s) => s.onboardingOpen);
  const finish = useSettings((s) => s.finishOnboarding);
  const [step, setStep] = useState(0);

  const sgdbApiKey = useSettings((s) => s.sgdbApiKey);
  const setApiKey = useSettings((s) => s.setApiKey);
  const steamWebApiKey = useSettings((s) => s.steamWebApiKey);
  const setSteamWebApiKey = useSettings((s) => s.setSteamWebApiKey);
  const steamId = useSettings((s) => s.steamId);
  const setSteamId = useSettings((s) => s.setSteamId);
  const [sgdbDraft, setSgdbDraft] = useState("");
  const [steamDraft, setSteamDraft] = useState("");
  const [accountDraft, setAccountDraft] = useState("");
  const [accounts, setAccounts] = useState<SteamAccount[]>([]);

  // Al abrir: empezar desde el principio con lo que ya esté guardado.
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setSgdbDraft(useSettings.getState().sgdbApiKey);
    setSteamDraft(useSettings.getState().steamWebApiKey);
    setAccountDraft(useSettings.getState().steamId);
    api.steamAccounts().then(setAccounts).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && finish();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish]);

  // Guardar lo que se haya escrito en el paso actual antes de avanzar.
  const commitStep = async () => {
    if (step === 1 && sgdbDraft.trim() !== sgdbApiKey) await setApiKey(sgdbDraft);
    if (step === 2) {
      const keyChanged = steamDraft.trim() !== steamWebApiKey;
      const accountChanged = accountDraft !== steamId;
      if (keyChanged) await setSteamWebApiKey(steamDraft);
      if (accountChanged) await setSteamId(accountDraft);
      if ((keyChanged || accountChanged) && steamDraft.trim()) syncSteamInBackground();
    }
  };

  const next = async () => {
    await commitStep();
    if (step === STEPS.length - 1) finish();
    else setStep(step + 1);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[58] flex items-center justify-center bg-black/65 p-6 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            data-modal
            className="panel flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-[calc(var(--radius)+8px)] border border-line shadow-2xl"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center gap-3 px-6 pt-5">
              <div className="flex flex-1 gap-1.5">
                {STEPS.map((label, i) => (
                  <div
                    key={label}
                    title={label}
                    className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-accent" : "bg-fg/10"}`}
                  />
                ))}
              </div>
              <button
                onClick={finish}
                title="Cerrar el asistente"
                className="focus-ring rounded-card p-1.5 text-muted hover:bg-fg/8 hover:text-fg"
              >
                <X size={17} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-2">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={{ duration: 0.16 }}
                >
                  {step === 0 && <WelcomeStep />}
                  {step === 1 && <ArtStep draft={sgdbDraft} setDraft={setSgdbDraft} />}
                  {step === 2 && (
                    <SteamStep
                      draft={steamDraft}
                      setDraft={setSteamDraft}
                      accounts={accounts}
                      account={accountDraft}
                      setAccount={setAccountDraft}
                    />
                  )}
                  {step === 3 && <StyleStep />}
                  {step === 4 && <DoneStep />}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-2 border-t border-line px-6 py-4">
              {step > 0 && (
                <Button size="sm" onClick={() => setStep(step - 1)}>
                  <ArrowLeft size={14} /> Atrás
                </Button>
              )}
              <div className="flex-1" />
              {step > 0 && step < STEPS.length - 1 && (
                <Button size="sm" onClick={() => setStep(step + 1)} title="Pasar sin guardar este paso">
                  Saltar
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={next}>
                {step === 0 ? "Empezar" : step === STEPS.length - 1 ? "Ir a la biblioteca" : "Siguiente"}
                {step === STEPS.length - 1 ? <Check size={14} /> : <ArrowRight size={14} />}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function syncSteamInBackground() {
  api
    .syncSteam()
    .then(async (r) => {
      await useLibrary.getState().load();
      toast.success(`Steam: ${r.owned} juegos en tu cuenta, ${r.updated} con horas (${r.hours} h en total)`);
    })
    .catch((e) => toast.error(errorText(e)));
}

function StepHeader({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="mb-5">
      <div className="mb-3 flex size-10 items-center justify-center rounded-card bg-accent/15 text-accent">{icon}</div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
      {children} <ExternalLink size={12} />
    </a>
  );
}

function WelcomeStep() {
  const games = useLibrary((s) => s.games);
  // Antes de cargar la biblioteca (y del primer escaneo automático) también se muestra "buscando".
  const scanning = useLibrary((s) => s.scanning || !s.loaded);
  const perStore = useMemo(() => {
    const counts = new Map<Store, number>();
    for (const g of games) for (const store of new Set(g.sources.map((s) => s.store))) counts.set(store, (counts.get(store) ?? 0) + 1);
    return STORE_ORDER.filter((s) => counts.has(s)).map((s) => [s, counts.get(s)!] as const);
  }, [games]);

  return (
    <>
      <StepHeader
        icon={<Gamepad2 size={20} />}
        title="Bienvenido a Nexus"
        text="Nexus reúne en una sola biblioteca los juegos de todas tus tiendas. Configura lo básico en un minuto; todo se puede cambiar después en Ajustes."
      />
      <div className="rounded-card border border-line bg-surface-2/50 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          {scanning ? <Loader2 size={14} className="animate-spin text-accent" /> : <Check size={14} className="text-accent" />}
          {scanning ? "Buscando juegos instalados…" : `${games.length} juegos detectados`}
        </div>
        {perStore.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {perStore.map(([store, n]) => (
              <span key={store} className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-xs">
                <span className="size-2 rounded-full" style={{ background: STORE_META[store].color }} />
                {STORE_META[store].label} <span className="tabular-nums text-muted">{n}</span>
              </span>
            ))}
          </div>
        ) : (
          !scanning && (
            <p className="text-xs text-muted">
              No se encontró ninguna tienda. Puedes añadir juegos a mano o indicar carpetas en Ajustes.
            </p>
          )
        )}
      </div>
    </>
  );
}

function ArtStep({ draft, setDraft }: { draft: string; setDraft: (v: string) => void }) {
  return (
    <>
      <StepHeader
        icon={<ImageIcon size={20} />}
        title="Portadas y fondos"
        text="Con una clave gratuita de SteamGridDB, Nexus descarga portadas, fondos y logos para todos tus juegos, también los que no son de Steam, y te deja elegir entre alternativas."
      />
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>
          Entra en <ExtLink href="https://www.steamgriddb.com/profile/preferences/api">steamgriddb.com</ExtLink> e inicia sesión con
          Steam.
        </li>
        <li>En Preferences → API, genera una clave y cópiala.</li>
        <li>Pégala aquí.</li>
      </ol>
      <Input type="password" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Clave de SteamGridDB" className="w-full" />
      <p className="mt-2 text-xs text-muted">Sin clave, Nexus usa las imágenes de Steam cuando existen.</p>
    </>
  );
}

function SteamStep({
  draft,
  setDraft,
  accounts,
  account,
  setAccount,
}: {
  draft: string;
  setDraft: (v: string) => void;
  accounts: SteamAccount[];
  account: string;
  setAccount: (v: string) => void;
}) {
  const auto = accounts[0];
  return (
    <>
      <StepHeader
        icon={<Gamepad2 size={20} />}
        title="Tu cuenta de Steam"
        text="Opcional. Con una clave de la Web API, Nexus trae tus horas jugadas, tus logros y los juegos que tienes sin instalar."
      />
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>
          Abre <ExtLink href="https://steamcommunity.com/dev/apikey">steamcommunity.com/dev/apikey</ExtLink>; en «Nombre de dominio»
          vale localhost.
        </li>
        <li>Copia la clave y pégala aquí.</li>
        <li>En la privacidad de tu perfil, pon «Detalles del juego» en público.</li>
      </ol>
      <Input type="password" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Clave de la Web API de Steam" className="w-full" />
      {accounts.length > 1 && (
        <div className="mt-4">
          <div className="mb-1.5 text-sm font-medium">¿Cuál es tu cuenta?</div>
          <p className="mb-2 text-xs text-muted">En este PC han iniciado sesión varias cuentas de Steam.</p>
          <select
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            className="focus-ring h-9 w-full rounded-card border border-line bg-surface-2/70 px-2 text-sm"
          >
            <option value="">Automática{auto ? ` (${auto.personaName || auto.accountName})` : ""}</option>
            {accounts.map((a) => (
              <option key={a.steamId} value={a.steamId}>
                {a.personaName || a.accountName} · {a.accountName}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}

function StyleStep() {
  const theme = useSettings((s) => s.theme);
  const updateTheme = useSettings((s) => s.updateTheme);
  const closeToTray = useSettings((s) => s.closeToTray);
  const setCloseToTray = useSettings((s) => s.setCloseToTray);
  const [autostart, setAutostart] = useState<boolean | null>(null);

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

  return (
    <>
      <StepHeader icon={<Palette size={20} />} title="A tu gusto" text="Elige un estilo de partida. En Ajustes puedes afinar colores, tamaños, fuentes y fondos." />
      <div className="mb-5 grid grid-cols-2 gap-2">
        {(Object.keys(PRESETS) as PresetId[]).map((id) => {
          const p = PRESETS[id];
          return (
            <button
              key={id}
              onClick={() => updateTheme({ preset: id, palette: p.palette, accent: p.accent })}
              className={`focus-ring flex items-center gap-3 rounded-card border p-3 text-left text-sm transition ${
                theme.preset === id ? "border-accent bg-accent/12" : "border-line hover:bg-fg/6"
              }`}
            >
              <span className="flex h-8 w-12 shrink-0 items-end gap-1 rounded-md border border-black/20 p-1" style={{ background: p.palette.bg }}>
                <span className="h-3 flex-1 rounded-sm" style={{ background: p.palette.surface2 }} />
                <span className="h-5 flex-1 rounded-sm" style={{ background: p.accent }} />
              </span>
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="divide-y divide-line/70 rounded-card border border-line px-4">
        <div className="flex items-center justify-between gap-4 py-3 text-sm">
          <span>
            Abrir con Windows
            <span className="block text-xs text-muted">Arranca minimizado en la bandeja</span>
          </span>
          <Toggle checked={autostart ?? false} onChange={toggleAutostart} />
        </div>
        <div className="flex items-center justify-between gap-4 py-3 text-sm">
          <span>
            Cerrar a la bandeja
            <span className="block text-xs text-muted">La X esconde Nexus en vez de cerrarlo</span>
          </span>
          <Toggle checked={closeToTray} onChange={setCloseToTray} />
        </div>
      </div>
    </>
  );
}

function DoneStep() {
  const tips: [string, string][] = [
    ["Ctrl + K", "Busca y lanza cualquier juego escribiendo su nombre"],
    ["Ctrl + Shift + Espacio", "Lo mismo desde cualquier sitio, aunque Nexus esté en la bandeja"],
    ["Clic derecho", "En una portada: favorito, cambiar arte, opciones de lanzamiento…"],
    ["F11", "Modo TV a pantalla completa, pensado para el mando"],
    ["F5", "Vuelve a escanear las tiendas"],
  ];
  return (
    <>
      <StepHeader icon={<Keyboard size={20} />} title="Todo listo" text="Algunos atajos para sacarle partido:" />
      <div className="space-y-2">
        {tips.map(([key, text]) => (
          <div key={key} className="flex items-center gap-3 text-sm">
            <kbd className="min-w-40 rounded-md border border-line bg-surface-2/70 px-2 py-1 text-center font-mono text-xs">{key}</kbd>
            <span className="text-muted">{text}</span>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs text-muted">Puedes volver a abrir este asistente desde Ajustes.</p>
    </>
  );
}
