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
    // Elmetto.
    icon: (
      <>
        <path d="M4 15a8 8 0 0 1 16 0z" />
        <path d="M2 15h20v2H2zM12 7v8" />
      </>
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
