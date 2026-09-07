// Buttles bränningsmodell — en enda källa för både admin-gränssnittet och
// skriptet i scripts/. Ändra modellen här, inte på två ställen.
//
// Elden tänds på en bestämd tidpunkt och vaktas dygnet runt tills den släcks.
// Skiftbytena ligger fast på 06:00, 15:00 och 23:00: det första passet går
// från tändningen till nästa skiftbyte, det sista passet är det som pågår när
// elden släcks. Två eldvakter och två reserver per pass.
//
// Efter den planerade släckningen läggs ett reservpass — bemannas bara om
// elden inte är släckt i tid. I mars 2026 stod folk på passen efter
// släckningen utan att veta att de var reserv; nu står det i namnet.
//
// Sedan svalnar ugnen fram till måndag. Varje svalningsdag behöver två
// personer som ser till ugnen: väderskydd om det regnar, öppna upp för att
// kyla, och så vidare. Måndag och tisdag töms ugnen — klart klockan 14 på
// tisdagen. Alla dagar har reserver: i mars skrev folk riktiga namn i
// reservfälten även på tömningen.

export const SKIFTBYTEN = ['06:00', '15:00', '23:00'];

const SVALNING = { from: '08:00', till: '16:00', namn: 'Svalning — tillsyn (väderskydd, öppna upp)', platser: 2, reserver: 2 };
const TOMNING = [
  { from: '08:00', till: '16:00', namn: 'Tömning dag 1', platser: 5, reserver: 2 },
  { from: '08:00', till: '14:00', namn: 'Tömning dag 2 — klart kl 14', platser: 5, reserver: 2 },
];
const RESERVPASS = 'Reservpass — bara om elden inte är släckt';

const WEEKDAYS = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];

const minuter = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const veckodag = (dateStr) => WEEKDAYS[new Date(`${dateStr}T12:00:00Z`).getUTCDay()];

// Sorterbart mått på en tidpunkt, så att dygnsgränsen inte behöver hanteras
// separat när pass jämförs mot släckningen.
const tidpunkt = (datum, klockslag) => `${datum} ${klockslag}`;

// Nästa skiftbyte efter ett klockslag; rullar till nästa dygn efter det sista.
function nastaSkifte(datum, klockslag) {
  const efter = SKIFTBYTEN.find((b) => minuter(b) > minuter(klockslag));
  return efter ? { datum, klockslag: efter } : { datum: addDays(datum, 1), klockslag: SKIFTBYTEN[0] };
}

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const KLOCKSLAG = /^\d{2}:\d{2}$/;

/**
 * Bygger hela schemat för en bränning.
 *
 * @param {object} indata
 * @param {Array<{datum: string, personer?: number, namn?: string}>} [indata.stapling]
 * @param {{datum: string, tid: string}} indata.tandning
 * @param {{datum: string, tid: string}} indata.slackning
 * @returns {Array<{date, start_time, end_time, aktivitet, antal_platser, antal_reserver}>}
 */
export function genereraSchema({ stapling = [], tandning, slackning }) {
  for (const [namn, v] of [['tändning', tandning], ['släckning', slackning]]) {
    if (!v || !DATUM.test(v.datum ?? '') || !KLOCKSLAG.test(v.tid ?? '')) {
      throw new Error(`Ogiltig ${namn}: ange datum (YYYY-MM-DD) och klockslag (HH:MM).`);
    }
  }
  if (tidpunkt(slackning.datum, slackning.tid) <= tidpunkt(tandning.datum, tandning.tid)) {
    throw new Error('Släckningen måste ligga efter tändningen.');
  }

  const rader = [];

  // Staplingen behöver lastmaskin med förare hela tiden, och kranbil med
  // förare första dagen. De är egna rader så att någon kan ta på sig att
  // komma med maskinen — inte bara att vara på plats.
  stapling.forEach((dag, i) => {
    if (!DATUM.test(dag.datum ?? '')) throw new Error('Ogiltigt datum för stapeldag.');
    const from = dag.from ?? '08:00';
    const till = dag.till ?? '16:00';
    rader.push({ date: dag.datum, start_time: from, end_time: till, aktivitet: dag.namn || 'Stapling', antal_platser: dag.personer ?? 6, antal_reserver: 2 });
    rader.push({ date: dag.datum, start_time: from, end_time: till, aktivitet: 'Lastmaskin med förare', antal_platser: 1, antal_reserver: 1 });
    if (i === 0) {
      rader.push({ date: dag.datum, start_time: from, end_time: till, aktivitet: 'Kranbil med förare', antal_platser: 1, antal_reserver: 1 });
    }
  });

  // Pass från tändningen fram till det pass som pågår när elden släcks.
  const slut = tidpunkt(slackning.datum, slackning.tid);
  let datum = tandning.datum;
  let klockslag = tandning.tid;
  let nr = 0;

  while (tidpunkt(datum, klockslag) < slut) {
    if (++nr > 60) throw new Error('Orimligt lång bränning — kontrollera datumen.');
    const nasta = nastaSkifte(datum, klockslag);
    rader.push({
      date: datum,
      start_time: klockslag,
      end_time: nasta.klockslag,
      aktivitet: `Eldningspass ${nr}`,
      antal_platser: 2,
      antal_reserver: 2,
    });
    ({ datum, klockslag } = nasta);
  }

  // datum/klockslag står nu där sista eldningspasset slutar — reservpasset
  // tar vid där. Kylningen räknas från eldningspassen, inte från reserven.
  const sistaEldningsdag = datum;
  const reserv = nastaSkifte(datum, klockslag);
  rader.push({
    date: datum,
    start_time: klockslag,
    end_time: reserv.klockslag,
    aktivitet: RESERVPASS,
    antal_platser: 2,
    antal_reserver: 2,
  });

  // Svalning varje dag från dagen efter sista eldningspasset fram till (men
  // inte med) nästa måndag. Är sista passet på en söndag blir det en vecka.
  let dag = addDays(sistaEldningsdag, 1);
  do {
    rader.push({
      date: dag,
      start_time: SVALNING.from,
      end_time: SVALNING.till,
      aktivitet: SVALNING.namn,
      antal_platser: SVALNING.platser,
      antal_reserver: SVALNING.reserver,
    });
    dag = addDays(dag, 1);
  } while (veckodag(dag) !== 'mån');

  TOMNING.forEach((t, i) => {
    rader.push({
      date: addDays(dag, i),
      start_time: t.from,
      end_time: t.till,
      aktivitet: t.namn,
      antal_platser: t.platser,
      antal_reserver: t.reserver,
    });
  });

  return rader;
}
