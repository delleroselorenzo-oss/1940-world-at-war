import type { ReactNode } from "react";

// Bandiere del giugno 1933, disegnate in modo semplificato (SVG 30×20, proporzioni uniformi).
// Germania: il tricolore nero-bianco-rosso, bandiera nazionale ufficiale nel 1933.

const W = 30;
const H = 20;

function horizontal(colors: string[], weights?: number[]): ReactNode {
  const w = weights ?? colors.map(() => 1);
  const total = w.reduce((a, b) => a + b, 0);
  let y = 0;
  return colors.map((c, i) => {
    const h = (w[i]! / total) * H;
    const rect = <rect key={i} x={0} y={y} width={W} height={h + 0.05} fill={c} />;
    y += h;
    return rect;
  });
}

function vertical(colors: string[]): ReactNode {
  const w = W / colors.length;
  return colors.map((c, i) => <rect key={i} x={i * w} y={0} width={w + 0.05} height={H} fill={c} />);
}

/** Croce scandinava, con bordo opzionale (Norvegia). */
function nordic(bg: string, cross: string, border?: string): ReactNode {
  const x = 9;
  return (
    <>
      <rect width={W} height={H} fill={bg} />
      {border && (
        <>
          <rect x={x - 1} y={0} width={6} height={H} fill={border} />
          <rect x={0} y={H / 2 - 3} width={W} height={6} fill={border} />
        </>
      )}
      <rect x={x} y={0} width={4} height={H} fill={cross} />
      <rect x={0} y={H / 2 - 2} width={W} height={4} fill={cross} />
    </>
  );
}

function star(cx: number, cy: number, r: number, fill: string): ReactNode {
  const points = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.4;
    return `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`;
  }).join(" ");
  return <polygon points={points} fill={fill} />;
}

