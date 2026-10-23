// Genera la bozza della mappa "Europa 1933".
//
// Passi:
//  1. confini degli stati al 1933 da CShapes 2.0;
//  2. suddivisioni amministrative moderne da Natural Earth (pubblico dominio),
//     ritagliate dentro i confini del 1933 → "pezzi";
//  3. pezzi e confini disegnati su una griglia per trovare chi confina con chi;
//  4. i pezzi troppo piccoli vengono accorpati ai vicini della stessa nazione → province;
//  5. capitali e città principali diventano province urbane;
//  6. output: map.json (dati di gioco), provinces.geojson (forme), preview.html (controllo a occhio).
//
// Uso: npm run map:build   (dalla radice del progetto)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as turf from "@turf/turf";
import polylabel from "polylabel";
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon, Position } from "geojson";
import { haversineKm, type LngLat, type MapData, type Nation, type Province } from "@waw/shared";
import { EMPTY, FOREIGN_LAND, Raster, SEA } from "./lib/raster.js";
import { renderPreview } from "./lib/preview.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(ROOT, "raw");
const OUT = join(ROOT, "maps", "europe-1933");

const SOURCES = {
  cshapes: { file: "cshapes-2.0.geojson", url: "https://icr.ethz.ch/data/cshapes/CShapes-2.0.geojson" },
  admin1: {
    file: "ne_10m_admin_1_states_provinces.geojson",
    url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson",
  },
  cities: {
    file: "ne_10m_populated_places.geojson",
    url: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson",
  },
};

/** Semplificazione delle forme in ingresso (gradi, ~1 km). */
const INPUT_SIMPLIFY = 0.01;
/** Semplificazione delle forme in uscita per il client (gradi, ~2 km). */
const OUTPUT_SIMPLIFY = 0.02;
/** Un pezzo di suddivisione è considerato "tutto dentro" una nazione oltre questa quota. */
const DOMINANT_SHARE = 0.95;
/** Pezzi di bordo più piccoli di così (e sotto il 5% della suddivisione) sono scarti di ritaglio. */
const SLIVER_KM2 = 500;
/** Contatti minimi sulla griglia per considerare due province confinanti. */
const MIN_BORDER_CONTACTS = 2;
/** Contatti minimi con celle di mare per considerare una provincia costiera. */
const MIN_COAST_CONTACTS = 4;
/** Un'area d'acqua è "mare" (e non lago o fessura) sopra questa superficie, in celle della griglia. */
const MIN_SEA_CELLS = 20000;
/** Estensione massima di una provincia accorpata: questo fattore × √(area massima), in km. */
const MAX_SPAN_FACTOR = 1.6;

interface NationConfig {
  gwcode: number;
  id: string;
  name: string;
  color: string;
  minProvinceAreaKm2?: number;
  maxProvinceAreaKm2?: number;
  /** Suddivisioni di questi stati moderni (codici ISO a3) non entrano in questa nazione, es. l'Asia centrale per l'URSS. */
  excludeModernCountries?: string[];
}

interface MapConfig {
  id: string;
  name: string;
  date: string;
  bbox: [number, number, number, number];
  rasterStepDeg: number;
  minProvinceAreaKm2: number;
  maxProvinceAreaKm2: number;
  /** Le nazioni abbastanza grandi hanno almeno questo numero di province. */
  minProvincesPerNation: number;
  urban: { maxPerNation: number; areaPerCityKm2: number };
  nations: NationConfig[];
  renames: Record<string, string>;
}

type Shape = Polygon | MultiPolygon;

interface Piece {
  index: number;
  nation: string;
  geometry: Shape;
  areaKm2: number;
  name: string;
  region: string;
  /** Codice della suddivisione Natural Earth da cui viene il pezzo. */
  source: string;
}

// ---------------------------------------------------------------------------

