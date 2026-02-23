import { useMemo } from 'react';
import type { Coord } from '../../types';

export const DEFAULT_VIEWBOX_PADDING = 1;

export const DEFAULT_ZOOM_WRAPPER_PROPS = {
  initialScale: 1,
  minScale: 0.5,
  maxScale: 3,
  wheel: { step: 0.1 },
  doubleClick: { disabled: true },
} as const;

export function useGraphViewBox(coords: Record<string, Coord>, pad = DEFAULT_VIEWBOX_PADDING) {
  return useMemo(() => {
    const values = Object.values(coords);
    const xs = values.map(([x]) => x);
    const ys = values.map(([, y]) => y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      vbX: minX - pad,
      vbY: minY - pad,
      vbW: maxX - minX + pad * 2,
      vbH: maxY - minY + pad * 2,
    };
  }, [coords, pad]);
}

export function createZoomCallbacks(
  zoomIn: () => void,
  zoomOut: () => void,
  resetTransform: () => void
) {
  return {
    onZoomIn: () => zoomIn(),
    onZoomOut: () => zoomOut(),
    onResetTransform: () => resetTransform(),
  };
}

export function getRelativePointerPosition(
  container: HTMLElement | null,
  event: { clientX: number; clientY: number }
) {
  const rect = container?.getBoundingClientRect();
  if (!rect) {
    return { x: event.clientX, y: event.clientY };
  }

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}
