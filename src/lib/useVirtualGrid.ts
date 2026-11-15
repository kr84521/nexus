// Virtualización de la cuadrícula de portadas: solo se montan las filas visibles (más un margen).
// Replica el cálculo de columnas de `repeat(auto-fill, minmax(var(--cover-w), 1fr))`.
import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

export interface VirtualGrid {
  cols: number;
  /** Índices [start, end) de los elementos a renderizar */
  start: number;
  end: number;
  padTop: number;
  padBottom: number;
}

const TITLE_H = 26; // altura aproximada de la línea de título bajo la portada
const OVERSCAN_ROWS = 2;

export function useVirtualGrid(
  scrollRef: RefObject<HTMLElement | null>,
  count: number,
  coverW: number,
  gap: number,
  showTitles: boolean,
): VirtualGrid {
  const [width, setWidth] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grid = el.querySelector<HTMLElement>("[data-virtual-grid]");
    const measure = () => {
      setWidth(grid?.clientWidth ?? el.clientWidth);
      setViewH(el.clientHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (grid) ro.observe(grid);
    return () => ro.disconnect();
  }, [scrollRef, count]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setScrollTop(el.scrollTop));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [scrollRef]);

  if (width === 0 || count === 0) return { cols: 1, start: 0, end: count, padTop: 0, padBottom: 0 };

  const cols = Math.max(1, Math.floor((width + gap) / (coverW + gap)));
  const cardW = (width - (cols - 1) * gap) / cols;
  const rowH = cardW * 1.5 + (showTitles ? TITLE_H : 0) + gap;
  const rows = Math.ceil(count / cols);

  // El contenido empieza bajo la cabecera: la posición de la cuadrícula respecto al scroll se
  // aproxima con el offsetTop del contenedor de la cuadrícula.
  const gridEl = scrollRef.current?.querySelector<HTMLElement>("[data-virtual-grid]");
  const offset = gridEl ? gridEl.offsetTop - (scrollRef.current?.offsetTop ?? 0) : 0;
  const firstRow = Math.max(0, Math.floor((scrollTop - offset) / rowH) - OVERSCAN_ROWS);
  const lastRow = Math.min(rows, Math.ceil((scrollTop - offset + viewH) / rowH) + OVERSCAN_ROWS);

  return {
    cols,
    start: firstRow * cols,
    end: Math.min(count, lastRow * cols),
    padTop: firstRow * rowH,
    padBottom: Math.max(0, (rows - lastRow) * rowH),
  };
}
