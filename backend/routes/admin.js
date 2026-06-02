const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');

/* ── GET /api/admin/stats ── */
router.get('/stats', auth, adminOnly, async (req, res) => {
  try {
    const [[{ total_users }]]    = await db.query("SELECT COUNT(*) AS total_users FROM users WHERE role='mahasiswa'");
    const [[{ total_rooms }]]    = await db.query('SELECT COUNT(*) AS total_rooms FROM rooms');
    const [[{ total_messages }]] = await db.query('SELECT COUNT(*) AS total_messages FROM messages');
    const [[{ total_laporan }]]  = await db.query("SELECT COUNT(*) AS total_laporan FROM laporan WHERE status='pending'");
    const [recent_users]         = await db.query(
      "SELECT id,nama,email,jurusan,semester,status,created_at FROM users WHERE role='mahasiswa' ORDER BY created_at DESC LIMIT 5"
    );
    res.json({ total_users, total_rooms, total_messages, total_laporan, recent_users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

/* ── GET /api/admin/users ── */
router.get('/users', auth, adminOnly, async (req, res) => {
  try {
    const { search, status } = req.query;
    let query  = "SELECT id,nama,email,jurusan,semester,status,created_at FROM users WHERE role='mahasiswa'";
    const params = [];

    if (search) {
      query += ' AND (nama LIKE ? OR email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (status) {
      query += ' AND status=?';
      params.push(status);
    }
    query += ' ORDER BY created_at DESC';

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

/* ── PUT /api/admin/users/:id/status ── */
router.put('/users/:id/status', auth, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['aktif', 'banned'].includes(status))
      return res.status(400).json({ message: 'Status harus aktif atau banned' });

    await db.query('UPDATE users SET status=? WHERE id=?', [status, req.params.id]);
    res.json({ message: `Status user diubah menjadi ${status}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

/* ── GET /api/admin/laporan ── */
router.get('/laporan', auth, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT l.id, l.alasan, l.status, l.created_at,
              p.nama AS pelapor_nama,
              t.nama AS terlapor_nama
       FROM laporan l
       JOIN users p ON l.pelapor_id  = p.id
       JOIN users t ON l.terlapor_id = t.id
       ORDER BY l.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

/* ── POST /api/admin/laporan  (bisa dipakai mahasiswa) ── */
router.post('/laporan', auth, async (req, res) => {
  try {
    const { terlapor_id, alasan } = req.body;
    if (!terlapor_id || !alasan)
      return res.status(400).json({ message: 'terlapor_id dan alasan wajib diisi' });

    if (terlapor_id == req.user.id)
      return res.status(400).json({ message: 'Tidak bisa melaporkan diri sendiri' });

    await db.query(
      'INSERT INTO laporan (pelapor_id, terlapor_id, alasan, status) VALUES (?,?,?,?)',
      [req.user.id, terlapor_id, alasan, 'pending']
    );
    res.status(201).json({ message: 'Laporan berhasil dikirim' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

/* ── PUT /api/admin/laporan/:id ── */
router.put('/laporan/:id', auth, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'diproses', 'selesai'].includes(status))
      return res.status(400).json({ message: 'Status tidak valid' });

    await db.query('UPDATE laporan SET status=? WHERE id=?', [status, req.params.id]);
    res.json({ message: 'Status laporan diperbarui' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

module.exports = router;