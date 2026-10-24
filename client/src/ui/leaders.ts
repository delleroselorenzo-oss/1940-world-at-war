// Ritratti dei capi delle nazioni (ritagliati sul volto, 128×128, da icone/icone capi di stato/).
// Chi è in carica in una data lo dice leaderAt di /shared.

const files = import.meta.glob<string>("../assets/leaders/*.jpg", { eager: true, import: "default" });

const PORTRAITS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1, -".jpg".length), url]),
);

export function portraitUrl(portrait: string): string | undefined {
  return PORTRAITS[portrait];
}

/** Iniziali per il ritratto provvisorio ("Iosif Stalin" → "IS", "Zog I" → "Z"). */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^\p{Lu}/u.test(w) && !/^[IVX]+$/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
}
