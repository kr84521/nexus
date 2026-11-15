import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Row, Toggle } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { api, errorText } from "@/lib/api";
import { displayTitle } from "@/lib/art";
import { useLibrary } from "@/stores/library";
import { toast } from "@/stores/toast";
import type { Game, LaunchOptions } from "@/types";

export function LaunchOptionsModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const upsert = useLibrary((s) => s.upsert);
  const [o, setO] = useState<LaunchOptions>({ ...game.launchOptions });
  const [saving, setSaving] = useState(false);

  const hasExe = game.sources.some((s) => s.launch.kind === "exe");
  const hasSteam = game.sources.some((s) => s.store === "steam");
  const argsSupported = hasExe || hasSteam;

  const save = async () => {
    setSaving(true);
    try {
      upsert(await api.setLaunchOptions(game.id, o));
      toast.success("Opciones guardadas");
      onClose();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, hint: string, key: "args" | "preCommand" | "postCommand", placeholder: string, disabled = false) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <Input
        value={o[key]}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setO({ ...o, [key]: e.target.value })}
        className="font-mono text-xs disabled:opacity-40"
      />
      <span className="text-xs text-muted">{hint}</span>
    </label>
  );

  return (
    <Modal open onClose={onClose} title={`Opciones de lanzamiento · ${displayTitle(game)}`} width="max-w-lg">
      <div className="flex flex-col gap-5 p-5">
        {field(
          "Argumentos",
          argsSupported
            ? "Se añaden al ejecutable (o a Steam mediante steam://run). Usa comillas para rutas con espacios."
            : "Esta tienda no admite argumentos de lanzamiento desde fuera.",
          "args",
          "-windowed -novid",
          !argsSupported,
        )}
        {field("Antes de jugar", "Comando de consola (cmd). Ej.: abrir Discord, cambiar perfil de audio.", "preCommand", 'start "" "C:\\Users\\tu\\AppData\\Local\\Discord\\Update.exe" --processStart Discord.exe')}
        {field("Al salir del juego", "Se ejecuta cuando termina la sesión.", "postCommand", "nircmd setdefaultsounddevice Altavoces")}
        <div className="divide-y divide-line/70 rounded-card border border-line px-4">
          <Row label="Cerrar la tienda al salir" hint="Cierra Steam/Epic/GOG… cuando termina el juego">
            <Toggle checked={o.closeStoreOnExit} onChange={(v) => setO({ ...o, closeStoreOnExit: v })} />
          </Row>
          <Row label="Ejecutar como administrador" hint={hasExe ? "Muestra el aviso de Windows (UAC) al lanzar" : "Solo para juegos lanzados por ejecutable"}>
            <Toggle checked={o.runAsAdmin} onChange={(v) => setO({ ...o, runAsAdmin: v })} />
          </Row>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
