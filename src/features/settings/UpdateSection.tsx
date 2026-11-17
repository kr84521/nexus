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
      {state.status === "available" && state.update.body?.trim() && <ReleaseNotes text={state.update.body} />}
    </Section>
  );
}

/** Notas de la versión (cuerpo de la GitHub Release, llega en latest.json). Markdown mínimo: `## título` y `- punto`. */
function ReleaseNotes({ text }: { text: string }) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return (
    <div className="py-3">
      <div className="mb-1.5 text-xs font-medium text-muted">Novedades</div>
      <div className="max-h-64 space-y-1 overflow-y-auto pr-2 text-[13px] leading-relaxed">
        {lines.map((l, i) =>
          l.startsWith("#") ? (
            <div key={i} className="pt-2 text-xs font-semibold text-fg first:pt-0">
              {l.replace(/^#+\s*/, "")}
            </div>
          ) : l.startsWith("- ") || l.startsWith("* ") ? (
            <div key={i} className="flex gap-2 text-fg/90">
              <span className="text-accent">•</span>
              <span>{l.slice(2).replace(/\*\*/g, "")}</span>
            </div>
          ) : (
            <p key={i} className="text-muted">
              {l.replace(/\*\*/g, "")}
            </p>
          ),
        )}
      </div>
    </div>
  );
}
