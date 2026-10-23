import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { MapData, Nation, Province } from "@waw/shared";
import mapUrl from "../../../data/maps/europe-1933/map.json?url";
import shapesUrl from "../../../data/maps/europe-1933/provinces.geojson?url";
import type { Bounds } from "./camera.js";
import { projectShape, unionBounds, type ProjectedShape } from "./geometry.js";
import { project } from "./projection.js";

export interface LoadedMap {
  data: MapData;
  provinces: Map<string, Province>;
  nations: Map<string, Nation>;
  shapes: ProjectedShape[];
  shapeById: Map<string, ProjectedShape>;
  bounds: Bounds;
}

/** Scarica la mappa generata da `npm run map:build` e proietta le forme in km. */
export async function loadMap(): Promise<LoadedMap> {
  const [data, geo] = await Promise.all([
    fetchJson<MapData>(mapUrl),
    fetchJson<FeatureCollection<Polygon | MultiPolygon, { id: string }>>(shapesUrl),
  ]);
  const shapes = geo.features.map((f) => projectShape(f.properties.id, f.geometry, project));
  return {
    data,
    provinces: new Map(data.provinces.map((p) => [p.id, p])),
    nations: new Map(data.nations.map((n) => [n.id, n])),
    shapes,
    shapeById: new Map(shapes.map((s) => [s.id, s])),
    bounds: unionBounds(shapes.map((s) => s.bounds)),
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Impossibile caricare ${url} (${res.status})`);
  return (await res.json()) as T;
}
