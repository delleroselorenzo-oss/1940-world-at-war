import { RESOURCE_NAMES, type ResourceId } from "@waw/shared";
import food from "../assets/resources/food.jpg";
import goods from "../assets/resources/goods.jpg";
import manpower from "../assets/resources/manpower.jpg";
import metal from "../assets/resources/metal.jpg";
import money from "../assets/resources/money.jpg";
import oil from "../assets/resources/oil.jpg";

// Immagini delle risorse (da icone/icone materie prime, ritagliate quadrate): tonde come icona, intere nel riepilogo.

export const RESOURCE_IMAGES: Record<ResourceId, string> = { food, goods, metal, oil, money, manpower };

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