async function main() {
  const config = JSON.parse(readFileSync(join(OUT, "config.json"), "utf8")) as MapConfig;
  // Nomi storici al posto di quelli moderni; il confronto ignora maiuscole e spazi doppi.
  const renames = new Map(Object.entries(config.renames).map(([k, v]) => [k.toLowerCase(), v]));
  const rename = (s: string) => {
    const clean = s.replace(/\s+/g, " ").trim();
    const out = renames.get(clean.toLowerCase()) ?? clean;
    return out.charAt(0).toUpperCase() + out.slice(1);
  };
  const nationConfig = (id: string) => config.nations.find((n) => n.id === id)!;
  await ensureSources();

  // 1. Confini degli stati alla data scelta.
  console.log("· Confini degli stati al", config.date);
  const cshapes = readJson<FeatureCollection<Shape, Record<string, any>>>(SOURCES.cshapes.file);
  const date = config.date.split("-").map(Number) as [number, number, number];
  const alive = cshapes.features.filter((f) => {
    const p = f.properties;
    return compareDate([p.gwsyear, p.gwsmonth, p.gwsday], date) <= 0 && compareDate(date, [p.gweyear, p.gwemonth, p.gweday]) <= 0;
  });
  const bboxPoly = turf.bboxPolygon(config.bbox);

  const nationShapes = new Map<string, Feature<Shape>>();
  const nationByGw = new Map(config.nations.map((n) => [n.gwcode, n]));
  const capitals = new Map<string, { name: string; at: LngLat }>();
  const foreignLand: Shape[] = [];
  for (const f of alive) {
    const clipped = clipToBbox(f, config.bbox);
    if (!clipped) continue;
    const n = nationByGw.get(f.properties.gwcode);
    if (!n) {
      foreignLand.push(clipped.geometry);
      continue;
    }
    nationShapes.set(n.id, simplify(clipped));
    capitals.set(n.id, { name: rename(f.properties.capname), at: [f.properties.caplong, f.properties.caplat] });
  }
  const missing = config.nations.filter((n) => !nationShapes.has(n.id));
  if (missing.length) throw new Error(`Nazioni non trovate in CShapes alla data: ${missing.map((n) => n.id).join(", ")}`);

  // 2. Suddivisioni amministrative ritagliate dentro i confini del 1933.
  console.log("· Ritaglio delle suddivisioni amministrative");
  const admin1 = readJson<FeatureCollection<Shape, Record<string, any>>>(SOURCES.admin1.file);
  const nationBboxes = [...nationShapes].map(([id, f]) => ({ id, f, bbox: turf.bbox(f) }));
  const pieces: Piece[] = [];
  const excludedLand: Shape[] = [];
  let failures = 0;
  for (const raw of admin1.features) {
    if (!raw.geometry || !bboxOverlap(turf.bbox(raw), config.bbox)) continue;
    const a = simplify(raw);
    const aBbox = turf.bbox(a);
    const aArea = turf.area(a) / 1e6;
    const name = rename(raw.properties.name_it || raw.properties.name || raw.properties.adm1_code);
    const region = String(raw.properties.region ?? "");
    const source = String(raw.properties.adm1_code);

    const parts: { nation: string; geometry: Shape; areaKm2: number }[] = [];
    for (const n of nationBboxes) {
      if (!bboxOverlap(aBbox, n.bbox)) continue;
      if (nationConfig(n.id).excludeModernCountries?.includes(raw.properties.adm0_a3)) {
        excludedLand.push(a.geometry);
        continue;
      }
      let inter: Feature<Shape> | null = null;
      try {
        inter = turf.intersect(turf.featureCollection([a, n.f]));
      } catch {
        failures++;
      }
      if (inter) parts.push({ nation: n.id, geometry: inter.geometry, areaKm2: turf.area(inter) / 1e6 });
    }
    if (!parts.length) continue;
    parts.sort((x, y) => y.areaKm2 - x.areaKm2);
    const top = parts[0]!;
    if (top.areaKm2 / aArea >= DOMINANT_SHARE) {
      // Quasi tutta dentro una nazione: teniamo la forma intera, con la costa di Natural Earth.
      const inBbox = clipToBbox(a, config.bbox);
      if (inBbox) pieces.push({ index: pieces.length, nation: top.nation, geometry: inBbox.geometry, areaKm2: turf.area(inBbox) / 1e6, name, region, source });
      continue;
    }
    // Una suddivisione tagliata da un confine può restare in più parti separate
    // (es. la Carelia moderna dentro la Finlandia del 1933): ogni parte diventa un pezzo a sé.
    for (const part of parts) {
      const polys = part.geometry.type === "Polygon" ? [part.geometry.coordinates] : part.geometry.coordinates;
      for (const coordinates of polys) {
        const geometry: Polygon = { type: "Polygon", coordinates };
        const areaKm2 = turf.area(geometry) / 1e6;
        if (areaKm2 < SLIVER_KM2 && areaKm2 / aArea < 0.05) continue;
        pieces.push({ index: pieces.length, nation: part.nation, geometry, areaKm2, name, region, source });
      }
    }
  }
  console.log(`  ${pieces.length} pezzi${failures ? ` (${failures} ritagli falliti, ignorati)` : ""}`);

  // Le suddivisioni troppo grandi (es. Russia settentrionale) vengono tagliate a metà finché serve.
  const maxArea = (nation: string) => nationConfig(nation).maxProvinceAreaKm2 ?? config.maxProvinceAreaKm2;
  const splitPieces: Piece[] = [];
  for (const p of pieces) {
    for (const part of splitOversized(p, maxArea(p.nation))) splitPieces.push({ ...part, index: splitPieces.length });
  }
  console.log(`  ${splitPieces.length - pieces.length} pezzi in più dopo il taglio di quelli troppo grandi`);
  pieces.length = 0;
  pieces.push(...splitPieces);

  // 3. Griglia: terra straniera, poi i pezzi (valore = indice + 1).
  console.log("· Calcolo dei confini sulla griglia");
  const raster = new Raster(config.bbox, config.rasterStepDeg);
  for (const g of [...foreignLand, ...excludedLand]) raster.fill(g, FOREIGN_LAND);
  for (const p of pieces) raster.fill(p.geometry, p.index + 1);
  raster.markSea(MIN_SEA_CELLS);
  const pieceContacts = new Map<number, Map<number, number>>(); // pezzo -> vicino -> contatti
  const seaContacts = new Map<number, number>();
  for (const [key, count] of raster.contacts()) {
    const [a, b] = key.split("|").map(Number) as [number, number];
    if (a <= 0 && b <= 0) continue;
    if (a === FOREIGN_LAND || b === FOREIGN_LAND || a === EMPTY || b === EMPTY) continue;
    if (a === SEA || b === SEA) {
      const other = a === SEA ? b : a;
      if (other > 0) seaContacts.set(other - 1, (seaContacts.get(other - 1) ?? 0) + count);
      continue;
    }
    link(pieceContacts, a - 1, b - 1, count);
    link(pieceContacts, b - 1, a - 1, count);
  }

  // 4. Accorpamento dei pezzi piccoli con i vicini della stessa nazione.
  console.log("· Accorpamento in province");
  // Le nazioni piccole ma non minuscole (es. Paesi Bassi) abbassano la soglia per avere
  // almeno `minProvincesPerNation` province; quelle minuscole (es. Lussemburgo) restano una provincia.
  const nationArea = new Map<string, number>();
  for (const p of pieces) nationArea.set(p.nation, (nationArea.get(p.nation) ?? 0) + p.areaKm2);
  const minArea = (nation: string) => {
    const base = nationConfig(nation).minProvinceAreaKm2 ?? config.minProvinceAreaKm2;
    const area = nationArea.get(nation) ?? 0;
    // Le province reali escono tra 1 e 2 volte la soglia: dividiamo con margine.
    return area >= 20000 ? Math.min(base, area / (config.minProvincesPerNation * 1.5)) : base;
  };
  const groups = mergePieces(pieces, pieceContacts, minArea, maxArea);
  // Le isole minuscole senza vicini non diventano province.
  const kept = groups.filter((g) => g.areaKm2 >= SLIVER_KM2 || g.neighbors.size > 0);
  console.log(`  ${kept.length} province (${groups.length - kept.length} isolotti scartati)`);

  // 5. Province, centri e città.
  const regionArea = new Map<string, number>();
  for (const p of pieces) if (p.region) regionArea.set(`${p.nation}|${p.region}`, (regionArea.get(`${p.nation}|${p.region}`) ?? 0) + p.areaKm2);
  const provinceOfPiece = new Map<number, Province>();
  const provinces: Province[] = [];
  const outlines = new Map<Province, Shape>();
  for (const g of kept) {
    const members = g.members.map((i) => pieces[i]!);
    const largest = members.reduce((a, b) => (b.areaKm2 > a.areaKm2 ? b : a));
    // Il nome della regione si usa solo se la provincia la copre quasi tutta (altrimenti nomi come "Central" si ripeterebbero).
    const sameRegion =
      members.length > 1 &&
      largest.region &&
      members.every((m) => m.region === largest.region) &&
      g.areaKm2 >= 0.8 * (regionArea.get(`${g.nation}|${largest.region}`) ?? Infinity);
    const name = rename(sameRegion ? largest.region : largest.name);
    const geometry = unionShapes(members.map((m) => m.geometry));
    const province: Province = {
      id: "", // assegnato alla fine, quando i nomi sono definitivi
      name,
      nation: g.nation,
      type: "rural",
      isCapital: false,
      terrain: null,
      resource: null,
      center: visualCenter(geometry),
      areaKm2: Math.round(g.areaKm2),
      coastal: members.reduce((s, m) => s + (seaContacts.get(m.index) ?? 0), 0) >= MIN_COAST_CONTACTS,
      neighbors: [],
    };
    provinces.push(province);
    for (const m of members) provinceOfPiece.set(m.index, province);
    const simplified = turf.simplify(turf.feature(geometry), { tolerance: OUTPUT_SIMPLIFY, highQuality: false });
    outlines.set(province, roundCoords(simplified.geometry));
  }

  // Molte città stanno sulla costa: se il punto cade in mare cerchiamo la cella di terra più vicina.
  const provinceAt = (at: LngLat) => {
    const step = config.rasterStepDeg;
    for (let r = 0; r <= 4; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const v = raster.valueAt(at[0] + dx * step, at[1] + dy * step);
          const p = v > 0 ? provinceOfPiece.get(v - 1) : undefined;
          if (p) return p;
        }
    return undefined;
  };

  // Città, ordinate per popolazione del 1950 (la più vicina all'epoca), altrimenti attuale.
  // POP1950 è espressa in migliaia.
  const population = (c: Feature<Point, Record<string, any>>) => (c.properties.POP1950 ? c.properties.POP1950 * 1000 : c.properties.POP_MAX || 0);
  const cities = readJson<FeatureCollection<Point, Record<string, any>>>(SOURCES.cities.file)
    .features.filter((c) => {
      const [lng, lat] = c.geometry.coordinates as LngLat;
      return bboxOverlap([lng, lat, lng, lat], config.bbox);
    })
    .sort((a, b) => population(b) - population(a));
  const cityName = (c: Feature<Point, Record<string, any>>) => rename(c.properties.NAME_IT || c.properties.NAME);

  // Capitali: posizione da CShapes, nome italiano dalla città di Natural Earth più vicina.
  const nations: (Omit<Nation, "capitalProvince"> & { capital?: Province })[] = config.nations.map((n) => {
    const cap = capitals.get(n.id)!;
    const near = cities
      .map((c) => ({ c, km: haversineKm(c.geometry.coordinates as LngLat, cap.at) }))
      .filter((x) => x.km < 30 && population(x.c) > 50000)
      .sort((a, b) => a.km - b.km)[0]?.c;
    const p = provinceAt(cap.at);
    if (p && p.nation === n.id) makeUrban(p, near ? cityName(near) : cap.name, cap.at, true);
    else console.warn(`  ! capitale di ${n.id} (${cap.name}) non trovata in una provincia della nazione`);
    return { id: n.id, name: n.name, color: n.color, capital: p && p.nation === n.id ? p : undefined };
  });

  // Città principali.
  for (const n of config.nations) {
    const area = provinces.filter((p) => p.nation === n.id).reduce((s, p) => s + p.areaKm2, 0);
    const target = Math.min(config.urban.maxPerNation, Math.max(1, Math.ceil(area / config.urban.areaPerCityKm2)));
    let count = provinces.filter((p) => p.nation === n.id && p.type === "urban").length;
    for (const c of cities) {
      if (count >= target) break;
      const at = c.geometry.coordinates as LngLat;
      const p = provinceAt(at);
      if (!p || p.nation !== n.id || p.type === "urban") continue;
      makeUrban(p, cityName(c), at, false);
      count++;
    }
  }

  // ID leggibili e stabili, ricavati dai nomi definitivi.
  dedupeNames(provinces);
  const ids = new Set<string>();
  for (const p of provinces) p.id = uniqueId(`${p.nation}_${slug(p.name)}`, ids);

  // Confini tra province, con le distanze tra i centri.
  const provinceLinks = new Map<Province, Map<Province, number>>();
  for (const [a, neighbors] of pieceContacts) {
    const pa = provinceOfPiece.get(a);
    if (!pa) continue;
    for (const [b, count] of neighbors) {
      const pb = provinceOfPiece.get(b);
      if (!pb || pb === pa) continue;
      const m = provinceLinks.get(pa) ?? new Map<Province, number>();
      m.set(pb, (m.get(pb) ?? 0) + count);
      provinceLinks.set(pa, m);
    }
  }
  for (const [p, neighbors] of provinceLinks)
    for (const [q, count] of neighbors)
      if (count >= MIN_BORDER_CONTACTS) p.neighbors.push({ id: q.id, distanceKm: Math.round(haversineKm(p.center, q.center)) });
  for (const p of provinces) p.neighbors.sort((a, b) => a.id.localeCompare(b.id));
  provinces.sort((a, b) => a.id.localeCompare(b.id));

  // 6. Output.
  const shapes = provinces.map((p) => turf.feature(outlines.get(p)!, { id: p.id }));
  const map: MapData = {
    id: config.id,
    name: config.name,
    date: config.date,
    nations: nations.map(({ capital, ...n }) => ({ ...n, capitalProvince: capital?.id ?? null })),
    provinces,
  };
  writeFileSync(join(OUT, "map.json"), JSON.stringify(map, null, 2) + "\n");
  writeFileSync(join(OUT, "provinces.geojson"), JSON.stringify(turf.featureCollection(shapes)) + "\n");
  writeFileSync(join(OUT, "preview.html"), renderPreview(map, shapes, config.bbox));
  report(map);
}

