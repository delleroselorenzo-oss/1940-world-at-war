import { useEffect, useState } from "react";
import {
  BUILDINGS,
  importCapacityPerDay,
  importFlows,
  RESOURCE_NAMES,
  syntheticPerDay,
  TRADABLE,
  TRADE,
  type GameState,
  type Order,
  type ResourceId,
} from "@waw/shared";
import type { LoadedMap } from "./map/loadMap.js";
import { MarketSection } from "./MarketSection.js";
import { formatAmount } from "./ui/format.js";
import { ResourceIcon } from "./ui/ResourceIcon.js";

// Commercio: borsa degli scambi tra nazioni, mercato estero (il resto del mondo, fuori dalla mappa) e carburante sintetico.

interface TradePanelProps {
  map: LoadedMap;
  game: GameState;
  error: string | null;
  onSetImport: (resource: ResourceId, perDay: number) => void;
  order(o: Order): string | null;
  onSelectProvince: (id: string) => void;
  onClose: () => void;
}

export function TradePanel({ map, game, error, onSetImport, order, onSelectProvince, onClose }: TradePanelProps) {
  const [tab, setTab] = useState<"market" | "foreign">("market");
  const nation = game.playerNation;
  const capacity = importCapacityPerDay(map.data, game, nation);
  const flows = importFlows(map.data, game, nation, capacity);
  const quota = map.nations.get(nation)?.oilConcessionPerDay ?? 0;
  const contracted = Object.values(game.nations[nation]?.imports ?? {}).reduce((sum, v) => sum + (v ?? 0), 0);
  const plants = map.data.provinces
    .filter((p) => game.provinces[p.id]?.owner === nation && (game.buildings[p.id]?.syntheticFuel ?? 0) > 0)
    .map((p) => ({ province: p, level: game.buildings[p.id]!.syntheticFuel!, ...syntheticPerDay(p, game.provinces[p.id]!, game.buildings[p.id]) }));

  return (
    <aside className="panel" aria-label="Commercio">
      <header className="panel-header">
        <div>
          <p className="panel-kicker">Economia</p>
          <h2>Commercio</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Chiudi">
          ×
        </button>
      </header>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "market"} className={tab === "market" ? "active" : ""} onClick={() => setTab("market")}>
          Borsa tra nazioni
        </button>
        <button role="tab" aria-selected={tab === "foreign"} className={tab === "foreign" ? "active" : ""} onClick={() => setTab("foreign")}>
          Mercato estero
        </button>
      </div>

      <div className="panel-body">
        {tab === "market" ? (
          <MarketSection map={map} game={game} order={order} />
        ) : (
          <>
            <p className="muted">
              Il resto del mondo (Americhe, Medio Oriente, colonie) vende risorse a chi può farle arrivare: via mare dalle città costiere e
              dai porti, via terra attraverso i vicini con cui non sei in guerra e senza embargo. Si paga in denaro a ogni accredito.
            </p>

            <h3>Capacità di importazione</h3>
            <dl className="facts">
              <div>
                <dt>Via mare</dt>
                <dd>{formatAmount(capacity.sea)} al giorno</dd>
              </div>
              <div>
                <dt>Via terra</dt>
                <dd>{formatAmount(capacity.overland)} al giorno</dd>
              </div>
              <div className="wide">
                <dt>Impegnata dai contratti</dt>
                <dd className={contracted > capacity.total ? "warning" : undefined}>
                  {formatAmount(contracted)} su {formatAmount(capacity.total)} al giorno
                  {contracted > capacity.total && " · i contratti arrivano ridotti in proporzione"}
                </dd>
              </div>
            </dl>
            <p className="muted small">
              Ogni città costiera vale {formatAmount(TRADE.portCityPerDay)}, ogni porto costruito dal genio {formatAmount(TRADE.portPerLevel)};
              ogni vicino in pace {formatAmount(TRADE.overlandPerNeighbor)} (al massimo {formatAmount(TRADE.overlandMax)}).
            </p>

            <h3>Contratti</h3>
            <p className="muted small">Tutti i contratti insieme non possono superare la capacità di importazione.</p>
            {TRADABLE.map((r) => (
              <ImportRow
                key={r}
                resource={r}
                requested={game.nations[nation]?.imports?.[r] ?? 0}
                flow={flows.find((f) => f.resource === r)}
                quota={r === "oil" ? quota : 0}
                onSet={(v) => onSetImport(r, v)}
              />
            ))}
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}

            <h3>Carburante sintetico</h3>
            {plants.length === 0 ? (
              <p className="muted small">
                Nessun impianto. Si costruisce nelle città: ogni livello trasforma {formatAmount(BUILDINGS.syntheticMetalPerLevel)} di metallo
                in {formatAmount(BUILDINGS.syntheticOilPerLevel)} di petrolio al giorno.
              </p>
            ) : (
              <ul className="plain-list">
                {plants.map((p) => (
                  <li key={p.province.id}>
                    <button className="link-button" onClick={() => onSelectProvince(p.province.id)}>
                      {p.province.name}
                    </button>{" "}
                    liv. {p.level}: −{formatAmount(p.metal)} metallo, +{formatAmount(p.oil)} petrolio al giorno
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

interface ImportRowProps {
  resource: ResourceId;
  requested: number;
  flow: ReturnType<typeof importFlows>[number] | undefined;
  quota: number;
  onSet: (perDay: number) => void;
}

function ImportRow({ resource, requested, flow, quota, onSet }: ImportRowProps) {
  const [value, setValue] = useState(String(requested));
  useEffect(() => setValue(String(requested)), [requested]);
  const price = TRADE.prices[resource]!;
  const amount = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(amount) && amount >= 0;

  return (
    <div className="import-row">
      <p>
        <ResourceIcon resource={resource} /> <strong>{RESOURCE_NAMES[resource]}</strong>{" "}
        <span className="muted">
          · {price.toLocaleString("it-IT")} di denaro l'uno
          {quota > 0 && ` (i primi ${formatAmount(quota)} al giorno dalle tue concessioni a ${TRADE.concessionPrice.toLocaleString("it-IT")})`}
        </span>
      </p>
      <form
        className="import-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSet(amount);
        }}
      >
        <label>
          Al giorno
          <input type="number" min={0} step={100} value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <button className="button small" type="submit" disabled={!valid || amount === requested}>
          Firma
        </button>
        {requested > 0 && (
          <button className="link-button" type="button" onClick={() => onSet(0)}>
            Annulla contratto
          </button>
        )}
      </form>
      {flow && (
        <p className="small">
          Arrivano {formatAmount(flow.perDay)} al giorno per {formatAmount(flow.cost)} di denaro
          {flow.perDay < flow.requested && <span className="warning"> · la capacità non basta per tutto il contratto</span>}
        </p>
      )}
    </div>
  );
}
