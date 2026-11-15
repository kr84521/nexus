// Actualizaciones de Nexus (plugin updater de Tauri). El endpoint y la clave pública están en
// src-tauri/tauri.conf.json; los instaladores firmados se publican como GitHub Release con latest.json.
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { errorText } from "./api";

export type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "none" }
  | { status: "available"; update: Update }
  | { status: "downloading"; percent: number }
  | { status: "error"; message: string };

export async function checkForUpdate(): Promise<UpdateState> {
  try {
    const update = await check();
    return update ? { status: "available", update } : { status: "none" };
  } catch (e) {
    return { status: "error", message: errorText(e) };
  }
}

export async function installUpdate(update: Update, onProgress: (percent: number) => void): Promise<void> {
  let total = 0;
  let done = 0;
  await update.downloadAndInstall((ev) => {
    if (ev.event === "Started") total = ev.data.contentLength ?? 0;
    else if (ev.event === "Progress") {
      done += ev.data.chunkLength;
      if (total) onProgress(Math.round((done / total) * 100));
    } else if (ev.event === "Finished") onProgress(100);
  });
  await relaunch();
}
