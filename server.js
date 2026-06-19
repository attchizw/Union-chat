const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const db = new Database('unions.db');
const SECRET = 'unions_secret_key_2024';

app.use(express.json());
app.use(express.static('.'));

// إنشاء جدول المستخدمين
db.exec(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// تسجيل حساب جديد
app.post('/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.json({ success: false, message: 'Fill all fields' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)')
      .run(username, email, hash);
    res.json({ success: true, message: 'Account created!' });
  } catch (e) {
    res.json({ success: false, message: 'Username or email already exists' });
  }
});

// تسجيل الدخول
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.json({ success: false, message: 'Wrong email or password' });
  const token = jwt.sign({ id: user.id, username: user.username }, SECRET);
  res.json({ success: true, token, username: user.username });
});

// الشات
let waitingUsers = [];
let activePairs = {};

io.on('connection', (socket) => {
  socket.on('find_partner', (username) => {
    socket.username = username || 'Anonymous';
    if (waitingUsers.length > 0) {
      const partner = waitingUsers.shift();
      activePairs[socket.id] = partner.id;
      activePairs[partner.id] = socket.id;
      socket.emit('chat_start', { partner: partner.username });
      partner.emit('chat_start', { partner: socket.username });
    } else {
      waitingUsers.push(socket);
      socket.emit('waiting');
    }
  });

  socket.on('message', (text) => {
    const partnerId = activePairs[socket.id];
    if (partnerId) io.to(partnerId).emit('message', { text, from: socket.username });
  });

  socket.on('disconnect', () => {
    const partnerId = activePairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('partner_disconnected');
      delete activePairs[partnerId];
    }
    delete activePairs[socket.id];
    waitingUsers = waitingUsers.filter(u => u.id !== socket.id);
  });
});

server.listen(3000, () => console.log("✅ Union's running on http://localhost:3000"));