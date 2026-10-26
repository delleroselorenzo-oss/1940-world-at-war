import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { decodeNav, type MapData, type Nation, type NavData, type NavFile, type Province } from "@waw/shared";
import mapUrl from "../../../data/maps/europe-1933/map.json?url";
import navUrl from "../../../data/maps/europe-1933/nav.json?url";
import shapesUrl from "../../../data/maps/europe-1933/provinces.geojson?url";
import reliefPlacement from "../../../data/maps/europe-1933/relief.json";
import reliefUrl from "../../../data/maps/europe-1933/relief.jpg?url";
import type { Bounds } from "./camera.js";
import { projectShape, unionBounds, type ProjectedShape } from "./geometry.js";
import { project } from "./projection.js";

export interface LoadedMap {
  data: MapData;
  /** Rete di movimento: griglia, strade, fiumi e ponti. */
  nav: NavData;
  provinces: Map<string, Province>;
  nations: Map<string, Nation>;
  shapes: ProjectedShape[];
  shapeById: Map<string, ProjectedShape>;
  bounds: Bounds;
  /** Mappa base del rilievo (immagine di `npm run map:build`) e dove va, in km proiettati. */
  relief: { url: string; x: number; y: number; width: number; height: number };
}

/** Scarica la mappa generata da `npm run map:build` e proietta le forme in km. */
export async function loadMap(): Promise<LoadedMap> {
  const [data, geo, navFile] = await Promise.all([
    fetchJson<MapData>(mapUrl),
    fetchJson<FeatureCollection<Polygon | MultiPolygon, { id: string }>>(shapesUrl),
    fetchJson<NavFile>(navUrl),
  ]);
  const shapes = geo.features.map((f) => projectShape(f.properties.id, f.geometry, project));
  return {
    data,
    nav: decodeNav(navFile),
    provinces: new Map(data.provinces.map((p) => [p.id, p])),
    nations: new Map(data.nations.map((n) => [n.id, n])),
    shapes,
    shapeById: new Map(shapes.map((s) => [s.id, s])),
    bounds: unionBounds(shapes.map((s) => s.bounds)),
    relief: { url: reliefUrl, ...reliefPlacement },
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Impossibile caricare ${url} (${res.status})`);
  return (await res.json()) as T;
}
