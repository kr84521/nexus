import { Activity, Clock, Flame, Gamepad2, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, errorText } from "@/lib/api";
import { formatPlaytime, relativeTime } from "@/lib/art";
import { useLibrary } from "@/stores/library";
import { toast } from "@/stores/toast";
import type { StatsReport } from "@/types";

export function StatsView() {
  const [stats, setStats] = useState<StatsReport | null>(null);
  const select = useLibrary((s) => s.select);

  useEffect(() => {
    api.getStats().then(setStats).catch((e) => toast.error(errorText(e)));
  }, []);

  if (!stats) return null;

  const empty = stats.sessionsCount === 0;

  return (
    <div className="h-full overflow-y-auto px-7 pb-10">
      <header className="flex items-center gap-4 pt-2 pb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Actividad</h1>
      </header>

      {empty ? (
        <div className="flex h-[60%] flex-col items-center justify-center gap-3 text-center">
          <Activity size={40} className="text-muted/60" />
          <h2 className="text-lg font-semibold">Todavía no hay sesiones</h2>
          <p className="max-w-sm text-sm text-muted">
            Lanza un juego desde Nexus y aquí verás tus horas, rachas y los juegos a los que más juegas.
          </p>
        </div>
      ) : (
        <div className="flex max-w-6xl flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Tile icon={<Clock size={16} />} label="Esta semana" value={formatPlaytime(stats.weekSecs)} />
            <Tile icon={<Clock size={16} />} label="Últimos 30 días" value={formatPlaytime(stats.monthSecs)} />
            <Tile icon={<Trophy size={16} />} label="Total" value={formatPlaytime(stats.totalSecs)} />
            <Tile icon={<Flame size={16} />} label="Racha" value={`${stats.streakDays} ${stats.streakDays === 1 ? "día" : "días"}`} />
            <Tile icon={<Gamepad2 size={16} />} label="Sesiones" value={`${stats.sessionsCount}`} hint={`${stats.gamesPlayed} juegos`} />
          </div>

          <Card title="Último año">
            <Heatmap days={stats.days} />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Más jugados · 30 días">
              <TopBars items={stats.topMonth} onPick={select} />
            </Card>
            <Card title="Más jugados · siempre">
              <TopBars items={stats.topAllTime} onPick={select} />
            </Card>
          </div>

          <Card title="Sesiones recientes">
            <ul className="divide-y divide-line/60">
              {stats.recent.map((s, i) => (
                <li key={i} className="flex items-center gap-3 py-2 text-sm">
                  <button onClick={() => select(s.gameId)} className="min-w-0 flex-1 truncate text-left hover:text-accent">
                    {s.title}
                  </button>
                  <span className="text-xs text-muted">{relativeTime(s.startedAt)}</span>
                  <span className="w-20 text-right tabular-nums">{formatPlaytime(s.secs)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

function Tile({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[calc(var(--radius)+4px)] border border-line bg-surface/60 px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span className="text-accent">{icon}</span> {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[calc(var(--radius)+4px)] border border-line bg-surface/60 p-5">
      <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{title}</h3>
      {children}
    </section>
  );
}

/** Barras horizontales de una sola serie (el acento), finas, con el valor en texto. */
function TopBars({ items, onPick }: { items: StatsReport["topAllTime"]; onPick: (id: string) => void }) {
  const max = Math.max(1, ...items.map((i) => i.secs));
  if (items.length === 0) return <p className="text-sm text-muted">Sin datos en este periodo.</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((it) => (
        <li key={it.gameId} className="group" title={`${it.title}: ${formatPlaytime(it.secs)} en ${it.sessions} ${it.sessions === 1 ? "sesión" : "sesiones"}`}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <button onClick={() => onPick(it.gameId)} className="min-w-0 truncate text-left hover:text-accent">
              {it.title}
            </button>
            <span className="shrink-0 text-xs tabular-nums text-muted">{formatPlaytime(it.secs)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-fg/8">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(it.secs / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Mapa de calor anual: una columna por semana, una fila por día. Escala secuencial de un solo tono. */
function Heatmap({ days }: { days: StatsReport["days"] }) {
  const { weeks, months, max } = useMemo(() => {
    const bySec = new Map(days.map((d) => [d.day, d.secs]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Empieza el lunes de hace 52 semanas.
    const start = new Date(today);
    start.setDate(start.getDate() - 364 - ((start.getDay() + 6) % 7));
    const weeks: { date: Date; secs: number }[][] = [];
    const months: { label: string; col: number }[] = [];
    let lastMonth = -1;
    for (let d = new Date(start), col = 0; d <= today; col++) {
      const week: { date: Date; secs: number }[] = [];
      for (let i = 0; i < 7 && d <= today; i++) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        week.push({ date: new Date(d), secs: bySec.get(key) ?? 0 });
        if (d.getMonth() !== lastMonth && d.getDate() <= 7) {
          lastMonth = d.getMonth();
          months.push({ label: d.toLocaleDateString("es-ES", { month: "short" }), col });
        }
        d.setDate(d.getDate() + 1);
      }
      weeks.push(week);
    }
    return { weeks, months, max: Math.max(1, ...days.map((d) => d.secs)) };
  }, [days]);

  const level = (secs: number) => (secs === 0 ? 0 : Math.min(4, 1 + Math.floor((secs / max) * 3.999)));
  const opacity = [0, 0.3, 0.5, 0.75, 1];
  const cell = 12, gap = 3;

  return (
    <div className="overflow-x-auto">
      <svg width={weeks.length * (cell + gap) + 30} height={7 * (cell + gap) + 18} className="block">
        {months.map((m) => (
          <text key={m.col} x={30 + m.col * (cell + gap)} y={10} className="fill-muted text-[10px]">
            {m.label}
          </text>
        ))}
        {["L", "", "X", "", "V", "", "D"].map((l, i) => (
          <text key={i} x={0} y={18 + i * (cell + gap) + cell - 2} className="fill-muted text-[10px]">
            {l}
          </text>
        ))}
        {weeks.map((week, wi) =>
          week.map((d, di) => {
            const lv = level(d.secs);
            return (
              <rect
                key={`${wi}-${di}`}
                x={30 + wi * (cell + gap)}
                y={18 + di * (cell + gap)}
                width={cell}
                height={cell}
                rx={3}
                className={lv === 0 ? "fill-fg/8" : "fill-accent"}
                style={lv ? { opacity: opacity[lv] } : undefined}
              >
                <title>
                  {d.date.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}:{" "}
                  {d.secs ? formatPlaytime(d.secs) : "sin juego"}
                </title>
              </rect>
            );
          }),
        )}
      </svg>
    </div>
  );
}
