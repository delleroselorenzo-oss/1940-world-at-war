// Camera 2D della mappa: un punto del mondo (km) va sullo schermo (px) come
//   schermo = mondo × scale + (x, y)

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export function screenToWorld(cam: Camera, sx: number, sy: number): [number, number] {
  return [(sx - cam.x) / cam.scale, (sy - cam.y) / cam.scale];
}

export function worldToScreen(cam: Camera, wx: number, wy: number): [number, number] {
  return [wx * cam.scale + cam.x, wy * cam.scale + cam.y];
}

/** Camera che inquadra `bounds` per intero, centrata, con un margine in pixel. */
export function fitBounds(bounds: Bounds, view: Viewport, padding = 16): Camera {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const scale = Math.min((view.width - 2 * padding) / w, (view.height - 2 * padding) / h);
  return centerOn(scale, (bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, view);
}

/** Camera con la scala data e il punto del mondo (wx, wy) al centro dello schermo. */
export function centerOn(scale: number, wx: number, wy: number, view: Viewport): Camera {
  return { scale, x: view.width / 2 - wx * scale, y: view.height / 2 - wy * scale };
}

/** Zoom di un fattore mantenendo fermo sotto il cursore il punto (sx, sy). */
export function zoomAt(cam: Camera, sx: number, sy: number, factor: number, minScale: number, maxScale: number): Camera {
  const scale = Math.min(maxScale, Math.max(minScale, cam.scale * factor));
  const [wx, wy] = screenToWorld(cam, sx, sy);
  return { scale, x: sx - wx * scale, y: sy - wy * scale };
}

export function pan(cam: Camera, dx: number, dy: number): Camera {
  return { ...cam, x: cam.x + dx, y: cam.y + dy };
}

/**
 * Impedisce di perdere la mappa fuori dallo schermo: il centro dello schermo
 * deve restare dentro `bounds`.
 */
export function clampToBounds(cam: Camera, bounds: Bounds, view: Viewport): Camera {
  const [cx, cy] = screenToWorld(cam, view.width / 2, view.height / 2);
  const x = Math.min(bounds.maxX, Math.max(bounds.minX, cx));
  const y = Math.min(bounds.maxY, Math.max(bounds.minY, cy));
  if (x === cx && y === cy) return cam;
  return centerOn(cam.scale, x, y, view);
}
