#!/usr/bin/env node
// Genererar SQL för en bränningsvecka enligt Buttles etablerade modell.
//
//   node scripts/generera-branningsschema.mjs --branning 2 --start 2026-11-17 --tid 07:00 --pass 13
//   node scripts/generera-branningsschema.mjs --branning 2 --start 2026-11-17 --tid 07:00 --pass 13 | \
//     npx wrangler d1 execute bokabuttle-db --remote --file /dev/stdin
//
// Modellen: elden tänds på startdagen och går dygnet runt med två eldvakter
// och två reserver per pass. Skiftbyten sker 06:00, 15:00 och 23:00 — första
// passet börjar när elden tänds och går fram till nästa skiftbyte. Dagen efter
// att sista passet slutar följer kylning, tömning, städning och en
// beredskapsdag.

const args = process.argv.slice(2);
function arg(name, fallback = null) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
}

const branningId = arg('branning');
const start = arg('start');
const tid = arg('tid', '15:00');
const antalPass = parseInt(arg('pass', '12'), 10);

if (!branningId || !/^\d{4}-\d{2}-\d{2}$/.test(start ?? '') || !/^\d{2}:\d{2}$/.test(tid)) {
  console.error('Användning: --branning <id> --start <YYYY-MM-DD> [--tid HH:MM] [--pass N]');
  console.error('  --start  dagen elden tänds      --tid  klockslag elden tänds (default 15:00)');
  console.error('  --pass   antal bränningspass (default 12)');
  process.exit(1);
}

const SKIFTBYTEN = ['06:00', '15:00', '23:00'];
const WEEKDAYS = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];

// Efterarbetet, dagar räknat från dagen efter att sista passet slutar.
const EFTERARBETE = [
  [0, '09:00', '12:00', 'Kylning', 2, 0],
  [1, '08:00', '16:00', 'Tömning', 5, 0],
  [2, '08:00', '16:00', 'Städa av, inventera', 5, 0],
  [3, '08:00', '16:00', 'Extra dag (beredskap)', 3, 0],
];

const minuter = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const veckodag = (dateStr) => WEEKDAYS[new Date(`${dateStr}T12:00:00Z`).getUTCDay()];

// Nästa skiftbyte efter ett klockslag; rullar till nästa dygn efter det sista.
function nastaSkifte(datum, klockslag) {
  const efter = SKIFTBYTEN.find((b) => minuter(b) > minuter(klockslag));
  return efter ? { datum, klockslag: efter } : { datum: addDays(datum, 1), klockslag: SKIFTBYTEN[0] };
}

const rader = [];
let datum = start;
let klockslag = tid;

for (let nr = 1; nr <= antalPass; nr++) {
  const slut = nastaSkifte(datum, klockslag);
  rader.push({
    date: datum,
    from: klockslag,
    till: slut.klockslag,
    namn: `Bränning - Pass ${nr}`,
    platser: 2,
    reserver: 2,
  });
  ({ datum, klockslag } = slut);
}

// datum/klockslag står nu på när sista passet slutade.
const forstaEfterarbetsdag = addDays(datum, 1);
for (const [offset, from, till, namn, platser, reserver] of EFTERARBETE) {
  rader.push({ date: addDays(forstaEfterarbetsdag, offset), from, till, namn, platser, reserver });
}

console.log(`-- Bränningsschema: elden tänds ${veckodag(start)} ${start} kl ${tid}, ${antalPass} pass`);
console.log(`-- Sista passet slutar ${veckodag(datum)} ${datum} kl ${klockslag}`);
for (const r of rader) {
  console.log(
    `INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver) ` +
    `VALUES (${branningId}, '${r.date}', '${r.from}', '${r.till}', '${r.namn.replace(/'/g, "''")}', ${r.platser}, ${r.reserver}); ` +
    `-- ${veckodag(r.date)}`
  );
}
