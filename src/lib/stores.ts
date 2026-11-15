import type { Store } from "@/types";

export const STORE_META: Record<Store, { label: string; color: string; short: string }> = {
  steam: { label: "Steam", color: "#66c0f4", short: "ST" },
  epic: { label: "Epic Games", color: "#e5e5e5", short: "EP" },
  gog: { label: "GOG", color: "#b46ce0", short: "GOG" },
  ea: { label: "EA App", color: "#ff4747", short: "EA" },
  ubisoft: { label: "Ubisoft Connect", color: "#3d8bff", short: "UB" },
  battlenet: { label: "Battle.net", color: "#148eff", short: "BN" },
  xbox: { label: "Xbox", color: "#4cc25a", short: "XB" },
  rom: { label: "Emulador", color: "#f59e0b", short: "EMU" },
  manual: { label: "Añadidos a mano", color: "#a3a3a3", short: "PC" },
};

export const STORE_ORDER: Store[] = ["steam", "epic", "gog", "ea", "ubisoft", "battlenet", "xbox", "rom", "manual"];