// ---------------------------------------------------------------------------

interface Group {
  nation: string;
  members: number[];
  areaKm2: number;
  /** gruppo vicino -> contatti sulla griglia */
  neighbors: Map<Group, number>;
  region: string;
  bbox: number[];
}

/**
 * Accorpa ripetutamente il gruppo più piccolo sotto soglia con il vicino della stessa
 * nazione che condivide più confine, preferendo la stessa regione, i vicini anch'essi
 * sotto soglia e unioni che non superano l'area massima.
 */
function mergePieces(
  pieces: Piece[],
  contacts: Map<number, Map<number, number>>,
  minArea: (nation: string) => number,
  maxArea: (nation: string) => number,
): Group[] {
  const groupOf = new Map<number, Group>();
  const groups = new Set<Group>();
  for (const p of pieces) {
    const g: Group = { nation: p.nation, members: [p.index], areaKm2: p.areaKm2, neighbors: new Map(), region: p.region, bbox: turf.bbox(p.geometry) };
    groupOf.set(p.index, g);
    groups.add(g);
  }
  for (const [a, m] of contacts)
    for (const [b, count] of m) {
      const ga = groupOf.get(a)!;
      const gb = groupOf.get(b)!;
      ga.neighbors.set(gb, (ga.neighbors.get(gb) ?? 0) + count);
    }

  for (;;) {
    let smallest: Group | null = null;
    let partner: Group | null = null;
    for (const g of groups) {
      if (g.areaKm2 >= minArea(g.nation)) continue;
      if (smallest && g.areaKm2 >= smallest.areaKm2) continue;
      let best: Group | null = null;
      let bestScore = 0;
      for (const [n, count] of g.neighbors) {
        if (n.nation !== g.nation) continue;
        let score = count / Math.sqrt(n.areaKm2);
        if (n.region && n.region === g.region) score *= 2;
        if (n.areaKm2 < minArea(n.nation)) score *= 3;
        if (n.areaKm2 + g.areaKm2 > maxArea(g.nation)) score *= 0.05;
        // Evita province lunghe e strette (es. strisce lungo un confine cambiato).
        if (spanKm(mergeBbox(g.bbox, n.bbox)) > MAX_SPAN_FACTOR * Math.sqrt(maxArea(g.nation))) score *= 0.01;
        if (score > bestScore) [best, bestScore] = [n, score];
      }
      if (best) [smallest, partner] = [g, best];
    }
    if (!smallest || !partner) break;

    // Unisce `smallest` dentro `partner`.
    partner.members.push(...smallest.members);
    partner.areaKm2 += smallest.areaKm2;
    partner.bbox = mergeBbox(partner.bbox, smallest.bbox);
    if (partner.region !== smallest.region) partner.region = smallest.areaKm2 > partner.areaKm2 / 2 ? "" : partner.region;
    for (const [n, count] of smallest.neighbors) {
      n.neighbors.delete(smallest);
      if (n === partner) continue;
      partner.neighbors.set(n, (partner.neighbors.get(n) ?? 0) + count);
      n.neighbors.set(partner, (n.neighbors.get(partner) ?? 0) + count);
    }
    partner.neighbors.delete(smallest);
    groups.delete(smallest);
  }

  // Le isole senza vicini tornano con la provincia della loro suddivisione d'origine
  // (es. le Baleari restano una sola provincia).
  const sourceOf = (g: Group) => new Set(g.members.map((i) => pieces[i]!.source));
  for (const g of [...groups]) {
    if (g.neighbors.size > 0) continue;
    const sources = sourceOf(g);
    const home = [...groups]
      .filter((h) => h !== g && h.nation === g.nation && [...sourceOf(h)].some((s) => sources.has(s)))
      .sort((a, b) => b.areaKm2 - a.areaKm2)[0];
    if (!home) continue;
    home.members.push(...g.members);
    home.areaKm2 += g.areaKm2;
    groups.delete(g);
  }
  return [...groups];
}

