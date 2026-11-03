import { RESOURCE_NAMES, type ResourceId } from "@waw/shared";
import food from "../assets/resources/food.svg";
import goods from "../assets/resources/goods.svg";
import manpower from "../assets/resources/manpower.svg";
import metal from "../assets/resources/metal.svg";
import money from "../assets/resources/money.svg";
import oil from "../assets/resources/oil.svg";

// Icone delle risorse (disegni originali in SVG, a pieno quadrato): tonde come icona, intere nel riepilogo.
// Se in `assets/resources-local/` (fuori da git) c'è un'immagine con lo stesso nome, si usa quella: sono le foto scelte
// in locale, che non si possono pubblicare.

const local = import.meta.glob<string>("../assets/resources-local/*.{jpg,jpeg,png,webp}", { eager: true, import: "default" });
const localImage = (id: ResourceId): string | undefined =>
  Object.entries(local).find(([path]) => path.slice(path.lastIndexOf("/") + 1).replace(/\.[a-z]+$/, "") === id)?.[1];

const DRAWN: Record<ResourceId, string> = { food, goods, metal, oil, money, manpower };
export const RESOURCE_IMAGES = Object.fromEntries(
  Object.entries(DRAWN).map(([id, url]) => [id, localImage(id as ResourceId) ?? url]),
) as Record<ResourceId, string>;

interface ResourceIconProps {
  resource: ResourceId;
  /** Lato in pixel. */
  size?: number;
}

export function ResourceIcon({ resource, size = 16 }: ResourceIconProps) {
  return (
    <img
      className="resource-icon"
      src={RESOURCE_IMAGES[resource]}
      alt={RESOURCE_NAMES[resource]}
      title={RESOURCE_NAMES[resource]}
      width={size}
      height={size}
    />
  );
}
