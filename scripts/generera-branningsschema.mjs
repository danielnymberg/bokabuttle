#!/usr/bin/env node
// Skriver ut SQL för en hel bränning. Samma modell som admin-gränssnittet
// använder — den ligger i worker/schema.mjs och finns bara på ett ställe.
//
// Normalfallet görs numera i admin på bokning.buttlekalk.se. Det här skriptet
// är för när något ska rättas i efterhand eller läggas in utan att gå via
// gränssnittet.
//
//   node scripts/generera-branningsschema.mjs --branning 2 \
//     --stapling 2026-10-12,2026-10-13 --tandning 2026-11-17,07:00 --slackning 2026-11-20,23:00
//
//   ... | npx wrangler d1 execute bokabuttle-db --remote --file /dev/stdin

import { genereraSchema, veckodag } from '../worker/schema.mjs';

const args = process.argv.slice(2);
const arg = (namn) => {
  const i = args.indexOf(`--${namn}`);
  return i === -1 ? null : args[i + 1];
};

const branningId = arg('branning');
const tandning = (arg('tandning') ?? '').split(',');
const slackning = (arg('slackning') ?? '').split(',');
const stapling = (arg('stapling') ?? '').split(',').filter(Boolean);
const personer = Number(arg('personer') ?? 6);

if (!branningId || tandning.length !== 2 || slackning.length !== 2) {
  console.error('Användning: --branning <id> --tandning <YYYY-MM-DD,HH:MM> --slackning <YYYY-MM-DD,HH:MM>');
  console.error('            [--stapling <YYYY-MM-DD,YYYY-MM-DD>] [--personer <n>]');
  process.exit(1);
}

let pass;
try {
  pass = genereraSchema({
    stapling: stapling.map((datum) => ({ datum, personer })),
    tandning: { datum: tandning[0], tid: tandning[1] },
    slackning: { datum: slackning[0], tid: slackning[1] },
  });
} catch (err) {
  console.error(`Fel: ${err.message}`);
  process.exit(1);
}

const brannPass = pass.filter((p) => p.aktivitet.startsWith('Eldningspass'));
console.log(`-- Elden tänds ${veckodag(tandning[0])} ${tandning[0]} kl ${tandning[1]}`);
console.log(`-- Släcks ${veckodag(slackning[0])} ${slackning[0]} kl ${slackning[1]} — ${brannPass.length} bränningspass`);
for (const p of pass) {
  console.log(
    `INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver) ` +
    `VALUES (${branningId}, '${p.date}', '${p.start_time}', '${p.end_time}', '${p.aktivitet.replace(/'/g, "''")}', ` +
    `${p.antal_platser}, ${p.antal_reserver}); -- ${veckodag(p.date)}`
  );
}
