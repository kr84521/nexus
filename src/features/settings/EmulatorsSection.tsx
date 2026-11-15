import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Section } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useLibrary } from "@/stores/library";
import { useSettings, type EmulatorConfig } from "@/stores/settings";

/** Plantillas de emuladores habituales: argumentos y extensiones por defecto. */
const PRESETS: { name: string; platform: string; args: string; extensions: string }[] = [
  { name: "RetroArch", platform: "Varias", args: '-L "cores\\snes9x_libretro.dll" "{rom}"', extensions: "zip, sfc, smc, nes, gba, gb, gbc, md, bin, n64, z64" },
  { name: "Dolphin", platform: "GameCube / Wii", args: '-b -e "{rom}"', extensions: "iso, rvz, gcz, wbfs, ciso" },
  { name: "PCSX2", platform: "PlayStation 2", args: '-fullscreen -- "{rom}"', extensions: "iso, chd, cso, bin" },
  { name: "DuckStation", platform: "PlayStation", args: '-fullscreen "{rom}"', extensions: "chd, cue, bin, iso, pbp" },
  { name: "PPSSPP", platform: "PSP", args: '--fullscreen "{rom}"', extensions: "iso, cso, chd, pbp" },
  { name: "RPCS3", platform: "PlayStation 3", args: '--no-gui "{rom}"', extensions: "bin, self, elf" },
  { name: "Ryujinx", platform: "Nintendo Switch", args: '"{rom}"', extensions: "nsp, xci, nca" },
  { name: "Cemu", platform: "Wii U", args: '-f -g "{rom}"', extensions: "wua, wud, wux, rpx" },
  { name: "Citra / Azahar", platform: "Nintendo 3DS", args: '"{rom}"', extensions: "3ds, cci, cxi, app" },
  { name: "melonDS", platform: "Nintendo DS", args: '"{rom}"', extensions: "nds" },
  { name: "mGBA", platform: "Game Boy Advance", args: '-f "{rom}"', extensions: "gba, gb, gbc" },
  { name: "Xenia", platform: "Xbox 360", args: '"{rom}"', extensions: "iso, xex, zar" },
  { name: "xemu", platform: "Xbox", args: '-full-screen -dvd_path "{rom}"', extensions: "iso, xiso" },
  { name: "Otro", platform: "", args: '"{rom}"', extensions: "" },
];

const empty = (): EmulatorConfig => ({ id: `emu-${Date.now()}`, name: "", exePath: "", args: '"{rom}"', romsDir: "", extensions: [], platform: "" });

export function EmulatorsSection() {
  const emulators = useSettings((s) => s.emulators);
  const setEmulators = useSettings((s) => s.setEmulators);
  const scan = useLibrary((s) => s.scan);
  const [editing, setEditing] = useState<EmulatorConfig | null>(null);
  const [extText, setExtText] = useState("");

  const startNew = () => {
    setEditing(empty());
    setExtText("");
  };
  const edit = (e: EmulatorConfig) => {
    setEditing({ ...e });
    setExtText(e.extensions.join(", "));
  };
  const applyPreset = (name: string) => {
    const p = PRESETS.find((x) => x.name === name);
    if (!p || !editing) return;
    setEditing({ ...editing, name: p.name === "Otro" ? editing.name : p.name, platform: p.platform, args: p.args });
    setExtText(p.extensions);
  };
  const save = async () => {
    if (!editing) return;
    const cfg: EmulatorConfig = {
      ...editing,
      extensions: extText.split(/[,\s]+/).map((x) => x.trim().replace(/^\./, "").toLowerCase()).filter(Boolean),
    };
    const next = emulators.some((e) => e.id === cfg.id) ? emulators.map((e) => (e.id === cfg.id ? cfg : e)) : [...emulators, cfg];
    await setEmulators(next);
    setEditing(null);
    scan();
  };
  const remove = async (id: string) => {
    await setEmulators(emulators.filter((e) => e.id !== id));
    scan(true);
  };
  const pickExe = async () => {
    const f = await open({ multiple: false, filters: [{ name: "Ejecutable", extensions: ["exe"] }] });
    if (typeof f === "string" && editing) setEditing({ ...editing, exePath: f });
  };
  const pickDir = async () => {
    const d = await open({ directory: true, multiple: false, title: "Carpeta de ROMs" });
    if (typeof d === "string" && editing) setEditing({ ...editing, romsDir: d });
  };

  const valid = !!editing && editing.name.trim() && editing.exePath && editing.romsDir && extText.trim();

  return (
    <Section title="Emuladores">
      <div className="py-3">
        <p className="text-xs text-muted">Cada ROM de la carpeta aparece como un juego, con su portada, y se lanza con el emulador.</p>
        <ul className="mt-3 flex flex-col gap-1.5">
          {emulators.map((e) => (
            <li key={e.id} className="flex items-center gap-2 rounded-card bg-surface-2/60 px-3 py-1.5 text-sm">
              <button onClick={() => edit(e)} className="min-w-0 flex-1 truncate text-left hover:text-accent" title={`${e.exePath}\n${e.romsDir}`}>
                <span className="font-medium">{e.name}</span>
                {e.platform && <span className="ml-2 text-xs text-muted">{e.platform}</span>}
                <span className="ml-2 text-xs text-muted">· {e.extensions.join(", ")}</span>
              </button>
              <button onClick={() => remove(e.id)} className="rounded p-1 text-muted hover:bg-fg/8 hover:text-red-400" title="Quitar">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
        <Button variant="outline" size="sm" onClick={startNew} className="mt-3">
          <Plus size={14} /> Añadir emulador
        </Button>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.name ? `Emulador · ${editing.name}` : "Nuevo emulador"} width="max-w-lg">
        {editing && (
          <div className="flex flex-col gap-4 p-5">
            <label className="flex flex-col gap-1.5 text-xs text-muted">
              Plantilla
              <select
                defaultValue=""
                onChange={(e) => applyPreset(e.target.value)}
                className="focus-ring h-10 rounded-card border border-line bg-surface-2/70 px-2 text-sm text-fg"
              >
                <option value="" disabled>
                  Elige un emulador para rellenar argumentos y extensiones…
                </option>
                {PRESETS.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                    {p.platform ? ` — ${p.platform}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-xs text-muted">
                Nombre
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Dolphin" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted">
                Plataforma
                <Input value={editing.platform} onChange={(e) => setEditing({ ...editing, platform: e.target.value })} placeholder="GameCube / Wii" />
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-xs text-muted">
              Ejecutable del emulador
              <div className="flex gap-2">
                <Input value={editing.exePath} readOnly placeholder="Dolphin.exe" />
                <Button variant="outline" onClick={pickExe} className="shrink-0">
                  <FolderOpen size={16} />
                </Button>
              </div>
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-muted">
              Carpeta de ROMs
              <div className="flex gap-2">
                <Input value={editing.romsDir} readOnly placeholder="D:\\ROMs\\Wii" />
                <Button variant="outline" onClick={pickDir} className="shrink-0">
                  <FolderOpen size={16} />
                </Button>
              </div>
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-muted">
              Extensiones (separadas por comas)
              <Input value={extText} onChange={(e) => setExtText(e.target.value)} placeholder="iso, rvz, wbfs" />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-muted">
              Argumentos ({"{rom}"} = ruta de la ROM)
              <Input value={editing.args} onChange={(e) => setEditing({ ...editing, args: e.target.value })} className="font-mono text-xs" />
            </label>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEditing(null)}>Cancelar</Button>
              <Button variant="primary" onClick={save} disabled={!valid}>
                Guardar y escanear
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Section>
  );
}
