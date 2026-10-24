// Chi guidava ogni nazione dal 1933 al 1945, con la data d'inizio dell'incarico.
// Per le monarchie e i regimi è il capo effettivo; per le democrazie parlamentari il capo del governo.
// Archivio completo con le fonti: docs/leaders-1933-1945.md.
// Un capo resta in carica finché non arriva il successivo: se la storia della partita prende un'altra
// strada (per esempio una nazione che non viene annessa), resta l'ultimo capo della lista.

export interface Leader {
  name: string;
  title: string;
  /** Nome del ritratto in client/src/assets/leaders/ (senza estensione). */
  portrait: string;
}

export interface LeaderTerm extends Leader {
  /** Inizio dell'incarico, "AAAA-MM-GG". */
  from: string;
}

/** Inizio della mappa attuale: il primo giorno di partita. */
export const CALENDAR_START = "1933-06-01";

const t = (from: string, name: string, title: string, portrait: string): LeaderTerm => ({ from, name, title, portrait });

const PM = "Primo ministro";
const PC = "Presidente del Consiglio";
const PG = "Presidente del governo";

/** Capi di ogni nazione, in ordine di data. Il primo vale per tutto ciò che viene prima. */
export const LEADER_TERMS: Record<string, LeaderTerm[]> = {
  GBR: [
    t("1931-08-24", "Ramsay MacDonald", PM, "gbr-ramsay-macdonald"),
    t("1935-06-07", "Stanley Baldwin", PM, "gbr-stanley-baldwin"),
    t("1937-05-28", "Neville Chamberlain", PM, "gbr-neville-chamberlain"),
    t("1940-05-10", "Winston Churchill", PM, "gbr-winston-churchill"),
    t("1945-07-26", "Clement Attlee", PM, "gbr-clement-attlee"),
  ],
  IRL: [
    t("1932-03-09", "Éamon de Valera", "Presidente del Consiglio esecutivo", "irl-eamon-de-valera"),
    t("1937-12-29", "Éamon de Valera", "Taoiseach", "irl-eamon-de-valera"),
  ],
  NLD: [
    t("1933-05-26", "Hendrikus Colijn", PM, "nld-hendrikus-colijn"),
    t("1939-08-10", "Dirk Jan de Geer", PM, "nld-dirk-jan-de-geer"),
    t("1940-09-03", "Pieter Sjoerds Gerbrandy", "Primo ministro in esilio", "nld-pieter-gerbrandy"),
    t("1945-06-25", "Willem Schermerhorn", PM, "nld-willem-schermerhorn"),
  ],
  BEL: [
    t("1932-10-22", "Charles de Broqueville", PM, "bel-charles-de-broqueville"),
    t("1934-11-20", "Georges Theunis", PM, "bel-georges-theunis"),
    t("1935-03-25", "Paul van Zeeland", PM, "bel-paul-van-zeeland"),
    t("1937-11-24", "Paul-Émile Janson", PM, "bel-paul-emile-janson"),
    t("1938-05-15", "Paul-Henri Spaak", PM, "bel-paul-henri-spaak"),
    t("1939-02-22", "Hubert Pierlot", PM, "bel-hubert-pierlot"),
    t("1945-02-12", "Achille Van Acker", PM, "bel-achille-van-acker"),
  ],
  LUX: [
    t("1926-07-16", "Joseph Bech", PM, "lux-joseph-bech"),
    t("1937-11-05", "Pierre Dupong", PM, "lux-pierre-dupong"),
  ],
  FRA: [
    t("1933-01-31", "Édouard Daladier", PC, "fra-edouard-daladier"),
    t("1933-10-26", "Albert Sarraut", PC, "fra-albert-sarraut"),
    t("1933-11-26", "Camille Chautemps", PC, "fra-camille-chautemps"),
    t("1934-01-30", "Édouard Daladier", PC, "fra-edouard-daladier"),
    t("1934-02-09", "Gaston Doumergue", PC, "fra-gaston-doumergue"),
    t("1934-11-08", "Pierre-Étienne Flandin", PC, "fra-pierre-etienne-flandin"),
    t("1935-06-01", "Fernand Bouisson", PC, "fra-fernand-bouisson"),
    t("1935-06-07", "Pierre Laval", PC, "fra-pierre-laval"),
    t("1936-01-24", "Albert Sarraut", PC, "fra-albert-sarraut"),
    t("1936-06-04", "Léon Blum", PC, "fra-leon-blum"),
    t("1937-06-22", "Camille Chautemps", PC, "fra-camille-chautemps"),
    t("1938-03-13", "Léon Blum", PC, "fra-leon-blum"),
    t("1938-04-10", "Édouard Daladier", PC, "fra-edouard-daladier"),
    t("1940-03-21", "Paul Reynaud", PC, "fra-paul-reynaud"),
    t("1940-06-16", "Philippe Pétain", "Capo dello Stato", "fra-philippe-petain"),
    t("1944-08-20", "Charles de Gaulle", "Capo del governo provvisorio", "fra-charles-de-gaulle"),
  ],
  CHE: [
    t("1933-01-01", "Edmund Schulthess", "Presidente della Confederazione", "che-edmund-schulthess"),
    t("1934-01-01", "Marcel Pilet-Golaz", "Presidente della Confederazione", "che-marcel-pilet-golaz"),
    t("1935-01-01", "Rudolf Minger", "Presidente della Confederazione", "che-rudolf-minger"),
    t("1936-01-01", "Albert Meyer", "Presidente della Confederazione", "che-albert-meyer"),
    t("1937-01-01", "Giuseppe Motta", "Presidente della Confederazione", "che-giuseppe-motta"),
    t("1938-01-01", "Johannes Baumann", "Presidente della Confederazione", "che-johannes-baumann"),
    t("1939-01-01", "Philipp Etter", "Presidente della Confederazione", "che-philipp-etter"),
    t("1940-01-01", "Marcel Pilet-Golaz", "Presidente della Confederazione", "che-marcel-pilet-golaz"),
    t("1941-01-01", "Ernst Wetter", "Presidente della Confederazione", "che-ernst-wetter"),
    t("1942-01-01", "Philipp Etter", "Presidente della Confederazione", "che-philipp-etter"),
    t("1943-01-01", "Enrico Celio", "Presidente della Confederazione", "che-enrico-celio"),
    t("1944-01-01", "Walther Stampfli", "Presidente della Confederazione", "che-walther-stampfli"),
    t("1945-01-01", "Eduard von Steiger", "Presidente della Confederazione", "che-eduard-von-steiger"),
  ],
  // La guerra civile non è nella mappa: la Repubblica fino alla sua caduta, poi Franco.
  ESP: [
    t("1931-10-14", "Manuel Azaña", PG, "esp-manuel-azana"),
    t("1933-09-12", "Alejandro Lerroux", PG, "esp-alejandro-lerroux"),
    t("1933-10-08", "Diego Martínez Barrio", PG, "esp-diego-martinez-barrio"),
    t("1933-12-16", "Alejandro Lerroux", PG, "esp-alejandro-lerroux"),
    t("1934-04-28", "Ricardo Samper", PG, "esp-ricardo-samper"),
    t("1934-10-04", "Alejandro Lerroux", PG, "esp-alejandro-lerroux"),
    t("1935-09-25", "Joaquín Chapaprieta", PG, "esp-joaquin-chapaprieta"),
    t("1935-12-14", "Manuel Portela Valladares", PG, "esp-manuel-portela-valladares"),
    t("1936-02-19", "Manuel Azaña", PG, "esp-manuel-azana"),
    t("1936-05-13", "Santiago Casares Quiroga", PG, "esp-santiago-casares-quiroga"),
    t("1936-07-19", "José Giral", PG, "esp-jose-giral"),
    t("1936-09-04", "Francisco Largo Caballero", PG, "esp-francisco-largo-caballero"),
    t("1937-05-17", "Juan Negrín", PG, "esp-juan-negrin"),
    t("1939-04-01", "Francisco Franco", "Caudillo", "esp-francisco-franco"),
  ],
  PRT: [t("1932-07-05", "António de Oliveira Salazar", PC, "prt-antonio-de-oliveira-salazar")],
  GER: [
    t("1933-01-30", "Adolf Hitler", "Cancelliere", "ger-adolf-hitler"),
    t("1934-08-02", "Adolf Hitler", "Führer", "ger-adolf-hitler"),
    t("1945-04-30", "Karl Dönitz", "Presidente del Reich", "ger-karl-donitz"),
  ],
  POL: [
    t("1926-05-14", "Józef Piłsudski", "Maresciallo", "pol-jozef-pilsudski"),
    t("1935-05-12", "Edward Rydz-Śmigły", "Maresciallo", "pol-edward-rydz-smigly"),
    t("1939-09-30", "Władysław Sikorski", "Primo ministro in esilio", "pol-wladyslaw-sikorski"),
    t("1943-07-14", "Stanisław Mikołajczyk", "Primo ministro in esilio", "pol-stanislaw-mikolajczyk"),
    t("1944-11-29", "Tomasz Arciszewski", "Primo ministro in esilio", "pol-tomasz-arciszewski"),
    t("1945-07-05", "Bolesław Bierut", "Presidente del Consiglio nazionale", "pol-boleslaw-bierut"),
  ],
  DAN: [
    t("1931-01-10", "Ernst Ziehm", "Presidente del Senato", "dan-ernst-ziehm"),
    t("1933-06-20", "Hermann Rauschning", "Presidente del Senato", "dan-hermann-rauschning"),
    t("1934-11-23", "Arthur Greiser", "Presidente del Senato", "dan-arthur-greiser"),
    t("1939-08-23", "Albert Forster", "Capo dello Stato", "dan-albert-forster"),
  ],
  AUT: [
    t("1932-05-20", "Engelbert Dollfuss", "Cancelliere", "aut-engelbert-dollfuss"),
    t("1934-07-29", "Kurt Schuschnigg", "Cancelliere", "aut-kurt-schuschnigg"),
    t("1938-03-11", "Arthur Seyss-Inquart", "Cancelliere", "aut-arthur-seyss-inquart"),
    t("1945-04-27", "Karl Renner", "Cancelliere", "aut-karl-renner"),
  ],
  HUN: [
    t("1932-10-01", "Gyula Gömbös", PM, "hun-gyula-gombos"),
    t("1936-10-12", "Kálmán Darányi", PM, "hun-kalman-daranyi"),
    t("1938-05-14", "Béla Imrédy", PM, "hun-bela-imredy"),
    t("1939-02-16", "Pál Teleki", PM, "hun-pal-teleki"),
    t("1941-04-03", "László Bárdossy", PM, "hun-laszlo-bardossy"),
    t("1942-03-09", "Miklós Kállay", PM, "hun-miklos-kallay"),
    t("1944-03-22", "Döme Sztójay", PM, "hun-dome-sztojay"),
    t("1944-08-29", "Géza Lakatos", PM, "hun-geza-lakatos"),
    t("1944-10-16", "Ferenc Szálasi", "Capo della nazione", "hun-ferenc-szalasi"),
    t("1945-04-04", "Béla Miklós", PM, "hun-bela-miklos"),
  ],
  CZE: [
    t("1918-11-14", "Tomáš Masaryk", "Presidente", "cze-tomas-masaryk"),
    t("1935-12-18", "Edvard Beneš", "Presidente", "cze-edvard-benes"),
    t("1938-11-30", "Emil Hácha", "Presidente", "cze-emil-hacha"),
    t("1945-05-16", "Edvard Beneš", "Presidente", "cze-edvard-benes"),
  ],
  ITA: [
    t("1922-10-31", "Benito Mussolini", "Capo del governo", "ita-benito-mussolini"),
    t("1943-07-25", "Pietro Badoglio", "Capo del governo", "ita-pietro-badoglio"),
    t("1944-06-18", "Ivanoe Bonomi", PC, "ita-ivanoe-bonomi"),
    t("1945-06-21", "Ferruccio Parri", PC, "ita-ferruccio-parri"),
  ],
  ALB: [
    t("1928-09-01", "Zog I", "Re", "alb-zog-i"),
    t("1944-11-29", "Enver Hoxha", "Capo del governo", "alb-enver-hoxha"),
  ],
  YUG: [
    t("1921-08-16", "Alessandro I", "Re", "yug-alessandro-i"),
    t("1934-10-09", "Paolo", "Principe reggente", "yug-principe-paolo"),
    t("1941-03-27", "Pietro II", "Re", "yug-pietro-ii"),
    t("1945-03-07", "Josip Broz Tito", PM, "yug-josip-broz-tito"),
  ],
  GRC: [
    t("1933-03-10", "Panagis Tsaldaris", PM, "grc-panagis-tsaldaris"),
    t("1935-10-10", "Georgios Kondylis", "Reggente", "grc-georgios-kondylis"),
    t("1935-11-30", "Giorgio II", "Re", "grc-giorgio-ii"),
    t("1936-08-04", "Ioannis Metaxas", PM, "grc-ioannis-metaxas"),
    t("1941-01-29", "Alexandros Koryzis", PM, "grc-alexandros-koryzis"),
    t("1941-04-21", "Emmanouil Tsouderos", "Primo ministro in esilio", "grc-emmanouil-tsouderos"),
    t("1944-04-26", "Georgios Papandreou", PM, "grc-georgios-papandreou"),
    t("1945-01-03", "Nikolaos Plastiras", PM, "grc-nikolaos-plastiras"),
  ],
  BGR: [
    t("1918-10-03", "Boris III", "Zar", "bgr-boris-iii"),
    t("1943-08-28", "Cirillo", "Principe reggente", "bgr-principe-cirillo"),
    t("1944-09-09", "Kimon Georgiev", PM, "bgr-kimon-georgiev"),
  ],
  ROU: [
    t("1930-06-08", "Carlo II", "Re", "rou-carlo-ii"),
    t("1940-09-06", "Ion Antonescu", "Conducător", "rou-ion-antonescu"),
    t("1944-08-23", "Michele I", "Re", "rou-michele-i"),
    t("1945-03-06", "Petru Groza", PM, "rou-petru-groza"),
  ],
  SOV: [t("1922-04-03", "Iosif Stalin", "Segretario generale", "sov-iosif-stalin")],
  EST: [
    t("1933-05-18", "Jaan Tõnisson", "Capo dello Stato", "est-jaan-tonisson"),
    t("1933-10-21", "Konstantin Päts", "Capo dello Stato", "est-konstantin-pats"),
    t("1938-04-24", "Konstantin Päts", "Presidente", "est-konstantin-pats"),
  ],
  LVA: [
    t("1933-03-24", "Ādolfs Bļodnieks", PM, "lva-adolfs-blodnieks"),
    t("1934-03-17", "Kārlis Ulmanis", PM, "lva-karlis-ulmanis"),
    t("1936-04-11", "Kārlis Ulmanis", "Presidente", "lva-karlis-ulmanis"),
  ],
  LTU: [t("1926-12-19", "Antanas Smetona", "Presidente", "ltu-antanas-smetona")],
  FIN: [
    t("1931-03-02", "Pehr Evind Svinhufvud", "Presidente", "fin-pehr-evind-svinhufvud"),
    t("1937-03-01", "Kyösti Kallio", "Presidente", "fin-kyosti-kallio"),
    t("1940-12-19", "Risto Ryti", "Presidente", "fin-risto-ryti"),
    t("1944-08-04", "Carl Gustaf Mannerheim", "Presidente", "fin-carl-gustaf-mannerheim"),
  ],
  SWE: [
    t("1932-09-24", "Per Albin Hansson", PM, "swe-per-albin-hansson"),
    t("1936-06-19", "Axel Pehrsson-Bramstorp", PM, "swe-axel-pehrsson-bramstorp"),
    t("1936-09-28", "Per Albin Hansson", PM, "swe-per-albin-hansson"),
  ],
  NOR: [
    t("1933-03-03", "Johan Ludwig Mowinckel", PM, "nor-johan-ludwig-mowinckel"),
    t("1935-03-20", "Johan Nygaardsvold", PM, "nor-johan-nygaardsvold"),
    t("1945-06-25", "Einar Gerhardsen", PM, "nor-einar-gerhardsen"),
  ],
  // Dall'agosto 1943 nessun governo: resta il re.
  DNK: [
    t("1929-04-30", "Thorvald Stauning", PM, "dnk-thorvald-stauning"),
    t("1942-05-04", "Vilhelm Buhl", PM, "dnk-vilhelm-buhl"),
    t("1942-11-09", "Erik Scavenius", PM, "dnk-erik-scavenius"),
    t("1943-08-29", "Cristiano X", "Re", "dnk-cristiano-x"),
    t("1945-05-05", "Vilhelm Buhl", PM, "dnk-vilhelm-buhl"),
  ],
  TUR: [
    t("1923-10-29", "Mustafa Kemal Atatürk", "Presidente", "tur-mustafa-kemal-ataturk"),
    t("1938-11-11", "İsmet İnönü", "Presidente", "tur-ismet-inonu"),
  ],
};

/** Il capo in carica in una data ("AAAA-MM-GG"); prima del primo incarico vale il primo. */
export function leaderAt(nation: string, date: string): Leader | undefined {
  const terms = LEADER_TERMS[nation];
  if (!terms) return undefined;
  let current = terms[0];
  for (const term of terms) if (term.from <= date) current = term;
  return current;
}

/** Data del calendario ("AAAA-MM-GG") dopo tanti minuti di partita. */
export function calendarDate(minutes: number, start = CALENDAR_START): string {
  const ms = Date.parse(`${start}T00:00:00Z`) + Math.floor(minutes / 1440) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}
