import { useEffect, useRef, useState } from "react";
import { RESOURCE_IDS, RESOURCE_NAMES, type ResourceAmounts, type ResourceId } from "@waw/shared";
import { expenses, income, type ResourceBalance } from "./balance.js";
import { formatAmount } from "./format.js";
import { RESOURCE_IMAGES, ResourceIcon } from "./ResourceIcon.js";

interface ResourceBarProps {
  stock: ResourceAmounts;
  /** Entrate e uscite giornaliere, voce per voce. */
  balance: Record<ResourceId, ResourceBalance>;
}

const sign = (n: number) => (n >= 0 ? `+${formatAmount(n)}` : `−${formatAmount(-n)}`);

/** Riserve di ogni risorsa con il saldo giornaliero; toccando una risorsa si apre il suo riepilogo. */
export function ResourceBar({ stock, balance }: ResourceBarProps) {
  const [open, setOpen] = useState<ResourceId | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Si chiude toccando altrove o con Esc.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="resources-wrap" ref={ref}>
      <ul className="resources" aria-label="Risorse">
        {RESOURCE_IDS.map((r) => {
          const net = income(balance[r]) - expenses(balance[r]);
          return (
            <li key={r}>
              <button
                className={open === r ? "resource active" : "resource"}
                aria-expanded={open === r}
                aria-label={`${RESOURCE_NAMES[r]}: ${formatAmount(stock[r])}, ${sign(net)} al giorno`}
                onClick={() => setOpen(open === r ? null : r)}
              >
                <ResourceIcon resource={r} size={26} />
                <span className="resource-values">
                  <strong>{formatAmount(stock[r])}</strong>
                  <span className={net < 0 ? "rate negative" : "rate"}>{sign(net)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {open && <ResourceCard resource={open} stock={stock[open]} balance={balance[open]} onClose={() => setOpen(null)} />}
    </div>
  );
}

interface ResourceCardProps {
  resource: ResourceId;
  stock: number;
  balance: ResourceBalance;
  onClose: () => void;
}

function ResourceCard({ resource, stock, balance, onClose }: ResourceCardProps) {
  const produced = income(balance);
  const consumed = expenses(balance);
  const net = produced - consumed;
  const lines: [string, number][] = [
    ["dalle province", balance.provinces],
    ["dal mercato estero", balance.imports],
    ["dal carburante sintetico", balance.synthetic],
  ];
  const uses: [string, number][] = [
    ["mantenimento delle unità", balance.upkeep],
    ["importazioni", balance.importCost],
    ["carburante sintetico", balance.syntheticUse],
  ];
  const days = net < 0 ? stock / -net : null;

  return (
    <section className="resource-card" aria-label={`Riepilogo: ${RESOURCE_NAMES[resource]}`}>
      <img className="resource-photo" src={RESOURCE_IMAGES[resource]} alt="" />
      <div className="resource-card-body">
        <header>
          <h2>{RESOURCE_NAMES[resource]}</h2>
          <button className="icon-button small" onClick={onClose} aria-label="Chiudi">
            ×
          </button>
        </header>
        <dl className="resource-stats">
          <div>
            <dt>In riserva</dt>
            <dd>{formatAmount(stock)}</dd>
          </div>
          <div>
            <dt>Produzione oraria</dt>
            <dd>{formatAmount(produced / 24)}</dd>
          </div>
          <div>
            <dt>Produzione giornaliera</dt>
            <dd>{formatAmount(produced)}</dd>
          </div>
          <div>
            <dt>Consumi giornalieri</dt>
            <dd>{formatAmount(consumed)}</dd>
          </div>
          <div className="total">
            <dt>Saldo al giorno</dt>
            <dd className={net < 0 ? "negative" : "positive"}>{sign(net)}</dd>
          </div>
        </dl>
        {(lines.some(([, v]) => v > 0) || uses.some(([, v]) => v > 0)) && (
          <ul className="resource-breakdown">
            {lines
              .filter(([, v]) => v > 0)
              .map(([label, v]) => (
                <li key={label}>
                  <span>{label}</span>
                  <span>+{formatAmount(v)}</span>
                </li>
              ))}
            {uses
              .filter(([, v]) => v > 0)
              .map(([label, v]) => (
                <li key={label}>
                  <span>{label}</span>
                  <span>−{formatAmount(v)}</span>
                </li>
              ))}
          </ul>
        )}
        {days !== null && <p className="resource-warning">Al ritmo attuale finisce tra {days < 1 ? "meno di un giorno" : `${Math.floor(days)} giorni`}.</p>}
      </div>
    </section>
  );
}
