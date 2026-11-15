// Navegación con mando (Gamepad API). Mueve el foco entre elementos enfocables según su posición
// en pantalla (navegación espacial) y traduce botones a acciones:
//   D-pad / stick izq → mover foco     A → activar     B → atrás (Escape)
//   X → jugar el juego enfocado         Y → favorito    LB/RB → filtro anterior/siguiente
// Los elementos con data-nav="skip" se ignoran; si hay un [data-modal] abierto, solo se navega dentro.

import { useEffect, useState } from "react";

type Dir = "up" | "down" | "left" | "right";

export interface GamepadActions {
  back: () => void;
  play: (gameId: string) => void;
  favorite: (gameId: string) => void;
  cycleFilter: (delta: 1 | -1) => void;
}

const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;
const REPEAT_DELAY = 360;
const REPEAT_RATE = 110;
const DEADZONE = 0.55;

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]';

function candidates(): HTMLElement[] {
  const root: ParentNode = document.querySelector("[data-modal]") ?? document;
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.dataset.nav === "skip" || el.closest('[data-nav="skip"]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  });
}

function center(r: DOMRect) {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Elemento más cercano en la dirección dada, con penalización al desvío perpendicular. */
function pick(from: HTMLElement, dir: Dir): HTMLElement | null {
  const fr = from.getBoundingClientRect();
  const fc = center(fr);
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of candidates()) {
    if (el === from) continue;
    const r = el.getBoundingClientRect();
    const c = center(r);
    let primary: number, secondary: number;
    switch (dir) {
      case "up":
        primary = fr.top - r.bottom;
        secondary = Math.abs(c.x - fc.x);
        break;
      case "down":
        primary = r.top - fr.bottom;
        secondary = Math.abs(c.x - fc.x);
        break;
      case "left":
        primary = fr.left - r.right;
        secondary = Math.abs(c.y - fc.y);
        break;
      case "right":
        primary = r.left - fr.right;
        secondary = Math.abs(c.y - fc.y);
        break;
    }
    if (primary < -4) continue; // no está en esa dirección
    // Prefiere elementos alineados: el desvío perpendicular pesa el doble.
    const score = Math.max(primary, 0) + secondary * 2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

function focusEl(el: HTMLElement | null) {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
}

function current(): HTMLElement | null {
  const a = document.activeElement as HTMLElement | null;
  return a && a !== document.body && candidates().includes(a) ? a : null;
}

function move(dir: Dir) {
  const from = current();
  if (!from) {
    // Sin foco: empieza por la primera tarjeta de juego, o el primer enfocable.
    const first = document.querySelector<HTMLElement>("[data-game-id]") ?? candidates()[0] ?? null;
    focusEl(first);
    return;
  }
  focusEl(pick(from, dir));
}

function focusedGameId(): string | null {
  return (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-game-id]")?.dataset.gameId ?? null;
}

export function useGamepad(actions: GamepadActions): boolean {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let raf = 0;
    const held = new Map<string, number>(); // acción → momento de la próxima repetición
    let wasConnected = false;

    const fire = (key: string, now: number, fn: () => void, repeat = true) => {
      const next = held.get(key);
      if (next === undefined) {
        fn();
        held.set(key, repeat ? now + REPEAT_DELAY : Infinity);
      } else if (now >= next) {
        fn();
        held.set(key, now + REPEAT_RATE);
      }
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const gp = navigator.getGamepads?.().find((g) => g && g.connected);
      const isConnected = !!gp;
      if (isConnected !== wasConnected) {
        wasConnected = isConnected;
        setConnected(isConnected);
        document.documentElement.dataset.gamepad = String(isConnected);
      }
      if (!gp) return;
      const now = performance.now();
      const pressed = (i: number) => !!gp.buttons[i]?.pressed;
      const ax = gp.axes[0] ?? 0;
      const ay = gp.axes[1] ?? 0;
      const active = new Set<string>();

      const dirs: [string, boolean, Dir][] = [
        ["up", pressed(BTN.UP) || ay < -DEADZONE, "up"],
        ["down", pressed(BTN.DOWN) || ay > DEADZONE, "down"],
        ["left", pressed(BTN.LEFT) || ax < -DEADZONE, "left"],
        ["right", pressed(BTN.RIGHT) || ax > DEADZONE, "right"],
      ];
      for (const [key, on, dir] of dirs) {
        if (on) {
          active.add(key);
          fire(key, now, () => move(dir));
        }
      }

      const once = (key: string, on: boolean, fn: () => void) => {
        if (on) {
          active.add(key);
          fire(key, now, fn, false);
        }
      };
      once("a", pressed(BTN.A), () => (document.activeElement as HTMLElement | null)?.click());
      once("b", pressed(BTN.B), actions.back);
      once("x", pressed(BTN.X), () => {
        const id = focusedGameId();
        if (id) actions.play(id);
      });
      once("y", pressed(BTN.Y), () => {
        const id = focusedGameId();
        if (id) actions.favorite(id);
      });
      once("lb", pressed(BTN.LB), () => actions.cycleFilter(-1));
      once("rb", pressed(BTN.RB), () => actions.cycleFilter(1));
      once("start", pressed(BTN.START), () => {
        const id = focusedGameId();
        if (id) actions.play(id);
      });

      for (const key of Array.from(held.keys())) if (!active.has(key)) held.delete(key);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      delete document.documentElement.dataset.gamepad;
    };
  }, [actions]);

  return connected;
}
