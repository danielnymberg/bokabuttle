// Buttles bränningsmodell — en enda källa för både admin-gränssnittet och
// skriptet i scripts/. Ändra modellen här, inte på två ställen.
//
// Elden tänds på en bestämd tidpunkt och vaktas dygnet runt tills den släcks.
// Skiftbytena ligger fast på 06:00, 15:00 och 23:00: det första passet går
// från tändningen till nästa skiftbyte, det sista passet är det som pågår när
// elden släcks. Två eldvakter och två reserver per pass.
//
// Dagen efter släckningen kyls ugnen. Tömningen väntar till måndagen därpå —
// ugnen ska hinna svalna över helgen, och tömning har aldrig lagts på en
// lördag eller söndag. Städning och beredskapsdag följer direkt på tömningen.

export const SKIFTBYTEN = ['06:00', '15:00', '23:00'];

const EFTERARBETE = [
  { from: '08:00', till: '16:00', namn: 'Tömning', platser: 5, reserver: 0 },
  { from: '08:00', till: '16:00', namn: 'Städa av, inventera', platser: 5, reserver: 0 },
  { from: '08:00', till: '16:00', namn: 'Extra dag (beredskap)', platser: 3, reserver: 0 },
];

const KYLNING = { from: '09:00', till: '12:00', namn: 'Kylning', platser: 2, reserver: 0 };

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

  for (const dag of stapling) {
    if (!DATUM.test(dag.datum ?? '')) throw new Error('Ogiltigt datum för stapeldag.');
    rader.push({
      date: dag.datum,
      start_time: dag.from ?? '08:00',
      end_time: dag.till ?? '16:00',
      aktivitet: dag.namn || 'Stapling',
      antal_platser: dag.personer ?? 6,
      antal_reserver: 0,
    });
  }

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
      aktivitet: `Bränning - Pass ${nr}`,
      antal_platser: 2,
      antal_reserver: 2,
    });
    ({ datum, klockslag } = nasta);
  }

  // datum står nu på dygnet då sista passet slutar.
  const kylningsdag = addDays(datum, 1);
  rader.push({
    date: kylningsdag,
    start_time: KYLNING.from,
    end_time: KYLNING.till,
    aktivitet: KYLNING.namn,
    antal_platser: KYLNING.platser,
    antal_reserver: KYLNING.reserver,
  });

  let tomningsdag = kylningsdag;
  do {
    tomningsdag = addDays(tomningsdag, 1);
  } while (veckodag(tomningsdag) !== 'mån');

  EFTERARBETE.forEach((dag, i) => {
    rader.push({
      date: addDays(tomningsdag, i),
      start_time: dag.from,
      end_time: dag.till,
      aktivitet: dag.namn,
      antal_platser: dag.platser,
      antal_reserver: dag.reserver,
    });
  });

  return rader;
}
