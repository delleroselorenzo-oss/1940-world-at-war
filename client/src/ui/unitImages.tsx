import type { DoctrineId } from "@waw/shared";

// Foto delle unità per dottrina (ritagliate 16:9, 640×360, da icone/icone <dottrina>/; fonti nei loro fonti.md).
// Il nome del file è l'id dell'unità, dell'aereo o della nave.

const files = import.meta.glob<string>("../assets/units/*/*.jpg", { eager: true, import: "default" });

const IMAGES: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.slice("../assets/units/".length, -".jpg".length), url]),
);

export function unitImageUrl(doctrine: DoctrineId, unit: string): string | undefined {
  return IMAGES[`${doctrine}/${unit}`];
}

/** Miniatura quadrata della riga; vuota se manca la foto. */
export function UnitThumb({ src }: { src: string | undefined }) {
  return <span className="unit-thumb" aria-hidden>{src && <img src={src} alt="" />}</span>;
}
