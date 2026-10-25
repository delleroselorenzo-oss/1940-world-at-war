import type { ReactNode } from "react";

// Icone stilizzate delle categorie di Produzione (fante, carro, cannone, aereo, nave) ed Edifici
// (caserma, fabbrica, pala del genio), nel colore del testo.

export type CategoryIconId = "infantry" | "armor" | "artillery" | "air" | "navy" | "barracks" | "factory" | "engineer";

export function CategoryIcon({ icon }: { icon: CategoryIconId }) {
  return (
    <svg
      className="category-icon"
      viewBox="0 0 32 32"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[icon]}
    </svg>
  );
}

const PATHS: Record<CategoryIconId, ReactNode> = {
  // Elmetto, volto e spalle, con il fucile in spalla.
  infantry: (
    <>
      <path d="M9 12a7 7 0 0 1 14 0z" fill="currentColor" />
      <path d="M7.5 12h17" />
      <path d="M11.5 12.5v2a4.5 4.5 0 0 0 9 0v-2" />
      <path d="M6 29v-3a6 6 0 0 1 6-6h8a6 6 0 0 1 6 6v3" />
      <path d="M24 4l-3 18" />
    </>
  ),
  // Scafo con i cingoli, torretta e cannone.
  armor: (
    <>
      <rect x="4" y="19" width="24" height="7" rx="3.5" />
      <circle cx="8.5" cy="22.5" r="1.3" fill="currentColor" />
      <circle cx="16" cy="22.5" r="1.3" fill="currentColor" />
      <circle cx="23.5" cy="22.5" r="1.3" fill="currentColor" />
      <path d="M7 19l2-4h13l2 4" />
      <path d="M11 15v-3h8v3" />
      <path d="M19 13h10" />
    </>
  ),
  // Obice da campagna di profilo: canna lunga con il recuperatore, grande ruota a raggi, coda a terra con il vomere.
  artillery: (
    <>
      <path d="M13 15.5L30 9.5" strokeWidth="3.2" />
      <path d="M14 13.2l8-2.8" strokeWidth="1.4" />
      <path d="M15 17.2l1.6 2.4L4.6 27.2 3 25z" fill="currentColor" strokeWidth="1" />
      <path d="M3.4 25.6l-.8 4" strokeWidth="2.2" />
      <circle cx="17" cy="21" r="6" />
      <circle cx="17" cy="21" r="1.4" fill="currentColor" />
      <path d="M17 15v12M11 21h12M12.8 16.8l8.4 8.4M21.2 16.8l-8.4 8.4" strokeWidth="1" />
    </>
  ),
  // Aereo visto dall'alto.
  air: <path d="M16 3l1.6 8 10.4 4v2.5l-10.4-2-.6 8 4 2.5V28L16 26.8 11 28v-2l4-2.5-.6-8-10.4 2V15l10.4-4z" fill="currentColor" strokeWidth="1" />,
  // Nave: scafo, ponte di comando, fumaiolo e onde.
  navy: (
    <>
      <path d="M3 19h26l-4 6H7z" fill="currentColor" />
      <path d="M10 19v-5h9v5" />
      <path d="M14 14v-4h3v4" />
      <path d="M21 19v-3h4" />
      <path d="M3 29c2.5-1.5 4-1.5 6.5 0s4 1.5 6.5 0 4-1.5 6.5 0 4 1.5 6.5 0" />
    </>
  ),
  // Caserma: edificio con il tetto a capanna, porta e bandiera.
  barracks: (
    <>
      <path d="M4 28h24" />
      <path d="M6 28V16l10-6 10 6v12" />
      <path d="M13.5 28v-6h5v6" />
      <path d="M10 18h2M20 18h2" />
      <path d="M16 10V3" />
      <path d="M16 3.5h6l-1.5 2 1.5 2h-6" fill="currentColor" strokeWidth="1" />
    </>
  ),
  // Fabbrica: tetto a shed con la ciminiera fumante.
  factory: (
    <>
      <path d="M3 28h26" />
      <path d="M4 28V17l7 4v-4l7 4v-4l7 4v7" />
      <path d="M22 28V8h4v20" />
      <path d="M23 5c1-1.5 3-1.5 4-3" />
      <path d="M8 24h2M14 24h2" />
    </>
  ),
  // Pala e piccone incrociati.
  engineer: (
    <>
      <path d="M8 26L22 8" />
      <path d="M19.5 5.5l5 5c-1.5 1.5-3.5 2-5 1.5" fill="currentColor" strokeWidth="1" />
      <path d="M24 26L10 10" />
      <path d="M6 7c3-1 6 0 7.5 2.5" />
      <path d="M5.5 23.5l5 5" />
    </>
  ),
};
