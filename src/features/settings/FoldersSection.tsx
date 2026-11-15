import { open } from "@tauri-apps/plugin-dialog";
import { FolderPlus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Field";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";

/** Carpetas propias que se escanean en busca de juegos (una subcarpeta = un juego). */
export function FoldersSection() {
  const folders = useSettings((s) => s.scanFolders);
  const setFolders = useSettings((s) => s.setScanFolders);
  const scan = useLibrary((s) => s.scan);

  const add = async () => {
    const dir = await open({ directory: true, multiple: false, title: "Carpeta con juegos" });
    if (typeof dir !== "string" || folders.includes(dir)) return;
    await setFolders([...folders, dir]);
    scan();
  };

  const remove = async (dir: string) => {
    await setFolders(folders.filter((f) => f !== dir));
    scan(true);
  };

  return (
    <Section title="Carpetas propias">
      <div className="py-3">
        <p className="text-xs text-muted">
          Cada subcarpeta con un ejecutable se añade como juego. Útil para emuladores, juegos sin tienda o copias de GOG.
        </p>
        <ul className="mt-3 flex flex-col gap-1.5">
          {folders.map((f) => (
            <li key={f} className="flex items-center gap-2 rounded-card bg-surface-2/60 px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate" title={f}>
                {f}
              </span>
              <button onClick={() => remove(f)} className="rounded p-1 text-muted hover:bg-fg/8 hover:text-fg" title="Quitar">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
        <Button variant="outline" size="sm" onClick={add} className="mt-3">
          <FolderPlus size={14} /> Añadir carpeta
        </Button>
      </div>
    </Section>
  );
}
