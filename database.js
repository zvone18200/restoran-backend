const Database = require('better-sqlite3');

const db = new Database('restoran.db');

// Korisnici
db.exec(`
  CREATE TABLE IF NOT EXISTS korisnici (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    ime      TEXT    NOT NULL,
    email    TEXT    NOT NULL UNIQUE,
    lozinka  TEXT    NOT NULL,
    telefon  TEXT,
    adresa   TEXT
  )
`);

// Jela
db.exec(`
  CREATE TABLE IF NOT EXISTS jela (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    naziv      TEXT    NOT NULL,
    opis       TEXT    NOT NULL,
    cijena     REAL    NOT NULL,
    emoji      TEXT    NOT NULL,
    kategorija TEXT    NOT NULL,
    slika      TEXT
  )
`);

// Narudžbe
db.exec(`
  CREATE TABLE IF NOT EXISTS narudzbe (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    korisnik_id    INTEGER,
    gost_ime       TEXT,
    gost_telefon   TEXT,
    nacin          TEXT    NOT NULL DEFAULT 'restoran',
    stol           INTEGER,
    adresa         TEXT,
    ukupno         REAL    NOT NULL,
    status         TEXT    NOT NULL DEFAULT 'nova',
    datum          TEXT    NOT NULL
  )
`);

// Stavke narudžbe
db.exec(`
  CREATE TABLE IF NOT EXISTS stavke_narudzbe (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    narudzba_id INTEGER NOT NULL,
    jelo_id     INTEGER NOT NULL,
    naziv       TEXT    NOT NULL,
    cijena      REAL    NOT NULL,
    kolicina    INTEGER NOT NULL,
    FOREIGN KEY (narudzba_id) REFERENCES narudzbe(id)
  )
`);

// Ocjene
db.exec(`
  CREATE TABLE IF NOT EXISTS ocjene (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    jelo_id     INTEGER NOT NULL,
    korisnik_id INTEGER,
    gost_ime    TEXT,
    ocjena      INTEGER NOT NULL,
    komentar    TEXT,
    datum       TEXT    NOT NULL,
    FOREIGN KEY (jelo_id) REFERENCES jela(id)
  )
`);

// Početna jela
const brojJela = db.prepare('SELECT COUNT(*) as broj FROM jela').get()
if (brojJela.broj === 0) {
  const insert = db.prepare('INSERT INTO jela (naziv, opis, cijena, emoji, kategorija) VALUES (?, ?, ?, ?, ?)')
  insert.run('Pizza Margherita',    'Paradajz, mozzarella, bosiljak',  12, '🍕', 'Pizza')
  insert.run('Pizza Pepperoni',     'Paradajz, mozzarella, pepperoni', 14, '🍕', 'Pizza')
  insert.run('Spaghetti Bolognese', 'Domaći umak od mesa',             11, '🍝', 'Pasta')
  insert.run('Penne Arrabbiata',    'Ljuti paradajz umak, češnjak',    10, '🍝', 'Pasta')
  insert.run('Tiramisu',            'Klasični talijanski desert',        6, '🍰', 'Deserti')
  insert.run('Panna Cotta',         'Vanilija, karamel umak',           5, '🍮', 'Deserti')
}

module.exports = db;