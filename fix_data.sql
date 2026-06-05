-- Rensa alla pass och bokningar, re-seed med korrekta datum (2026)
DELETE FROM pass_bokningar;
DELETE FROM brannings_pass;

-- Stapling: Mån 16 + Tis 17
INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver) VALUES (1, '2026-03-16', '08:00', '16:00', 'Stapling', 6, 0);
INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver) VALUES (1, '2026-03-17', '08:00', '15:00', 'Stapling', 6, 0);

-- Bränning: Tis 17 kväll → Lör 21 morgon (Pass 0-11, 12 pass)
INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver) VALUES (1, '2026-03-17', '15:00', '23:00', 'Bränning - Pass 0', 2, 2);
INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver) VALUES (1, '2026-03-17', '23:00', '06:00', 'Bränning - Pass 1', 2, 2);
INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver) VALUES (1, '2026-03-18', '06:00', '15:00', 'Bränning - Pass 2', 2, 2);
INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver) VALUES (1, '2026-03-18', '15:00', '23:00', 'Bränning - Pass 3', 2, 2);
INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver) VALUES (1, '2026-03-18', '23:00', '06:00', 'Bränning - Pass 4', 2, 2);
INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver) VALUES (1, '2026-03-19', '06:00', '15:00', 'Bränning - Pass 5', 2, 2);
INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver) VALUES (1, '2026-03-19', '15:00', '23:00', 'Bränning - Pass 6', 2, 2);
INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver) VALUES (1, '2026-03-19', '23:00', '06:00', 'Bränning - Pass 7', 2, 2);
INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver) VALUES (1, '2026-03-20', '06:00', '15:00', 'Bränning - Pass 8', 2, 2);
INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver) VALUES (1, '2026-03-20', '15:00', '23:00', 'Bränning - Pass 9', 2, 2);
INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver) VALUES (1, '2026-03-20', '23:00', '06:00', 'Bränning - Pass 10', 2, 2);
INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver) VALUES (1, '2026-03-21', '06:00', '15:00', 'Bränning - Pass 11', 2, 2);

-- Efterarbete
INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver) VALUES (1, '2026-03-21', '08:00', '16:00', 'Släckning/Kynining', 2, 0);
INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver) VALUES (1, '2026-03-23', '08:00', '16:00', 'Tömning', 5, 0);
INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver) VALUES (1, '2026-03-24', '08:00', '16:00', 'Städa av, inventera', 5, 0);
INSERT INTO brannings_pass (branning_id, date, start_time, end_time, aktivitet, antal_platser, antal_reserver) VALUES (1, '2026-03-25', '08:00', '16:00', 'Extra dag (beredskap)', 3, 0);