/**
 * Taglia a metà (lungo il lato più lungo) i pezzi più grandi di `maxArea`, ricorsivamente.
 * Ai nomi si aggiunge la posizione, es. "Komi (nord-est)".
 */
function splitOversized(piece: Piece, maxArea: number): Omit<Piece, "index">[] {
  const parts: { geometry: Shape; areaKm2: number; dirs: string[] }[] = [{ geometry: piece.geometry, areaKm2: piece.areaKm2, dirs: [] }];
  const done: typeof parts = [];
  while (parts.length) {
    const part = parts.pop()!;
    if (part.areaKm2 <= maxArea || part.dirs.length >= 4) {
      done.push(part);
      continue;
    }
    const [minX, minY, maxX, maxY] = turf.bbox(part.geometry);
    const midLat = (minY + maxY) / 2;
    const wideKm = (maxX - minX) * Math.cos((midLat * Math.PI) / 180);
    const tallKm = maxY - minY;
    const halves: [[number, number, number, number], string][] =
      wideKm > tallKm
        ? [
            [[minX, minY, (minX + maxX) / 2, maxY], "ovest"],
            [[(minX + maxX) / 2, minY, maxX, maxY], "est"],
          ]
        : [
            [[minX, midLat, maxX, maxY], "nord"],
            [[minX, minY, maxX, midLat], "sud"],
          ];
    for (const [bbox, dir] of halves) {
      const half = clipToBbox(turf.feature(part.geometry), bbox);
      if (!half) continue;
      const areaKm2 = turf.area(half) / 1e6;
      if (areaKm2 > 0) parts.push({ geometry: half.geometry, areaKm2, dirs: [...part.dirs, dir] });
    }
  }
  if (done.length === 1) return [{ ...piece }];
  return done.map((d) => ({ ...piece, geometry: d.geometry, areaKm2: d.areaKm2, name: `${piece.name} (${directionLabel(d.dirs)})`, region: "" }));
}

