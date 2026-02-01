-- Add aktivitet and slot config to pass
ALTER TABLE brannings_pass ADD COLUMN aktivitet TEXT;
ALTER TABLE brannings_pass ADD COLUMN antal_platser INTEGER DEFAULT 2;
ALTER TABLE brannings_pass ADD COLUMN antal_reserver INTEGER DEFAULT 2;

-- Flexible bookings table (replaces plats_1/plats_2/reserv_1/reserv_2 columns)
CREATE TABLE IF NOT EXISTS pass_bokningar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pass_id INTEGER NOT NULL REFERENCES brannings_pass(id) ON DELETE CASCADE,
  slot_nr INTEGER NOT NULL,  -- 1, 2, 3...
  typ TEXT NOT NULL CHECK(typ IN ('plats', 'reserv')),
  namn TEXT CHECK(length(namn) <= 40),
  UNIQUE(pass_id, typ, slot_nr)
);

CREATE INDEX idx_bokningar_pass ON pass_bokningar(pass_id);
