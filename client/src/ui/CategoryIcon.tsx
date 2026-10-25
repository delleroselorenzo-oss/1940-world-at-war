import type { ReactNode } from "react";

// Icone stilizzate delle categorie di Produzione (fante, carro, cannone, aereo, nave), nel colore del testo.

export type CategoryIconId = "infantry" | "armor" | "artillery" | "air" | "navy";

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
};
