import type { LngLat } from "./types.js";

// Proiezione azimutale equivalente di Lambert centrata sull'Europa (la stessa idea
// della EPSG:3035 usata dalle mappe ufficiali europee): conserva le aree, quindi
// la Russia settentrionale non appare gonfiata come in Mercatore.
// Le coordinate "mondo" sono in km, con l'asse y verso il basso come sullo schermo.
// La usano il client (disegno della mappa) e gli script che generano le immagini della mappa (rilievo).

const EARTH_RADIUS_KM = 6371;
const DEG = Math.PI / 180;

export const MAP_PROJECTION_CENTER: LngLat = [10, 52];

const lng0 = MAP_PROJECTION_CENTER[0] * DEG;
const sinLat0 = Math.sin(MAP_PROJECTION_CENTER[1] * DEG);
const cosLat0 = Math.cos(MAP_PROJECTION_CENTER[1] * DEG);

/** Inverso di `mapProject`: da coordinate mondo (km) a [lng, lat]. */
export function mapUnproject([x, yDown]: [number, number]): LngLat {
  const y = -yDown;
  const rho = Math.hypot(x, y);
  if (rho < 1e-9) return [...MAP_PROJECTION_CENTER];
  const c = 2 * Math.asin(rho / (2 * EARTH_RADIUS_KM));
  const sinC = Math.sin(c);
  const cosC = Math.cos(c);
  const lat = Math.asin(cosC * sinLat0 + (y * sinC * cosLat0) / rho);
  const lng = lng0 + Math.atan2(x * sinC, rho * cosLat0 * cosC - y * sinLat0 * sinC);
  return [lng / DEG, lat / DEG];
}

export function mapProject([lng, lat]: LngLat): [number, number] {
  const lambda = lng * DEG - lng0;
  const phi = lat * DEG;
  const cosC = sinLat0 * Math.sin(phi) + cosLat0 * Math.cos(phi) * Math.cos(lambda);
  const k = Math.sqrt(2 / (1 + cosC));
  const x = EARTH_RADIUS_KM * k * Math.cos(phi) * Math.sin(lambda);
  const y = EARTH_RADIUS_KM * k * (cosLat0 * Math.sin(phi) - sinLat0 * Math.cos(phi) * Math.cos(lambda));
  return [x, -y];
}