/** Riduce una sequenza di tagli a un'etichetta leggibile: ["nord","est","nord"] → "nord-est". */
function directionLabel(dirs: string[]): string {
  const ns = dirs.find((d) => d === "nord" || d === "sud");
  const ew = dirs.find((d) => d === "est" || d === "ovest");
  return [ns, ew].filter(Boolean).join("-");
}

/** Nomi ripetuti nella stessa nazione diventano "Nome I", "Nome II", … */
function dedupeNames(provinces: Province[]) {
  const byKey = new Map<string, Province[]>();
  for (const p of provinces) byKey.set(`${p.nation}|${p.name}`, [...(byKey.get(`${p.nation}|${p.name}`) ?? []), p]);
  const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => b.center[1] - a.center[1] || a.center[0] - b.center[0]); // da nord a sud
    list.forEach((p, i) => (p.name = `${p.name} ${roman[i] ?? i + 1}`));
  }
}

function mergeBbox(a: number[], b: number[]): number[] {
  return [Math.min(a[0]!, b[0]!), Math.min(a[1]!, b[1]!), Math.max(a[2]!, b[2]!), Math.max(a[3]!, b[3]!)];
}

/** Lato più lungo del rettangolo, in km. */
function spanKm(b: number[]): number {
  const midLat = ((b[1]! + b[3]!) / 2) * (Math.PI / 180);
  return Math.max((b[2]! - b[0]!) * 111 * Math.cos(midLat), (b[3]! - b[1]!) * 111);
}

