-- Byt Pass 0-11 till Pass 1-12 (omvänd ordning för att undvika kedjeeffekt)
UPDATE brannings_pass SET aktivitet = 'Bränning - Pass 12' WHERE aktivitet = 'Bränning - Pass 11';
UPDATE brannings_pass SET aktivitet = 'Bränning - Pass 11' WHERE aktivitet = 'Bränning - Pass 10';
UPDATE brannings_pass SET aktivitet = 'Bränning - Pass 10' WHERE aktivitet = 'Bränning - Pass 9';
UPDATE brannings_pass SET aktivitet = 'Bränning - Pass 9' WHERE aktivitet = 'Bränning - Pass 8';
UPDATE brannings_pass SET aktivitet = 'Bränning - Pass 8' WHERE aktivitet = 'Bränning - Pass 7';
UPDATE brannings_pass SET aktivitet = 'Bränning - Pass 7' WHERE aktivitet = 'Bränning - Pass 6';
UPDATE brannings_pass SET aktivitet = 'Bränning - Pass 6' WHERE aktivitet = 'Bränning - Pass 5';
UPDATE brannings_pass SET aktivitet = 'Bränning - Pass 5' WHERE aktivitet = 'Bränning - Pass 4';
UPDATE brannings_pass SET aktivitet = 'Bränning - Pass 4' WHERE aktivitet = 'Bränning - Pass 3';
UPDATE brannings_pass SET aktivitet = 'Bränning - Pass 3' WHERE aktivitet = 'Bränning - Pass 2';
UPDATE brannings_pass SET aktivitet = 'Bränning - Pass 2' WHERE aktivitet = 'Bränning - Pass 1';
UPDATE brannings_pass SET aktivitet = 'Bränning - Pass 1' WHERE aktivitet = 'Bränning - Pass 0';

-- Flytta Släckning → Sön 23 mars 09-12 Kylning
UPDATE brannings_pass SET date = '2025-03-23', start_time = '09:00', end_time = '12:00', aktivitet = 'Kylning' WHERE aktivitet = 'Släckning/Kynining';
