const express  = require('express');
const cors     = require('cors');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const path     = require('path');
const db       = require('./database');

const app    = express();
const PORT   = 3000;
const SECRET = 'restoran-tajni-kljuc-2024';

const multer = require('multer');
const fs     = require('fs');

// Kreiraj uploads folder ako ne postoji
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads/'),
  filename:    (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // max 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Samo slike su dozvoljene!'))
  }
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── MIDDLEWARE ───────────────────────────────────────────
function provjeriToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Nisi prijavljen!' });
  try {
    req.korisnik = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token nije validan!' });
  }
}

function provjeriAdmin(req, res, next) {
  const adminToken = req.headers['x-admin-token'];
  if (adminToken !== 'admin123') {
    return res.status(403).json({ error: 'Nemate admin pristup!' });
  }
  next();
}

// ─── AUTH ─────────────────────────────────────────────────

// POST /api/register
app.post('/api/register', async (req, res) => {
  const { ime, email, lozinka, telefon } = req.body;
  if (!ime || !email || !lozinka) {
    return res.status(400).json({ error: 'Sva polja su obavezna!' });
  }
  const postoji = db.prepare('SELECT id FROM korisnici WHERE email = ?').get(email);
  if (postoji) return res.status(400).json({ error: 'Email već postoji!' });

  const hash = await bcrypt.hash(lozinka, 10);
  const rezultat = db.prepare(
    'INSERT INTO korisnici (ime, email, lozinka, telefon) VALUES (?, ?, ?, ?)'
  ).run(ime, email, hash, telefon || '');

  const token = jwt.sign(
    { id: rezultat.lastInsertRowid, ime, email },
    SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, id: rezultat.lastInsertRowid, ime, email });
});

// POST /api/login
app.post('/api/login', async (req, res) => {
  const { email, lozinka } = req.body;
  const korisnik = db.prepare('SELECT * FROM korisnici WHERE email = ?').get(email);
  if (!korisnik) return res.status(400).json({ error: 'Pogrešan email ili lozinka!' });

  const tocno = await bcrypt.compare(lozinka, korisnik.lozinka);
  if (!tocno) return res.status(400).json({ error: 'Pogrešan email ili lozinka!' });

  const token = jwt.sign(
    { id: korisnik.id, ime: korisnik.ime, email: korisnik.email },
    SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, id: korisnik.id, ime: korisnik.ime, email: korisnik.email });
});

// GET /api/profil
app.get('/api/profil', provjeriToken, (req, res) => {
  const korisnik = db.prepare('SELECT id, ime, email, telefon, adresa FROM korisnici WHERE id = ?').get(req.korisnik.id);
  res.json(korisnik);
});

// ─── JELA ─────────────────────────────────────────────────

app.get('/api/jela', (req, res) => {
  const jela = db.prepare('SELECT * FROM jela').all();
  const jelaSOcjenama = jela.map(j => {
    const ocjene = db.prepare('SELECT AVG(ocjena) as prosjek, COUNT(*) as broj FROM ocjene WHERE jelo_id = ?').get(j.id);
    return { ...j, prosjekOcjena: ocjene.prosjek || 0, brojOcjena: ocjene.broj }
  });
  res.json(jelaSOcjenama);
});

app.get('/api/narudzbe', provjeriAdmin, (req, res) => {
  const narudzbe = db.prepare('SELECT * FROM narudzbe ORDER BY datum DESC').all();
  const saNarudzbe = narudzbe.map(n => {
    const stavke = db.prepare('SELECT * FROM stavke_narudzbe WHERE narudzba_id = ?').all(n.id)
    let ime = n.gost_ime || 'Gost'
    if (n.korisnik_id) {
      const korisnik = db.prepare('SELECT ime FROM korisnici WHERE id = ?').get(n.korisnik_id)
      if (korisnik) ime = korisnik.ime
    }
    return { ...n, stavke, korisnik_ime: ime }
  });
  res.json(saNarudzbe);
});