function makeUrban(p: Province, city: string, at: LngLat, isCapital: boolean) {
  p.type = "urban";
  p.city = city;
  p.name = city;
  p.center = at;
  p.isCapital = isCapital;
}

function unionShapes(shapes: Shape[]): Shape {
  if (shapes.length === 1) return shapes[0]!;
  try {
    const u = turf.union(turf.featureCollection(shapes.map((s) => turf.feature(s))));
    if (u) return u.geometry;
  } catch {
    // Geometria non valida: ripieghiamo su un MultiPolygon che accosta i pezzi.
  }
  return { type: "MultiPolygon", coordinates: shapes.flatMap((s) => (s.type === "Polygon" ? [s.coordinates] : s.coordinates)) };
}

/** Punto interno più lontano dai bordi del poligono più grande (meglio del baricentro per forme concave). */
function visualCenter(shape: Shape): LngLat {
  const polys = shape.type === "Polygon" ? [shape.coordinates] : shape.coordinates;
  const largest = polys.reduce((a, b) => (turf.area(turf.polygon(b)) > turf.area(turf.polygon(a)) ? b : a));
  const [lng, lat] = polylabel(largest as number[][][], 0.01);
  return [round(lng!), round(lat!)];
}

function clipToBbox(f: Feature<Shape>, bbox: [number, number, number, number]): Feature<Shape> | null {
  const b = turf.bbox(f);
  if (!bboxOverlap(b, bbox)) return null;
  if (b[0] >= bbox[0] && b[1] >= bbox[1] && b[2] <= bbox[2] && b[3] <= bbox[3]) return f;
  // bboxClip può lasciare anelli degeneri (meno di 4 punti) che fanno fallire i ritagli successivi.
  const clipped = turf.bboxClip(f, bbox) as Feature<Shape>;
  const polys = (clipped.geometry.type === "Polygon" ? [clipped.geometry.coordinates] : clipped.geometry.coordinates)
    .map((rings) => rings.filter((ring) => ring.length >= 4))
    .filter((rings) => rings.length > 0);
  if (!polys.length) return null;
  return turf.feature({ type: "MultiPolygon", coordinates: polys }, f.properties);
}

