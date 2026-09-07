#!/usr/bin/env node
// Genererar SQL för en bränningsvecka enligt Buttles etablerade modell.
//
//   node scripts/generera-branningsschema.mjs --branning 2 --start 2026-11-10
//   node scripts/generera-branningsschema.mjs --branning 2 --start 2026-11-10 | \
//     npx wrangler d1 execute bokabuttle-db --remote --file /dev/stdin
//
// Modellen (samma som mars 2026): elden tänds startdagen 15:00 och går
// dygnet runt i tolv pass om 8-9 timmar med två eldvakter och två reserver.
// Sista passet slutar 15:00, dagen efter kylning, sedan tömning, städning
// och en beredskapsdag.

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
}

const branningId = arg('branning');
const start = arg('start');

if (!branningId || !start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
  console.error('Användning: --branning <id> --start <YYYY-MM-DD>  (startdag = dagen elden tänds)');
  process.exit(1);
}

// Dagsförskjutning från startdagen, tid, aktivitet, platser, reserver.
// null aktivitet = numrerat bränningspass, numreras löpande.
const MODELL = [
  [0, '15:00', '23:00', null, 2, 2],
  [0, '23:00', '06:00', null, 2, 2],
  [1, '06:00', '15:00', null, 2, 2],
  [1, '15:00', '23:00', null, 2, 2],
  [1, '23:00', '06:00', null, 2, 2],
  [2, '06:00', '15:00', null, 2, 2],
  [2, '15:00', '23:00', null, 2, 2],
  [2, '23:00', '06:00', null, 2, 2],
  [3, '06:00', '15:00', null, 2, 2],
  [3, '15:00', '23:00', null, 2, 2],
  [3, '23:00', '06:00', null, 2, 2],
  [4, '06:00', '15:00', null, 2, 2],
  [5, '09:00', '12:00', 'Kylning', 2, 0],
  [6, '08:00', '16:00', 'Tömning', 5, 0],
  [7, '08:00', '16:00', 'Städa av, inventera', 5, 0],
  [8, '08:00', '16:00', 'Extra dag (beredskap)', 3, 0],
];

const WEEKDAYS = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

let passNr = 0;
const rader = MODELL.map(([offset, from, till, aktivitet, platser, reserver]) => {
  const date = addDays(start, offset);
  const namn = aktivitet ?? `Bränning - Pass ${++passNr}`;
  return { date, from, till, namn, platser, reserver };
});

console.log(`-- Bränningsschema, start ${start} (${WEEKDAYS[new Date(`${start}T12:00:00Z`).getUTCDay()]})`);
for (const r of rader) {
  const dag = WEEKDAYS[new Date(`${r.date}T12:00:00Z`).getUTCDay()];
  console.log(
    `INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver) ` +
    `VALUES (${branningId}, '${r.date}', '${r.from}', '${r.till}', '${r.namn.replace(/'/g, "''")}', ${r.platser}, ${r.reserver}); ` +
    `-- ${dag}`
  );
}
