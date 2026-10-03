export type PanelPosition = {x: number; y: number};
export function panelPreferences(key: string): {position: PanelPosition | null; collapsed: boolean} {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    return {collapsed: value?.collapsed === true, position: Number.isFinite(value?.position?.x) && Number.isFinite(value?.position?.y) ? value.position : null};
  } catch { return {position: null, collapsed: false}; }
}
