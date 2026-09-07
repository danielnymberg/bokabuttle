# Avaktuellt

Filerna här är körda en gång mot databasen och ska inte köras igen. De ligger
kvar som spår av hur marsbränningen 2026 lades upp, inget annat.

- **seed.sql** — det första schemat för mars 2026, inknackat för hand.
- **fix_pass.sql** — tog bort ett dubblerat pass och numrerade om resten.
- **fix_pass_names.sql** — bytte Pass 0–11 till Pass 1–12 och flyttade
  släckningen från lördag till söndag. **Kördes aldrig mot skarpa databasen**,
  vilket är varför passen hette "Pass 0" och släckningen låg kvar på fel dag
  ända till september 2026.
- **fix_data.sql** — rättade årtalet från 2025 till 2026.

Att schemat behövde fyra efterhandsrättningar är hela skälet till att
`scripts/generera-branningsschema.mjs` finns. Lägg inte upp en bränning för
hand igen.
