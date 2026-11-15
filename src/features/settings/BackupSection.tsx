import { open, save } from "@tauri-apps/plugin-dialog";
import { Download, FolderInput, FolderOutput, Image as ImageIcon, Upload, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Row, Section } from "@/components/ui/Field";
import { api, errorText } from "@/lib/api";
import { normalizeTheme } from "@/lib/theme";
import { useLibrary } from "@/stores/library";
import { useSettings } from "@/stores/settings";
import { toast } from "@/stores/toast";

/** Fila de fondo personalizado (dentro de la sección Tema). */
export function BackgroundRow() {
  const bg = useSettings((s) => s.theme.backgroundImage);
  const updateTheme = useSettings((s) => s.updateTheme);

  const pick = async () => {
    const file = await open({ multiple: false, filters: [{ name: "Imagen", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }] });
    if (typeof file !== "string") return;
    try {
      updateTheme({ backgroundImage: await api.setBackgroundImage(file) });
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <Row label="Fondo personalizado" hint={bg ? "Se muestra tras la biblioteca; el fondo dinámico va encima" : "Una imagen tuya de fondo"}>
      {bg && (
        <Button size="sm" onClick={() => updateTheme({ backgroundImage: null })}>
          <X size={14} /> Quitar
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={pick}>
        <ImageIcon size={14} /> {bg ? "Cambiar" : "Elegir imagen"}
      </Button>
    </Row>
  );
}

/** Exportar / importar el tema como archivo JSON. */
export function ThemeFileRow() {
  const theme = useSettings((s) => s.theme);
  const updateTheme = useSettings((s) => s.updateTheme);

  const exportTheme = async () => {
    const path = await save({ defaultPath: "nexus-tema.json", filters: [{ name: "Tema de Nexus", extensions: ["json"] }] });
    if (!path) return;
    try {
      const { backgroundImage: _bg, ...portable } = theme; // la ruta del fondo es local a este PC
      await api.writeTextFile(path, JSON.stringify(portable, null, 2));
      toast.success("Tema exportado");
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const importTheme = async () => {
    const path = await open({ multiple: false, filters: [{ name: "Tema de Nexus", extensions: ["json"] }] });
    if (typeof path !== "string") return;
    try {
      const raw = JSON.parse(await api.readTextFile(path));
      const t = normalizeTheme(raw);
      updateTheme({ ...t, backgroundImage: theme.backgroundImage });
      toast.success("Tema importado");
    } catch (e) {
      toast.error(`No se pudo leer el tema: ${errorText(e)}`);
    }
  };

  return (
    <Row label="Compartir tema" hint="Guarda tu tema en un archivo o carga uno de otra persona">
      <Button variant="outline" size="sm" onClick={importTheme}>
        <Upload size={14} /> Importar
      </Button>
      <Button variant="outline" size="sm" onClick={exportTheme}>
        <Download size={14} /> Exportar
      </Button>
    </Row>
  );
}

/** Copia de seguridad completa de la biblioteca. */
export function BackupSection() {
  const load = useLibrary((s) => s.load);
  const loadSettings = useSettings((s) => s.load);
  const [busy, setBusy] = useState(false);

  const exportAll = async () => {
    const dir = await open({ directory: true, multiple: false, title: "Carpeta donde guardar la copia" });
    if (typeof dir !== "string") return;
    setBusy(true);
    try {
      const n = await api.exportLibrary(dir);
      toast.success(`Copia guardada: ${n} juegos con su arte, colecciones y sesiones`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const importAll = async () => {
    const dir = await open({ directory: true, multiple: false, title: "Carpeta de la copia (contiene nexus-library.json)" });
    if (typeof dir !== "string") return;
    setBusy(true);
    try {
      const r = await api.importLibrary(dir);
      await loadSettings();
      await load();
      toast.success(`Restaurado: ${r.games} juegos, ${r.collections} colecciones, ${r.sessions} sesiones, ${r.artworkFiles} imágenes`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Copia de seguridad">
      <Row label="Exportar biblioteca" hint="Arte elegido, colecciones, títulos, tiempo de juego, opciones y ajustes, a una carpeta">
        <Button variant="outline" size="sm" onClick={exportAll} disabled={busy}>
          <FolderOutput size={14} /> Exportar
        </Button>
      </Row>
      <Row label="Importar biblioteca" hint="Restaura una copia; se combina con lo que ya tengas sin borrar nada">
        <Button variant="outline" size="sm" onClick={importAll} disabled={busy}>
          <FolderInput size={14} /> Importar
        </Button>
      </Row>
    </Section>
  );
}
