import { FolderOpen, Loader2, RotateCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { api, errorText } from "@/lib/api";
import { displayTitle, relativeTime } from "@/lib/art";
import { toast } from "@/stores/toast";
import type { Game, SaveInfo } from "@/types";

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Botón "Partidas" de la ficha: abre el panel de copias de seguridad de guardados. */
export function SavesPanel({ game, open, onClose }: { game: Game; open: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<SaveInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setError(null);
    api.savesInfo(game.id).then(setInfo).catch((e) => setError(errorText(e)));
  };

  useEffect(() => {
    if (open) {
      setInfo(null);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, game.id]);

  const backup = async () => {
    setBusy(true);
    try {
      const b = await api.backupSaves(game.id);
      toast.success(`Copia creada: ${b.files} archivos (${fmtBytes(b.bytes)})`);
      load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (name: string) => {
    setBusy(true);
    try {
      const n = await api.restoreSaves(game.id, name);
      toast.success(`Restaurados ${n} archivos`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Partidas guardadas · ${displayTitle(game)}`} width="max-w-xl">
      <div className="flex flex-col gap-4 p-5">
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : !info ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Buscando rutas de guardado… (la primera vez descarga la base de datos, ~18 MB)
          </p>
        ) : (
          <>
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Dónde guarda</h4>
              {info.paths.length === 0 ? (
                <p className="mt-1 text-sm text-muted">
                  No se conocen rutas de guardado para este juego, o todavía no has jugado. Las copias usan la base de datos
                  comunitaria de PCGamingWiki/Ludusavi.
                </p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1">
                  {info.paths.map((p) => (
                    <li key={p} className="flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate font-mono text-fg/80" title={p}>
                        {p}
                      </span>
                      <button onClick={() => api.openPath(p)} className="rounded p-1 text-muted hover:text-fg" title="Abrir">
                        <FolderOpen size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Copias ({info.backups.length})</h4>
              <Button variant="primary" size="sm" onClick={backup} disabled={busy || info.paths.length === 0}>
                <Save size={14} /> Hacer copia ahora
              </Button>
            </div>
            {info.backups.length === 0 ? (
              <p className="text-sm text-muted">Aún no hay copias. Se guardan en {info.destination} (se conservan las 5 últimas).</p>
            ) : (
              <ul className="divide-y divide-line/60 rounded-card border border-line">
                {info.backups.map((b) => (
                  <li key={b.name} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block">{relativeTime(b.createdAt)}</span>
                      <span className="text-xs text-muted">
                        {b.files} archivos · {fmtBytes(b.bytes)}
                      </span>
                    </span>
                    <button onClick={() => api.openPath(b.path)} className="rounded p-1.5 text-muted hover:text-fg" title="Abrir carpeta">
                      <FolderOpen size={14} />
                    </button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        if (confirm("Restaurar sobrescribe las partidas actuales. ¿Continuar?")) restore(b.name);
                      }}
                    >
                      <RotateCcw size={13} /> Restaurar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