function simplify<T extends Feature<Shape>>(f: T): T {
  return turf.simplify(f, { tolerance: INPUT_SIMPLIFY, highQuality: false, mutate: false }) as T;
}

function roundCoords(shape: Shape): Shape {
  const r = (ring: Position[]) => ring.map(([lng, lat]) => [round(lng!), round(lat!)]);
  return shape.type === "Polygon"
    ? { type: "Polygon", coordinates: shape.coordinates.map(r) }
    : { type: "MultiPolygon", coordinates: shape.coordinates.map((rings) => rings.map(r)) };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function bboxOverlap(a: number[], b: number[]): boolean {
  return a[0]! <= b[2]! && a[2]! >= b[0]! && a[1]! <= b[3]! && a[3]! >= b[1]!;
}

function compareDate(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}

function link(m: Map<number, Map<number, number>>, a: number, b: number, count: number) {
  const inner = m.get(a) ?? new Map<number, number>();
  inner.set(b, (inner.get(b) ?? 0) + count);
  m.set(a, inner);
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  for (let i = 2; used.has(id); i++) id = `${base}_${i}`;
  used.add(id);
  return id;
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(RAW, file), "utf8")) as T;
}

async function ensureSources() {
  mkdirSync(RAW, { recursive: true });
  for (const { file, url } of Object.values(SOURCES)) {
    const path = join(RAW, file);
    if (existsSync(path)) continue;
    console.log(`· Scarico ${file}…`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download fallito (${res.status}): ${url}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
}

function report(map: MapData) {
  const byNation = new Map<string, Province[]>();
  for (const p of map.provinces) byNation.set(p.nation, [...(byNation.get(p.nation) ?? []), p]);
  console.log("\nProvince per nazione:");
  for (const n of map.nations) {
    const list = byNation.get(n.id) ?? [];
    const urban = list.filter((p) => p.type === "urban").map((p) => p.name);
    console.log(`  ${n.id.padEnd(4)} ${String(list.length).padStart(3)}  città: ${urban.join(", ")}`);
  }
  const sorted = [...map.provinces].sort((a, b) => a.areaKm2 - b.areaKm2);
  const fmt = (p: Province) => `${p.id} (${p.areaKm2.toLocaleString("it-IT")} km²)`;
  console.log("\nPiù piccole:", sorted.slice(0, 6).map(fmt).join(", "));
  console.log("Più grandi: ", sorted.slice(-6).reverse().map(fmt).join(", "));
  const isolated = map.provinces.filter((p) => p.neighbors.length === 0);
  console.log(`Isolate (servono collegamenti via mare): ${isolated.map((p) => p.id).join(", ") || "nessuna"}`);
  console.log(`\nTotale: ${map.provinces.length} province. Anteprima: data/maps/europe-1933/preview.html`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
