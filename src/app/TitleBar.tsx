import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";

const win = getCurrentWindow();

export function TitleBar() {
  return (
    <div
      data-tauri-drag-region
      className="flex h-10 shrink-0 items-center justify-between select-none"
      onDoubleClick={() => win.toggleMaximize()}
    >
      <div data-tauri-drag-region className="flex items-center gap-2 pl-4">
        <span className="size-2.5 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />
        <span data-tauri-drag-region className="text-[13px] font-semibold tracking-wide text-fg/80">
          Nexus
        </span>
      </div>
      <div className="flex h-full" data-nav="skip">
        <WinBtn onClick={() => win.minimize()} label="Minimizar">
          <Minus size={15} />
        </WinBtn>
        <WinBtn onClick={() => win.toggleMaximize()} label="Maximizar">
          <Square size={12} />
        </WinBtn>
        <WinBtn onClick={() => win.close()} label="Cerrar" danger>
          <X size={16} />
        </WinBtn>
      </div>
    </div>
  );
}

function WinBtn({
  children,
  onClick,
  label,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={`flex h-full w-11 items-center justify-center text-muted transition
        ${danger ? "hover:bg-red-500 hover:text-white" : "hover:bg-fg/10 hover:text-fg"}`}
    >
      {children}
    </button>
  );
}
