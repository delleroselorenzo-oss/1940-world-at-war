import type { MapData, Province, ProvinceId } from "../map/types.js";

// Indici della mappa calcolati una volta sola e riusati (la mappa non cambia durante la partita).

interface MapIndex {
  provinces: Map<ProvinceId, Province>;
  /** provincia -> confinante -> distanza in km */
  distances: Map<ProvinceId, Map<ProvinceId, number>>;
}

const cache = new WeakMap<MapData, MapIndex>();

export function mapIndex(map: MapData): MapIndex {
  let index = cache.get(map);
  if (!index) {
    index = {
      provinces: new Map(map.provinces.map((p) => [p.id, p])),
      distances: new Map(map.provinces.map((p) => [p.id, new Map(p.neighbors.map((n) => [n.id, n.distanceKm]))])),
    };
    cache.set(map, index);
  }
  return index;
}
