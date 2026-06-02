require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const authRouter    = require('./routes/auth');
const partnerRouter = require('./routes/partner');
const chatRouter    = require('./routes/chat');
const adminRouter   = require('./routes/admin');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: true}));

/* ── Serve static frontend ── */
app.use(express.static(path.join(__dirname, '../frontend')));

/* ── Health check ── */
app.get('/api/health', (_, res) => res.json({ status: 'ok', time: new Date() }));

/* ── API Routes ── */
app.use('/api/auth',    authRouter);
app.use('/api/partner', partnerRouter);
app.use('/api/chat',    chatRouter);
app.use('/api/admin',   adminRouter);

/* ── SPA fallback ── */
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  } else {
    res.status(404).json({ message: 'Route tidak ditemukan' });
  }
});

/* ── Start server (lokal) ── */
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () =>
    console.log(`🚀 Server jalan di http://localhost:${PORT}`)
  );
}

module.exports = app;