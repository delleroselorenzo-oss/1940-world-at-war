declare module "polylabel" {
  /** Restituisce il "polo di inaccessibilità" del poligono: [x, y, distanza]. */
  export default function polylabel(polygon: number[][][], precision?: number, debug?: boolean): number[] & { distance: number };
}
