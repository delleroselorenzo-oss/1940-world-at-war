// Scelta delle etichette da mostrare senza sovrapposizioni: si piazzano in ordine
// di priorità e si scarta ogni etichetta che tocca una già piazzata.

export interface LabelCandidate {
  /** Più basso = più importante (0 capitali, 1 città, 2 province rurali). */
  priority: number;
  /** Rettangolo sullo schermo in pixel. */
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Restituisce gli indici dei candidati da mostrare. */
export function placeLabels(candidates: LabelCandidate[], margin = 2): Set<number> {
  const order = candidates.map((_, i) => i).sort((a, b) => candidates[a]!.priority - candidates[b]!.priority);
  const placed: LabelCandidate[] = [];
  const visible = new Set<number>();
  for (const i of order) {
    const c = candidates[i]!;
    const overlaps = placed.some(
      (p) =>
        c.left < p.left + p.width + margin &&
        c.left + c.width + margin > p.left &&
        c.top < p.top + p.height + margin &&
        c.top + c.height + margin > p.top,
    );
    if (overlaps) continue;
    placed.push(c);
    visible.add(i);
  }
  return visible;
}