const FLAGS: Record<string, ReactNode> = {
  GBR: (
    <>
      <rect width={W} height={H} fill="#012169" />
      <path d="M0 0 L30 20 M30 0 L0 20" stroke="#fff" strokeWidth={4} />
      <path d="M0 0 L30 20 M30 0 L0 20" stroke="#c8102e" strokeWidth={1.4} />
      <path d="M15 0 V20 M0 10 H30" stroke="#fff" strokeWidth={6} />
      <path d="M15 0 V20 M0 10 H30" stroke="#c8102e" strokeWidth={3.4} />
    </>
  ),
  IRL: vertical(["#169b62", "#fff", "#ff883e"]),
  NLD: horizontal(["#ae1c28", "#fff", "#21468b"]),
  BEL: vertical(["#000", "#fdda24", "#ef3340"]),
  LUX: horizontal(["#ed2939", "#fff", "#00a1de"]),
  FRA: vertical(["#002395", "#fff", "#ed2939"]),
  CHE: (
    <>
      <rect width={W} height={H} fill="#d52b1e" />
      <rect x={13} y={4} width={4} height={12} fill="#fff" />
      <rect x={9} y={8} width={12} height={4} fill="#fff" />
    </>
  ),
  ESP: horizontal(["#c60b1e", "#ffc400", "#6c2a87"]),
  PRT: (
    <>
      <rect width={12} height={H} fill="#046a38" />
      <rect x={12} width={18} height={H} fill="#da291c" />
      <circle cx={12} cy={10} r={4.2} fill="#ffe900" />
      <circle cx={12} cy={10} r={2.6} fill="#da291c" />
    </>
  ),
  GER: horizontal(["#000", "#fff", "#dd0000"]),
  POL: horizontal(["#fff", "#dc143c"]),
  DAN: (
    <>
      <rect width={W} height={H} fill="#d00c33" />
      {[7, 13.5].map((y) => (
        <g key={y} fill="#fff">
          <rect x={7} y={y - 2.5} width={1.6} height={5} />
          <rect x={5.3} y={y - 0.8} width={5} height={1.6} />
        </g>
      ))}
      <path d="M5.5 3.2 L6.4 1.6 L7.8 2.6 L9.2 1.6 L10.1 3.2 Z" fill="#ffcc00" />
    </>
  ),
  AUT: horizontal(["#ed2939", "#fff", "#ed2939"]),
  HUN: horizontal(["#ce2939", "#fff", "#477050"]),
  CZE: (
    <>
      <rect width={W} height={H / 2} fill="#fff" />
      <rect y={H / 2} width={W} height={H / 2} fill="#d7141a" />
      <polygon points="0,0 15,10 0,20" fill="#11457e" />
    </>
  ),
  ITA: (
    <>
      {vertical(["#009246", "#fff", "#ce2b37"])}
      <rect x={12.6} y={6} width={4.8} height={7} rx={1} fill="#1f4e9e" />
      <rect x={13.3} y={6.7} width={3.4} height={5.6} fill="#ce2b37" />
      <rect x={14.6} y={6.7} width={0.8} height={5.6} fill="#fff" />
      <rect x={13.3} y={9.1} width={3.4} height={0.8} fill="#fff" />
    </>
  ),
  ALB: (
    <>
      <rect width={W} height={H} fill="#e41e20" />
      <path
        d="M15 4.5 L13.6 6.4 L11 5.2 L11.8 8.4 L9.6 9 L12 10.6 L11 13 L13.6 12 L15 15.5 L16.4 12 L19 13 L18 10.6 L20.4 9 L18.2 8.4 L19 5.2 L16.4 6.4 Z"
        fill="#000"
      />
    </>
  ),
  YUG: horizontal(["#0c4076", "#fff", "#c6363c"]),
  GRC: (
    <>
      {horizontal(Array.from({ length: 9 }, (_, i) => (i % 2 === 0 ? "#0d5eaf" : "#fff")))}
      <rect width={H * (5 / 9)} height={H * (5 / 9)} fill="#0d5eaf" />
      <rect x={(H * (5 / 9)) / 2 - 1.1} width={2.2} height={H * (5 / 9)} fill="#fff" />
      <rect y={(H * (5 / 9)) / 2 - 1.1} width={H * (5 / 9)} height={2.2} fill="#fff" />
    </>
  ),
  BGR: horizontal(["#fff", "#00966e", "#d62612"]),
  ROU: vertical(["#002b7f", "#fcd116", "#ce1126"]),
  SOV: (
    <>
      <rect width={W} height={H} fill="#cc0000" />
      {star(5.5, 3.6, 1.6, "#ffd700")}
      <path d="M3.6 8.6 L7.4 5.6" stroke="#ffd700" strokeWidth={0.9} />
      <path d="M4.2 5.6 A3 3 0 1 0 7.6 8.2" fill="none" stroke="#ffd700" strokeWidth={0.9} />
    </>
  ),
  EST: horizontal(["#0072ce", "#000", "#fff"]),
  LVA: horizontal(["#9e3039", "#fff", "#9e3039"], [2, 1, 2]),
  LTU: horizontal(["#fdb913", "#006a44", "#c1272d"]),
  FIN: nordic("#fff", "#003580"),
  SWE: nordic("#006aa7", "#fecc00"),
  NOR: nordic("#ba0c2f", "#00205b", "#fff"),
  DNK: nordic("#c8102e", "#fff"),
  TUR: (
    <>
      <rect width={W} height={H} fill="#e30a17" />
      <circle cx={11} cy={10} r={5} fill="#fff" />
      <circle cx={12.3} cy={10} r={4} fill="#e30a17" />
      {star(17.2, 10, 2.2, "#fff")}
    </>
  ),
};

interface FlagProps {
  nation: string;
  /** Colore della nazione sulla mappa, se la bandiera manca. */
  fallback?: string;
  className?: string;
  title?: string;
}

export function Flag({ nation, fallback = "#888", className, title }: FlagProps) {
  return (
    <svg className={className ?? "flag"} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title ?? `Bandiera: ${nation}`}>
      {FLAGS[nation] ?? <rect width={W} height={H} fill={fallback} />}
    </svg>
  );
}
