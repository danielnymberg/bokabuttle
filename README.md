# Passbokning Buttlekalk

**bokning.buttlekalk.se** — där eldvakter och medhjälpare skriver upp sig på
pass inför en kalkbränning. Ersätter eldpostlistan i Word.

Deltagare behöver ingen inloggning: de skriver sitt namn i en ledig ruta och
trycker Spara. Administratörer loggar in via länken i sidfoten.

## En bränning från början till slut

1. **Logga in i admin** (länken längst ned på sidan).
2. **Ny bränning** — fyll i namn, eventuella stapeldagar, när elden tänds och
   när ni räknar med att släcka. Tryck *Visa schemat*.
3. **Granska schemat** som visas. Blir något fel: ändra i formuläret och visa
   igen. Inget har skrivits till databasen ännu.
4. **Skapa bränningen.** Den blir den som syns på sidan, och den förra stängs
   automatiskt — dess bokningar ligger kvar som historik.
5. **Skicka länken** till dem som ska boka pass.
6. Enstaka pass som saknas läggs till med *Lägg till pass*. En bokning kan
   skrivas över eller tömmas direkt i schemat när du är inloggad.

## Modellen som schemat byggs på

Skiftbytena ligger fast på **06:00, 15:00 och 23:00**. Första passet går från
tändningen till nästa skiftbyte, sedan rullar passen dygnet runt med **två
eldvakter och två reserver** vardera. Sista passet är det som pågår när elden
släcks — **normalt fredag kväll**.

Efter släckningen ett **reservpass** (fre 23–06) som bara bemannas om elden
inte är släckt i tid. Sedan **svalnar ugnen** lördag och söndag — två personer
per dag ser till den: väderskydd, öppna upp för att kyla. Måndag och tisdag
**töms** ugnen, klart kl 14 på tisdagen. Stapeldagar läggs som egna dagar
08–16 med sex platser. Alla dagar har två reserver.

Modellen finns på ett enda ställe: [`worker/schema.mjs`](worker/schema.mjs).
Ändra den där, inte i gränssnittet.

## Vad som faktiskt hände förra gången

**logg.buttlekalk.se** loggar temperaturen i ugnen och visar hur länge det
verkligen brändes. Marsbränningen 2026: tändning tisdag 15:35, elden ute
fredag 22:00 — 78 timmar. Bokningsschemat sträckte sig då till lördag
eftermiddag, så två pass stod bemannade efter att elden var släckt. Stäm av
mot loggen när nästa schema läggs.

## Teknik

Cloudflare Worker + D1. Ingen byggkedja — filerna i `src/` serveras som de är.

```sh
npx wrangler dev                                  # kör lokalt
npx wrangler versions upload                      # preview-URL, rör inte produktionen
npx wrangler deploy                               # skarpt
npx wrangler d1 execute bokabuttle-db --remote --command "SELECT ..."
```

`scripts/generera-branningsschema.mjs` skriver ut samma schema som SQL, för
rättningar i efterhand utan att gå via gränssnittet.

Deploy och ändringar mot skarpa databasen kräver Daniels uttryckliga klartecken
— se `~/dany/CLAUDE.md`.
