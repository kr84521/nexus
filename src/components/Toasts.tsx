import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useToasts } from "@/stores/toast";

const icons = {
  info: <Info size={16} className="text-accent" />,
  success: <CheckCircle2 size={16} className="text-emerald-400" />,
  error: <AlertCircle size={16} className="text-red-400" />,
};

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed right-5 bottom-5 z-[60] flex w-80 flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            onClick={() => dismiss(t.id)}
            className="panel pointer-events-auto flex items-start gap-2.5 rounded-card border border-line px-3.5 py-3 text-left text-sm shadow-xl"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            layout
          >
            <span className="mt-0.5 shrink-0">{icons[t.kind]}</span>
            <span className="break-words">{t.text}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
