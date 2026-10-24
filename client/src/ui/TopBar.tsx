import { calendarDate, leaderAt, type Nation } from "@waw/shared";
import { Flag } from "./Flag.js";
import { formatCountdown } from "./format.js";
import { initials, portraitUrl } from "./leaders.js";

// Pezzi della barra in alto: chi guida la nazione e il calendario della partita.

interface LeaderCardProps {
  nation: Nation;
  /** Minuti di gioco dall'inizio: il capo cambia con la data. */
  minutes: number;
}

export function LeaderCard({ nation, minutes }: LeaderCardProps) {
  const leader = leaderAt(nation.id, calendarDate(minutes));
  const photo = leader && portraitUrl(leader.portrait);
  return (
    <div className="leader-card">
      {photo ? (
        <img className="portrait" src={photo} alt="" style={{ borderColor: nation.color }} />
      ) : (
        <span className="portrait" style={{ background: nation.color, borderColor: nation.color }} aria-hidden>
          {leader ? initials(leader.name) : nation.name[0]}
        </span>
      )}
      <div className="leader-text">
        <strong className="leader-name">{leader?.name ?? nation.name}</strong>
        {leader && <span className="leader-title">{leader.title}</span>}
        <span className="leader-nation">
          <Flag nation={nation.id} fallback={nation.color} title={`Bandiera: ${nation.name}`} />
          {nation.name}
        </span>
      </div>
    </div>
  );
}

const dateFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

interface DayCounterProps {
  /** Minuti di gioco dall'inizio. */
  minutes: number;
  /** Secondi reali al prossimo accredito delle risorse. */
  secondsToTick: number;
}

export function DayCounter({ minutes, secondsToTick }: DayCounterProps) {
  const day = Math.floor(minutes / 1440) + 1;
  const hh = String(Math.floor((minutes % 1440) / 60)).padStart(2, "0");
  const mm = String(Math.floor(minutes % 60)).padStart(2, "0");
  const date = dateFormat.format(new Date(`${calendarDate(minutes)}T00:00:00Z`));
  return (
    <div className="day-counter" title={`${date} · prossimo accredito delle risorse tra ${formatCountdown(secondsToTick)}`}>
      <span className="calendar" aria-hidden>
        <span className="calendar-top">Giorno</span>
        <span className="calendar-day">{day}</span>
      </span>
      <span className="day-text">
        <strong>
          {hh}:{mm}
        </strong>
        <span className="muted-on-bar">{date}</span>
        <span className="muted-on-bar">⟳ {formatCountdown(secondsToTick)}</span>
      </span>
    </div>
  );
}
