import { useMemo } from "react";
import type { NationId } from "@waw/shared";
import type { LoadedMap } from "../map/loadMap.js";

interface NationPickerProps {
  map: LoadedMap;
  onPick(nation: NationId): void;
}

export function NationPicker({ map, onPick }: NationPickerProps) {
  // Le nazioni più grandi in alto.
  const nations = useMemo(() => {
    const provinces = map.data.provinces;
    return map.data.nations
      .map((n) => {
        const own = provinces.filter((p) => p.nation === n.id);
        return { ...n, provinces: own.length, cities: own.filter((p) => p.type === "urban").length };
      })
      .sort((a, b) => b.provinces - a.provinces || a.name.localeCompare(b.name));
  }, [map]);

  return (
    <div className="picker-backdrop">
      <section className="picker" aria-labelledby="picker-title">
        <h2 id="picker-title">Scegli la tua nazione</h2>
        <p className="muted">Europa, giugno 1933. Le altre nazioni restano ferme finché non arriveranno i bot.</p>
        <ul className="picker-list">
          {nations.map((n) => (
            <li key={n.id}>
              <button onClick={() => onPick(n.id)}>
                <span className="swatch swatch-lg" style={{ background: n.color }} />
                <span className="picker-name">{n.name}</span>
                <span className="muted">
                  {n.provinces} {n.provinces === 1 ? "provincia" : "province"} · {n.cities} città
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
