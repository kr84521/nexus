// Estado compartido del actualizador: lo usan la comprobación periódica (App), el indicador de la barra
// lateral y la sección de Ajustes. Una versión encontrada se queda marcada hasta que se instala.
import { create } from "zustand";
import { api } from "@/lib/api";
import { checkForUpdate, installUpdate, type UpdateState } from "@/lib/updater";
import { toast } from "./toast";

/** Cada cuánto se vuelve a mirar si hay versión nueva mientras Nexus sigue abierto. */
export const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface UpdateStore {
  state: UpdateState;
  /** Versión de la que ya se avisó en esta ejecución (para no repetir el aviso cada 6 h). */
  notified: string | null;
  /** `silent`: comprobación automática; no pisa una versión ya encontrada si falla la red. */
  check: (silent?: boolean) => Promise<void>;
  install: () => Promise<void>;
}

export const useUpdate = create<UpdateStore>((set, get) => ({
  state: { status: "idle" },
  notified: null,

  check: async (silent = false) => {
    const prev = get().state;
    if (prev.status === "checking" || prev.status === "downloading") return;
    if (!silent) set({ state: { status: "checking" } });
    const next = await checkForUpdate();
    if (silent && next.status === "error") return; // sin red: mantener lo que hubiera
    if (silent && next.status === "none" && prev.status === "available") return;
    set({ state: next });

    if (next.status === "available" && get().notified !== next.update.version) {
      const version = next.update.version;
      set({ notified: version });
      toast.info(`Nexus ${version} disponible: instálala desde Ajustes`);
      // Si la ventana está en la bandeja o minimizada, el aviso interno no se vería.
      api
        .notifyWhenHidden(`Nexus ${version} disponible`, "Abre Nexus y ve a Ajustes para instalar la actualización")
        .catch(() => {});
    }
  },

  install: async () => {
    const s = get().state;
    if (s.status !== "available") return;
    const { update } = s;
    set({ state: { status: "downloading", percent: 0 } });
    try {
      await installUpdate(update, (percent) => set({ state: { status: "downloading", percent } }));
    } catch (e) {
      // Volver a "disponible" para que el indicador siga y se pueda reintentar.
      set({ state: { status: "available", update } });
      toast.error(`No se pudo instalar la actualización: ${String(e)}`);
    }
  },
}));
