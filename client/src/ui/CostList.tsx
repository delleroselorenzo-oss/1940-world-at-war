import { RESOURCE_IDS, RESOURCE_NAMES, type ResourceAmounts, type ResourceId } from "@waw/shared";
import { formatAmount, RESOURCE_COLORS } from "./format.js";

/** Costo come elenco di pallini colorati; in rosso le risorse che non bastano. */
export function CostList({ cost, stock }: { cost: Partial<Record<ResourceId, number>>; stock?: ResourceAmounts }) {
  return (
    <span className="cost">
      {RESOURCE_IDS.filter((r) => cost[r]).map((r) => (
        <span key={r} className={stock && stock[r] < cost[r]! ? "cost-item short" : "cost-item"} title={RESOURCE_NAMES[r]}>
          <span className="dot" style={{ background: RESOURCE_COLORS[r] }} />
          {formatAmount(cost[r]!)}
        </span>
      ))}
    </span>
  );
}
