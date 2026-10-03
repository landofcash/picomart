import {useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject, type PointerEvent} from 'react';
import {Grip, Minus, RotateCcw, Sparkles} from 'lucide-react';

import {panelPreferences, type PanelPosition as Position} from '@/lib/storefront/panelPreferences';
export default function DesignPanel({workspace, storageKey, active, children, collapsed, onCollapse}: {
  workspace: RefObject<HTMLDivElement | null>; storageKey: string; active: boolean; children: ReactNode; collapsed: boolean; onCollapse: (value: boolean) => void;
}) {
  const panel = useRef<HTMLDivElement>(null), drag = useRef<{id: number; x: number; y: number; start: Position} | null>(null);
  const [position, setPosition] = useState<Position | null>(() => panelPreferences(storageKey).position), [dragging, setDragging] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const clamp = useCallback((value: Position): Position => {
    const bounds = workspace.current?.getBoundingClientRect(), box = panel.current?.getBoundingClientRect();
    if (!bounds || !box) return value;
    return {x: Math.max(8, Math.min(value.x, bounds.width - box.width - 8)), y: Math.max(8, Math.min(value.y, bounds.height - box.height - 8))};
  }, [workspace]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)'), update = () => { setMobile(media.matches); drag.current = null; setDragging(false); };
    media.addEventListener('change', update); return () => media.removeEventListener('change', update);
  }, []);
  useLayoutEffect(() => {
    const update = () => {
      const height = workspace.current?.clientHeight ?? 800, panelHeight = panel.current?.offsetHeight ?? 500;
      setPosition(value => {
        const next = clamp(value ?? {x: 20, y: height - panelHeight - 20});
        return value?.x === next.x && value?.y === next.y ? value : next;
      });
    };
    update(); const observer = new ResizeObserver(update);
    if (workspace.current) observer.observe(workspace.current);
    if (panel.current) observer.observe(panel.current);
    return () => observer.disconnect();
  }, [workspace, collapsed, mobile, clamp]);
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify({position, collapsed})); } catch { /* UI preference storage is optional. */ } }, [storageKey, position, collapsed]);
  function start(event: PointerEvent<HTMLButtonElement>) {
    if (mobile || event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {id: event.pointerId, x: event.clientX, y: event.clientY, start: position ?? {x: 20, y: 20}}; setDragging(true);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current; if (!current || current.id !== event.pointerId) return;
    setPosition(clamp({x: current.start.x + event.clientX - current.x, y: current.start.y + event.clientY - current.y}));
  }
  function end(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null; setDragging(false);
  }
  return <>
    {dragging && <div className="storefront-drag-shield" data-testid="preview-drag-shield"/>}
    <div ref={panel} className={`storefront-design-panel ${collapsed ? 'is-collapsed' : ''}`} style={mobile ? undefined : {left: position?.x ?? 20, top: position?.y ?? 20}}>
      {collapsed ? <button className="storefront-design-pill" onClick={() => onCollapse(false)} aria-expanded={false} aria-label="Show Design panel"><Sparkles size={17}/><span>Design</span>{active && <span className="storefront-status-dot" aria-label="Generation in progress"/>}</button> : <>
        <div className="storefront-panel-title"><button className="storefront-drag-handle" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => { drag.current = null; setDragging(false); }}
          onKeyDown={event => { if (!mobile && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); setPosition(clamp({x: (position?.x ?? 20) + (event.key === 'ArrowRight' ? 20 : event.key === 'ArrowLeft' ? -20 : 0), y: (position?.y ?? 20) + (event.key === 'ArrowDown' ? 20 : event.key === 'ArrowUp' ? -20 : 0)})); } }}
          aria-label="Move Design panel" title="Drag to move. Use arrow keys when focused."><Grip size={15}/><Sparkles size={16}/><span>Design</span></button>
          <button className="storefront-icon-button" onClick={() => setPosition(clamp({x: 20, y: (workspace.current?.clientHeight ?? 800) - (panel.current?.offsetHeight ?? 500) - 20}))} aria-label="Reset panel position" title="Reset position"><RotateCcw size={14}/></button>
          <button className="storefront-icon-button" onClick={() => onCollapse(true)} aria-label="Collapse Design panel" aria-expanded={true}><Minus size={18}/></button>
        </div><div className="storefront-panel-body">{children}</div>
      </>}
    </div>
  </>;
}
