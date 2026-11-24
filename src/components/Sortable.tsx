import { GripVertical } from 'lucide-react';
import { useRef, useState, type PointerEvent, type ReactNode } from 'react';

interface Drag {
  from: number;
  to: number;
  dy: number;
}

// A list whose rows can be dragged by their grip handle (touch or mouse).
// Rows other than the dragged one slide out of the way; onMove(from, to) fires on release.
export function SortableList<T>({ items, keyOf, render, onMove, className = '' }: { items: T[]; keyOf: (item: T) => string; render: (item: T, grip: ReactNode) => ReactNode; onMove: (from: number, to: number) => void; className?: string }) {
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const start = useRef<{ y: number; rects: DOMRect[] } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const set = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  const down = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    start.current = { y: e.clientY, rects: rows.current.slice(0, items.length).map((r) => r?.getBoundingClientRect() ?? new DOMRect()) };
    set({ from: i, to: i, dy: 0 });
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    const s = start.current;
    if (!d || !s) return;
    const dy = e.clientY - s.y;
    const r = s.rects[d.from];
    const center = r.top + r.height / 2 + dy;
    // New index = how many other rows have their middle above the dragged row's middle.
    const to = s.rects.filter((x, j) => j !== d.from && x.top + x.height / 2 < center).length;
    set({ ...d, dy, to });
  };
  const up = () => {
    const d = dragRef.current;
    start.current = null;
    set(null);
    if (d && d.to !== d.from) onMove(d.from, d.to);
  };

  const shift = (j: number): number => {
    if (!drag || j === drag.from || !start.current) return 0;
    const h = start.current.rects[drag.from].height;
    if (drag.from < drag.to && j > drag.from && j <= drag.to) return -h;
    if (drag.to < drag.from && j >= drag.to && j < drag.from) return h;
    return 0;
  };

  return (
    <div className={className}>
      {items.map((item, i) => {
        const dragging = drag?.from === i;
        const grip = (
          <button
            aria-label="Drag to reorder"
            onPointerDown={down(i)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onClick={(e) => e.preventDefault()}
            style={{ touchAction: 'none' }}
            className={`-ml-1.5 shrink-0 cursor-grab rounded-lg py-2 pl-1 pr-0.5 ${dragging ? 'text-teal-700' : 'text-stone-300'}`}
          >
            <GripVertical size={18} />
          </button>
        );
        return (
          <div
            key={keyOf(item)}
            ref={(el) => {
              rows.current[i] = el;
            }}
            style={{
              transform: `translateY(${dragging ? drag!.dy : shift(i)}px)`,
              transition: dragging || !drag ? 'none' : 'transform 150ms ease',
              position: 'relative',
              zIndex: dragging ? 10 : undefined,
            }}
            className={dragging ? 'rounded-xl bg-white shadow-lg ring-1 ring-teal-200' : 'bg-white first:rounded-t-2xl last:rounded-b-2xl'}
          >
            {render(item, grip)}
          </div>
        );
      })}
    </div>
  );
}