app.delete('/api/jela/:id', provjeriAdmin, (req, res) => {
  db.prepare('DELETE FROM jela WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── OCJENE ───────────────────────────────────────────────

app.get('/api/jela/:id/ocjene', (req, res) => {
  const ocjene = db.prepare('SELECT * FROM ocjene WHERE jelo_id = ? ORDER BY datum DESC').all(req.params.id);
  res.json(ocjene);
});

app.post('/api/jela/:id/ocjene', (req, res) => {
  const { ocjena, komentar, gost_ime, korisnik_id } = req.body;
  if (!ocjena || ocjena < 1 || ocjena > 5) {
    return res.status(400).json({ error: 'Ocjena mora biti između 1 i 5!' });
  }
  db.prepare(
    'INSERT INTO ocjene (jelo_id, korisnik_id, gost_ime, ocjena, komentar, datum) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.params.id, korisnik_id || null, gost_ime || 'Gost', ocjena, komentar || '', new Date().toISOString());
  res.json({ success: true });
});

// ─── NARUDŽBE ─────────────────────────────────────────────

app.get('/api/narudzbe', provjeriAdmin, (req, res) => {
  const narudzbe = db.prepare('SELECT * FROM narudzbe ORDER BY datum DESC').all();
  const saNarudzbe = narudzbe.map(n => ({
    ...n,
    stavke: db.prepare('SELECT * FROM stavke_narudzbe WHERE narudzba_id = ?').all(n.id)
  }));
  res.json(saNarudzbe);
});

app.post('/api/narudzbe', (req, res) => {
  const { korisnik_id, gost_ime, gost_telefon, nacin, stol, adresa, stavke, ukupno } = req.body;

  if (!stavke || stavke.length === 0) {
    return res.status(400).json({ error: 'Košarica je prazna!' });
  }
  if (nacin === 'restoran' && !stol) {
    return res.status(400).json({ error: 'Upiši broj stola!' });
  }
  if (nacin === 'dostava' && !adresa) {
    return res.status(400).json({ error: 'Upiši adresu dostave!' });
  }

  const narudzba = db.prepare(`
    INSERT INTO narudzbe (korisnik_id, gost_ime, gost_telefon, nacin, stol, adresa, ukupno, status, datum)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(korisnik_id || null, gost_ime || null, gost_telefon || null, nacin, stol || null, adresa || null, ukupno, new Date().toISOString());

  const insertStavka = db.prepare(
    'INSERT INTO stavke_narudzbe (narudzba_id, jelo_id, naziv, cijena, kolicina) VALUES (?, ?, ?, ?, ?)'
  );
  stavke.forEach(s => insertStavka.run(narudzba.lastInsertRowid, s.id, s.naziv, s.cijena, s.kolicina));

  res.json({ id: narudzba.lastInsertRowid, poruka: 'Narudžba poslana! Čeka prihvaćanje.' });
});

app.put('/api/narudzbe/:id/status', provjeriAdmin, (req, res) => {
  db.prepare('UPDATE narudzbe SET status = ? WHERE id = ?').run(req.body.status, req.params.id);
  res.json({ success: true });
});

// PUT /api/narudzbe/:id/prihvati
app.put('/api/narudzbe/:id/prihvati', provjeriAdmin, (req, res) => {
  db.prepare("UPDATE narudzbe SET status = 'u pripremi' WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// PUT /api/narudzbe/:id/odbij
app.put('/api/narudzbe/:id/odbij', provjeriAdmin, (req, res) => {
  db.prepare("UPDATE narudzbe SET status = 'odbijena' WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// Korisnikove narudžbe
app.get('/api/moje-narudzbe', provjeriToken, (req, res) => {
  const narudzbe = db.prepare('SELECT * FROM narudzbe WHERE korisnik_id = ? ORDER BY datum DESC').all(req.korisnik.id)
  const saNarudzbe = narudzbe.map(n => ({
    ...n,
    stavke: db.prepare('SELECT * FROM stavke_narudzbe WHERE narudzba_id = ?').all(n.id)
  }))
  res.json(saNarudzbe)
})

app.get('/api/admin/korisnici', provjeriAdmin, (req, res) => {
  const korisnici = db.prepare(`
    SELECT k.id, k.ime, k.email, k.telefon, k.adresa,
           COUNT(n.id) AS broj_narudzbi,
           SUM(n.ukupno) AS ukupno_potroseno
    FROM korisnici k
    LEFT JOIN narudzbe n ON n.korisnik_id = k.id
    GROUP BY k.id
    ORDER BY k.id DESC
  `).all()
  res.json(korisnici)
})


// DELETE /api/narudzbe/:id — obriši narudžbu
app.delete('/api/narudzbe/:id', provjeriAdmin, (req, res) => {
  db.prepare('DELETE FROM stavke_narudzbe WHERE narudzba_id = ?').run(req.params.id)
  db.prepare('DELETE FROM narudzbe WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

// DELETE /api/admin/korisnici/:id — obriši korisnika
app.delete('/api/admin/korisnici/:id', provjeriAdmin, (req, res) => {
  db.prepare('DELETE FROM stavke_narudzbe WHERE narudzba_id IN (SELECT id FROM narudzbe WHERE korisnik_id = ?)').run(req.params.id)
  db.prepare('DELETE FROM narudzbe WHERE korisnik_id = ?').run(req.params.id)
  db.prepare('DELETE FROM korisnici WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

// PUT /api/narudzbe/:id/stavke — uredi stavke narudžbe
app.put('/api/narudzbe/:id/stavke', provjeriAdmin, (req, res) => {
  const { stavke, ukupno } = req.body
  db.prepare('DELETE FROM stavke_narudzbe WHERE narudzba_id = ?').run(req.params.id)
  const insert = db.prepare(
    'INSERT INTO stavke_narudzbe (narudzba_id, jelo_id, naziv, cijena, kolicina) VALUES (?, ?, ?, ?, ?)'
  )
  stavke.forEach(s => insert.run(req.params.id, s.jelo_id, s.naziv, s.cijena, s.kolicina))
  db.prepare('UPDATE narudzbe SET ukupno = ? WHERE id = ?').run(ukupno, req.params.id)
  res.json({ success: true })
})

// GET /api/jela/:id/ocjene
app.get('/api/jela/:id/ocjene', (req, res) => {
  const ocjene = db.prepare('SELECT * FROM ocjene WHERE jelo_id = ? ORDER BY datum DESC').all(req.params.id)
  res.json(ocjene)
})

// POST /api/jela/:id/ocjene
app.post('/api/jela/:id/ocjene', (req, res) => {
  const { ocjena, komentar, gost_ime, korisnik_id } = req.body
  if (!ocjena || ocjena < 1 || ocjena > 5) {
    return res.status(400).json({ error: 'Ocjena mora biti između 1 i 5!' })
  }
  db.prepare(
    'INSERT INTO ocjene (jelo_id, korisnik_id, gost_ime, ocjena, komentar, datum) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.params.id, korisnik_id || null, gost_ime || 'Gost', ocjena, komentar || '', new Date().toISOString())
  res.json({ success: true })
})


app.listen(PORT, () => {
  console.log(`✅ Server radi na http://localhost:${PORT}`);
});

// PUT /api/profil
app.put('/api/profil', provjeriToken, (req, res) => {
  const { telefon, adresa } = req.body
  db.prepare('UPDATE korisnici SET telefon = ?, adresa = ? WHERE id = ?')
    .run(telefon || '', adresa || '', req.korisnik.id)
  const korisnik = db.prepare('SELECT id, ime, email, telefon, adresa FROM korisnici WHERE id = ?').get(req.korisnik.id)
  res.json(korisnik)
})

// GET /api/admin/korisnici
app.get('/api/admin/korisnici', provjeriAdmin, (req, res) => {
  const korisnici = db.prepare(`
    SELECT k.id, k.ime, k.email, k.telefon, k.adresa,
           COUNT(n.id) AS broj_narudzbi,
           SUM(n.ukupno) AS ukupno_potroseno
    FROM korisnici k
    LEFT JOIN narudzbe n ON n.korisnik_id = k.id
    GROUP BY k.id
    ORDER BY k.id DESC
  `).all()
  res.json(korisnici)
})

// POST /api/jela/:id/slika — upload slike
app.post('/api/jela/:id/slika', provjeriAdmin, upload.single('slika'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nema slike!' })
  const url = `http://localhost:3000/uploads/${req.file.filename}`
  db.prepare('UPDATE jela SET slika = ? WHERE id = ?').run(url, req.params.id)
  res.json({ url })
})