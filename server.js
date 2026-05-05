const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'bookings.json');

// Middleware
app.use(cors());
app.use(express.json());

// Serve static HTML/CSS/JS files from parent directory
app.use(express.static(path.join(__dirname, '..')));

// JSON database helpers
function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([]));
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeDB(bookings) {
  fs.writeFileSync(DB_FILE, JSON.stringify(bookings, null, 2));
}

function nextId(bookings) {
  return bookings.length === 0 ? 1 : Math.max(...bookings.map(b => b.id)) + 1;
}

// Helper: get all occupied dates for an apartment
function getOccupiedDates(aptId) {
  const bookings = readDB().filter(b => b.apt_id === aptId && b.status !== 'cancelled');
  const dates = new Set();
  bookings.forEach(({ check_in, check_out }) => {
    const d = new Date(check_in);
    const end = new Date(check_out);
    while (d < end) {
      dates.add(d.toISOString().split('T')[0]);
      d.setDate(d.getDate() + 1);
    }
  });
  return Array.from(dates).sort();
}

// GET /api/bookings/all — list all bookings (admin)
app.get('/api/bookings/all', (req, res) => {
  const bookings = readDB().sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json(bookings);
});

// GET /api/bookings/:aptId — return occupied dates
app.get('/api/bookings/:aptId', (req, res) => {
  const { aptId } = req.params;
  const occupied = getOccupiedDates(aptId);
  res.json({ apt_id: aptId, occupied_dates: occupied });
});

// POST /api/bookings — create a new booking
app.post('/api/bookings', (req, res) => {
  const { apt_id, name, phone, check_in, check_out, pay_method, comment } = req.body;

  if (!apt_id || !check_in || !check_out) {
    return res.status(400).json({ error: 'Укажите apt_id, check_in и check_out' });
  }

  // Validate dates
  const inDate = new Date(check_in);
  const outDate = new Date(check_out);
  if (isNaN(inDate) || isNaN(outDate) || outDate <= inDate) {
    return res.status(400).json({ error: 'Некорректные даты' });
  }

  // Check for conflicts
  const occupied = new Set(getOccupiedDates(apt_id));
  const d = new Date(check_in);
  while (d < outDate) {
    if (occupied.has(d.toISOString().split('T')[0])) {
      return res.status(409).json({ error: 'Выбранные даты уже заняты. Пожалуйста, выберите другие.' });
    }
    d.setDate(d.getDate() + 1);
  }

  // Save booking
  const bookings = readDB();
  const booking = {
    id: nextId(bookings),
    apt_id,
    name: name || '',
    phone: phone || '',
    check_in,
    check_out,
    pay_method: pay_method || 'whatsapp',
    comment: comment || '',
    status: 'confirmed',
    created_at: new Date().toISOString()
  };
  bookings.push(booking);
  writeDB(bookings);

  const newOccupied = getOccupiedDates(apt_id);
  res.json({ success: true, booking_id: booking.id, occupied_dates: newOccupied });
});

// DELETE /api/bookings/:id — cancel a booking (admin)
app.delete('/api/bookings/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const bookings = readDB();
  const idx = bookings.findIndex(b => b.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Бронь не найдена' });
  bookings[idx].status = 'cancelled';
  writeDB(bookings);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`\n✅ Сервер запущен: http://localhost:${PORT}`);
  console.log(`   Откройте сайт: http://localhost:${PORT}/index.html`);
  console.log(`   Квартира:      http://localhost:${PORT}/apartment-detail.html`);
  console.log(`   Все брони:     http://localhost:${PORT}/api/bookings\n`);
});
