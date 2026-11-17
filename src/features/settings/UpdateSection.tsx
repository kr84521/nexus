import { getVersion } from "@tauri-apps/api/app";
import { Download, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Row, Section } from "@/components/ui/Field";
import { useUpdate } from "@/stores/update";

export function UpdateSection() {
  const [version, setVersion] = useState("");
  const state = useUpdate((s) => s.state);
  const check = useUpdate((s) => s.check);
  const install = useUpdate((s) => s.install);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  const hint = (() => {
    switch (state.status) {
      case "checking":
        return "Comprobando…";
      case "none":
        return "Tienes la última versión";
      case "available":
        return `Nueva versión ${state.update.version} disponible`;
      case "downloading":
        return `Descargando… ${state.percent}%`;
      case "error":
        return `No se pudo comprobar: ${state.message}`;
      default:
        return "Comprueba si hay una versión nueva";
    }
  })();

  return (
    <Section title="Actualizaciones">
      <Row label={`Nexus ${version}`} hint={hint}>
        {state.status === "available" ? (
          <Button variant="primary" size="sm" onClick={() => install()}>
            <Download size={14} /> Instalar y reiniciar
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => check()} disabled={state.status === "checking" || state.status === "downloading"}>
            <RefreshCw size={14} className={state.status === "checking" ? "animate-spin" : ""} /> Buscar actualizaciones
          </Button>
        )}
      </Row>
    </Section>
  );
}
