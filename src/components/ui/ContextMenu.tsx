import { Check } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type MenuEntry =
  | "separator"
  | {
      label: string;
      icon?: ReactNode;
      onClick: () => void;
      checked?: boolean;
      danger?: boolean;
      disabled?: boolean;
    };

export interface MenuPosition {
  x: number;
  y: number;
}

/** Menú contextual flotante. Se cierra con clic fuera, Escape o scroll. */
export function ContextMenu({ at, entries, onClose }: { at: MenuPosition; entries: MenuEntry[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const x = Math.min(at.x, window.innerWidth - width - 8);
    const y = Math.min(at.y, window.innerHeight - height - 8);
    setPos({ x: Math.max(8, x), y: Math.max(8, y) });
  }, [at]);

  useLayoutEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
      className="panel fixed z-[70] min-w-[210px] rounded-card border border-line py-1 shadow-2xl"
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((e, i) =>
        e === "separator" ? (
          <div key={i} className="my-1 h-px bg-line" />
        ) : (
          <button
            key={i}
            disabled={e.disabled}
            onClick={() => {
              onClose();
              e.onClick();
            }}
            className={`flex w-full items-center gap-2.5 px-3 py-[7px] text-left text-[13px] transition disabled:opacity-40
              ${e.danger ? "text-red-400 hover:bg-red-500/12" : "text-fg/85 hover:bg-fg/8 hover:text-fg"}`}
          >
            <span className="flex w-4 shrink-0 items-center justify-center text-muted">
              {e.checked !== undefined ? (e.checked ? <Check size={14} className="text-accent" /> : null) : e.icon}
            </span>
            <span className="flex-1 truncate">{e.label}</span>
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
