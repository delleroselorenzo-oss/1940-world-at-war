import { RESOURCE_IDS, RESOURCE_NAMES } from "@waw/shared";
import type { OfflineReport } from "../game/useLocalGame.js";
import { formatAmount } from "./format.js";

export function OfflineBanner({ report, onClose }: { report: OfflineReport; onClose(): void }) {
  const hours = Math.floor(report.minutes / 60);
  const minutes = report.minutes % 60;
  const gained = RESOURCE_IDS.filter((r) => report.gained[r] > 0.5);
  return (
    <div className="banner" role="status">
      <div>
        <strong>
          Bentornato! Sono passate {hours > 0 ? `${hours} h ` : ""}
          {minutes} min di gioco.
        </strong>{" "}
        {gained.length > 0 && (
          <span>Produzione accreditata: {gained.map((r) => `${RESOURCE_NAMES[r]} +${formatAmount(report.gained[r])}`).join(", ")}.</span>
        )}
      </div>
      <button className="icon-button" onClick={onClose} aria-label="Chiudi">
        ×
      </button>
    </div>
  );
}
