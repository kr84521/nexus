import { getVersion } from "@tauri-apps/api/app";
import { Download, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Row, Section } from "@/components/ui/Field";
import { checkForUpdate, installUpdate, type UpdateState } from "@/lib/updater";
import { toast } from "@/stores/toast";

export function UpdateSection() {
  const [version, setVersion] = useState("");
  const [state, setState] = useState<UpdateState>({ status: "idle" });

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  const check = async () => {
    setState({ status: "checking" });
    setState(await checkForUpdate());
  };

  const install = async () => {
    if (state.status !== "available") return;
    const { update } = state;
    setState({ status: "downloading", percent: 0 });
    try {
      await installUpdate(update, (percent) => setState({ status: "downloading", percent }));
    } catch (e) {
      setState({ status: "error", message: String(e) });
      toast.error("No se pudo instalar la actualización");
    }
  };

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
          <Button variant="primary" size="sm" onClick={install}>
            <Download size={14} /> Instalar y reiniciar
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={check} disabled={state.status === "checking" || state.status === "downloading"}>
            <RefreshCw size={14} className={state.status === "checking" ? "animate-spin" : ""} /> Buscar actualizaciones
          </Button>
        )}
      </Row>
    </Section>
  );
}
