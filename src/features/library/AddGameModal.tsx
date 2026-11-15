import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { api, errorText } from "@/lib/api";
import { useLibrary } from "@/stores/library";
import { toast } from "@/stores/toast";

export function AddGameModal({ open: isOpen, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [exe, setExe] = useState("");
  const [busy, setBusy] = useState(false);
  const upsert = useLibrary((s) => s.upsert);
  const select = useLibrary((s) => s.select);

  const pick = async () => {
    const file = await open({ multiple: false, filters: [{ name: "Ejecutable", extensions: ["exe"] }] });
    if (typeof file === "string") {
      setExe(file);
      if (!title) {
        const name = file.split(/[\\/]/).pop()?.replace(/\.exe$/i, "") ?? "";
        setTitle(name);
      }
    }
  };

  const submit = async () => {
    if (!title.trim() || !exe) return;
    setBusy(true);
    try {
      const g = await api.addManualGame(title, exe);
      upsert(g);
      select(g.id);
      toast.success(`${g.title} añadido`);
      setTitle("");
      setExe("");
      onClose();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} title="Añadir juego a mano" width="max-w-md">
      <div className="flex flex-col gap-4 p-5">
        <label className="flex flex-col gap-1.5 text-xs text-muted">
          Ejecutable
          <div className="flex gap-2">
            <Input value={exe} readOnly placeholder="Elige el .exe del juego" />
            <Button variant="outline" onClick={pick} className="shrink-0">
              <FolderOpen size={16} /> Buscar
            </Button>
          </div>
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-muted">
          Título
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nombre del juego" />
        </label>
        <p className="text-xs text-muted/80">El arte se buscará automáticamente en SteamGridDB por el título.</p>
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={busy || !title.trim() || !exe}>
            Añadir
          </Button>
        </div>
      </div>
    </Modal>
  );
}
