// Dottrine militari (docs/game-design.md, §9 "Dottrine"): ogni nazione ha quella storicamente più vicina.
// Per ora cambiano solo le foto delle unità; vantaggi e svantaggi arriveranno più avanti.

export type DoctrineId = "allies" | "japanese" | "nazi" | "communist";

export const DOCTRINE_NAMES: Record<DoctrineId, string> = {
  allies: "Alleati",
  japanese: "Nipponici",
  nazi: "Nazisti",
  communist: "Comunisti",
};

/** Nazioni con una dottrina diversa da quella degli Alleati (la predefinita). */
const NATION_DOCTRINES: Record<string, DoctrineId> = {
  GER: "nazi",
  AUT: "nazi",
  DAN: "nazi",
  ITA: "nazi",
  HUN: "nazi",
  ROU: "nazi",
  BGR: "nazi",
  SOV: "communist",
};

export function doctrineOf(nation: string): DoctrineId {
  return NATION_DOCTRINES[nation] ?? "allies";
}
