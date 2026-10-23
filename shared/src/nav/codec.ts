import type { NavData, NavFile } from "./types.js";

// Conversione tra il formato su file (JSON con base64) e quello in memoria (array tipizzati).
// atob/btoa esistono sia nel browser sia in Node.

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const bytes = (a: ArrayBufferView) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
const copy = (b: Uint8Array) => b.slice().buffer;

export function encodeNav(nav: NavData): NavFile {
  return {
    mapId: nav.mapId,
    provinceIds: nav.provinceIds,
    grid: { ...nav.grid, province: toBase64(bytes(nav.grid.province)), blocked: toBase64(nav.grid.blocked) },
    roads: {
      nodes: Array.from(nav.roads.nodes, (v) => Math.round(v * 1e4) / 1e4),
      nodeCell: toBase64(bytes(nav.roads.nodeCell)),
      edgeA: toBase64(bytes(nav.roads.edgeA)),
      edgeB: toBase64(bytes(nav.roads.edgeB)),
      edgeKind: toBase64(nav.roads.edgeKind),
      edgeBridge: toBase64(bytes(nav.roads.edgeBridge)),
    },
    bridges: nav.bridges,
    rivers: nav.rivers,
  };
}

export function decodeNav(file: NavFile): NavData {
  return {
    mapId: file.mapId,
    provinceIds: file.provinceIds,
    grid: {
      ...file.grid,
      province: new Uint16Array(copy(fromBase64(file.grid.province))),
      blocked: fromBase64(file.grid.blocked),
    },
    roads: {
      nodes: Float64Array.from(file.roads.nodes),
      nodeCell: new Int32Array(copy(fromBase64(file.roads.nodeCell))),
      edgeA: new Int32Array(copy(fromBase64(file.roads.edgeA))),
      edgeB: new Int32Array(copy(fromBase64(file.roads.edgeB))),
      edgeKind: fromBase64(file.roads.edgeKind),
      edgeBridge: new Int32Array(copy(fromBase64(file.roads.edgeBridge))),
    },
    bridges: file.bridges,
    rivers: file.rivers,
  };
}
