import { RESOURCE_NAMES, type ResourceId } from "@waw/shared";
import food from "../assets/resources/food.svg";
import goods from "../assets/resources/goods.svg";
import manpower from "../assets/resources/manpower.svg";
import metal from "../assets/resources/metal.svg";
import money from "../assets/resources/money.svg";
import oil from "../assets/resources/oil.svg";

// Icone delle risorse (disegni originali in SVG, a pieno quadrato): tonde come icona, intere nel riepilogo.

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
