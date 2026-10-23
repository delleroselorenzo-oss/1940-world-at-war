import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { MapData } from "@waw/shared";

// Anteprima HTML statica della mappa generata: serve solo per controllare
// a occhio la bozza, non è il client del gioco.

const PROJ_LAT = 52; // latitudine di riferimento per la proiezione equirettangolare
const SCALE = 14; // pixel per grado di longitudine (prima della correzione)

export function renderPreview(
  map: MapData,
  shapes: Feature<Polygon | MultiPolygon, { id: string }>[],
  bbox: [number, number, number, number],
): string {
  const k = Math.cos((PROJ_LAT * Math.PI) / 180);
  const width = (bbox[2] - bbox[0]) * k * SCALE;
  const height = (bbox[3] - bbox[1]) * SCALE;
  const x = (lng: number) => ((lng - bbox[0]) * k * SCALE).toFixed(1);
  const y = (lat: number) => ((bbox[3] - lat) * SCALE).toFixed(1);

  const nations = new Map(map.nations.map((n) => [n.id, n]));
  const provinces = new Map(map.provinces.map((p) => [p.id, p]));

  const paths = shapes.map((f) => {
    const p = provinces.get(f.properties.id)!;
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const d = polys
      .flatMap((rings) => rings.map((ring) => "M" + ring.map(([lng, lat]) => `${x(lng!)},${y(lat!)}`).join("L") + "Z"))
      .join("");
    const color = nations.get(p.nation)?.color ?? "#ccc";
    const label = `${p.name} — ${nations.get(p.nation)?.name} · ${Math.round(p.areaKm2).toLocaleString("it-IT")} km² · ${p.neighbors.length} confinanti${p.coastal ? " · costiera" : ""}`;
    return `<path d="${d}" fill="${color}" fill-rule="evenodd"><title>${escape(label)}</title></path>`;
  });

  const links = new Set<string>();
  const lines: string[] = [];
  for (const p of map.provinces)
    for (const n of p.neighbors) {
      const key = [p.id, n.id].sort().join("|");
      if (links.has(key)) continue;
      links.add(key);
      const q = provinces.get(n.id)!;
      lines.push(`<line x1="${x(p.center[0])}" y1="${y(p.center[1])}" x2="${x(q.center[0])}" y2="${y(q.center[1])}"/>`);
    }

  const markers = map.provinces.map((p) => {
    const [cx, cy] = [x(p.center[0]), y(p.center[1])];
    if (p.isCapital) return `<circle class="cap" cx="${cx}" cy="${cy}" r="4.5"><title>${escape(p.name)} (capitale)</title></circle>`;
    if (p.type === "urban") return `<rect class="city" x="${Number(cx) - 3}" y="${Number(cy) - 3}" width="6" height="6"><title>${escape(p.name)}</title></rect>`;
    return `<circle class="center" cx="${cx}" cy="${cy}" r="1.6"/>`;
  });

  const isolated = map.provinces.filter((p) => p.neighbors.length === 0).length;
  const urban = map.provinces.filter((p) => p.type === "urban").length;

  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(map.name)} — anteprima</title>
<style>
  body{font-family:system-ui,sans-serif;margin:16px;background:#f4f1ea;color:#222}
  .bar{display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
  svg{width:100%;height:auto;background:#bcd4e3;border:1px solid #999}
  path{stroke:#333;stroke-width:.5}
  path:hover{fill-opacity:.6}
  #links line{stroke:#222;stroke-width:.6;stroke-opacity:.55;pointer-events:none}
  .center{fill:#222;pointer-events:none}
  .city{fill:#fff;stroke:#222;stroke-width:1}
  .cap{fill:#ffd400;stroke:#222;stroke-width:1.2}
  body.no-links #links{display:none}
</style></head>
<body class="no-links">
<h1>${escape(map.name)}</h1>
<div class="bar">
  <span>${map.provinces.length} province · ${map.nations.length} nazioni · ${urban} urbane · ${links.size} collegamenti · ${isolated} isolate</span>
  <label><input type="checkbox" onchange="document.body.classList.toggle('no-links',!this.checked)"> mostra collegamenti tra province</label>
  <span>⬛ città · 🟡 capitale · passa il mouse per i dettagli</span>
</div>
<svg viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}">
  <g>${paths.join("")}</g>
  <g id="links">${lines.join("")}</g>
  <g>${markers.join("")}</g>
</svg>
</body></html>
`;
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
