import type { ReactNode } from "react";

// Barra in basso con le funzioni della nazione: diplomazia, commercio, edifici, produzione (e, più avanti, ricerca).

export type DockItem = "diplomacy" | "trade" | "buildings" | "production";

interface DockProps {
  active: DockItem | null;
  /** Proposte diplomatiche che aspettano la tua risposta. */
  pending: number;
  onOpen(item: DockItem): void;
}

const ITEMS: { id: DockItem | "research"; label: string; icon: ReactNode }[] = [
  {
    id: "diplomacy",
    label: "Diplomazia",
    // Due fumetti: si tratta.
    icon: (
      <>
        <path d="M3 5h11v7H8l-3 3v-3H3z" />
        <path d="M17 9h4v7h-2v3l-3-3h-5v-2" />
      </>
    ),
  },
  {
    id: "trade",
    label: "Commercio",
    // Bilancia.
    icon: (
      <>
        <path d="M12 3v18M7 21h10M4 7h16" />
        <path d="M6 7l-3 6a3 3 0 0 0 6 0zM18 7l-3 6a3 3 0 0 0 6 0z" />
      </>
    ),
  },
  {
    id: "buildings",
    label: "Edifici",
    // Fabbrica.
    icon: (
      <>
        <path d="M3 21V10l5 3V10l5 3V5h4v16z" />
        <path d="M3 21h18M17 9h4v12" />
      </>
    ),
  },
  {
    id: "production",
    label: "Produzione",
    // Aerosilurante a terra, di profilo: sagoma piena ricalcata da una foto, col muso in alto e la pancia bombata dell'ala;
    // l'elica è inclinata come l'aereo (circa 10°).
    icon: (
      <g transform="translate(0 -0.2)">
        <path fill="currentColor" stroke="none" d="M2.2 10.1 2.6 9.9 3 9.9 4.4 10.2 5.6 10.1 6.3 10 6.9 9.7 7.4 9.7 7.8 9.9 8.9 9.9 9.5 10.2 10 10.6 10.8 11 11.5 11.1 12.3 11.2 13 11.5 14.1 11.8 15.3 12.1 17.1 12.4 18.6 12.7 19 12.3 19.7 11.4 20.5 10.5 20.9 10.1 21.2 9.7 21.8 9.6 22.3 9.9 22.7 11 22.9 12.5 22.8 14.2 22.3 14.4 21.2 14.6 19.7 14.8 18.2 14.7 15.3 14.7 13.4 14.9 12.4 14.9 11.9 15.2 11.5 15.2 10.8 15.1 9.3 14.9 8.2 14.7 7.4 14.5 6.7 14 5.9 13.8 5.2 13.6 4.4 13.4 3.7 13.1 3 12.8 2.2 12.6 2.1 12.2 2.1 11.3 2.1 10.5Z" />
        <ellipse fill="currentColor" stroke="none" cx="1.5" cy="10.9" rx=".8" ry=".55" transform="rotate(10.5 1.9 10.9)" />
        <path strokeWidth={0.8} d="M2.4 8.1l-1 5.6M7.3 13.8l-.8 1.9M19.6 14.7l.4 1.1" />
        <circle fill="currentColor" stroke="none" cx="6.5" cy="15.8" r=".95" />
        <circle fill="currentColor" stroke="none" cx="20" cy="16.3" r=".45" />
      </g>
    ),
  },
  {
    id: "research",
    label: "Ricerca",
    // Provetta.
    icon: (
      <>
        <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" />
        <path d="M7.5 15h9" />
      </>
    ),
  },
];

export function Dock({ active, pending, onOpen }: DockProps) {
  return (
    <nav className="dock" aria-label="Funzioni della nazione">
      {ITEMS.map((item) => {
        const soon = item.id === "research";
        return (
          <button
            key={item.id}
            className={item.id === active ? "dock-button active" : "dock-button"}
            disabled={soon}
            title={soon ? "In arrivo" : undefined}
            aria-pressed={item.id === active}
            onClick={() => !soon && onOpen(item.id as DockItem)}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              {item.icon}
            </svg>
            <span>{item.label}</span>
            {item.id === "diplomacy" && pending > 0 && <span className="badge">{pending}</span>}
          </button>
        );
      })}
    </nav>
  );
}
