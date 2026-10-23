import { RESOURCE_IDS, RESOURCE_NAMES, type ResourceAmounts } from "@waw/shared";
import { formatAmount, RESOURCE_COLORS } from "./format.js";

interface ResourceBarProps {
  stock: ResourceAmounts;
  /** Saldo giornaliero: produzione meno mantenimento delle unità. */
  perDay: ResourceAmounts;
}

const sign = (n: number) => (n >= 0 ? `+${formatAmount(n)}` : `−${formatAmount(-n)}`);

export function ResourceBar({ stock, perDay }: ResourceBarProps) {
  return (
    <ul className="resources" aria-label="Risorse">
      {RESOURCE_IDS.map((r) => {
        const title = `${RESOURCE_NAMES[r]}: ${formatAmount(stock[r])} · ${sign(perDay[r])} al giorno (produzione meno mantenimento)`;
        return (
          <li key={r} className="resource" title={title}>
            <span className="dot" style={{ background: RESOURCE_COLORS[r] }} />
            <span className="resource-name">{RESOURCE_NAMES[r]}</span>
            <strong>{formatAmount(stock[r])}</strong>
            <span className={perDay[r] < 0 ? "rate negative" : "rate"}>{sign(perDay[r])}</span>
          </li>
        );
      })}
    </ul>
  );
}
