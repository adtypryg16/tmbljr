const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const { auth } = require('../middleware/auth');

/* ── GET /api/chat/rooms ── */
router.get('/rooms', auth, async (req, res) => {
  try {
    const [rooms] = await db.query(
      `SELECT r.id, r.nama, r.created_at,
        (SELECT u.nama FROM users u
         JOIN room_members rm2 ON u.id = rm2.user_id
         WHERE rm2.room_id = r.id AND u.id != ?
         LIMIT 1) AS partner_nama,
        (SELECT u.avatar FROM users u
         JOIN room_members rm2 ON u.id = rm2.user_id
         WHERE rm2.room_id = r.id AND u.id != ?
         LIMIT 1) AS partner_avatar,
        (SELECT isi FROM messages
         WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) AS last_message,
        (SELECT created_at FROM messages
         WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) AS last_message_time
       FROM rooms r
       JOIN room_members rm ON r.id = rm.room_id
       WHERE rm.user_id = ?
       ORDER BY last_message_time DESC, r.created_at DESC`,
      [req.user.id, req.user.id, req.user.id]
    );
    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

/* ── GET /api/chat/rooms/:id/messages ── */
router.get('/rooms/:id/messages', auth, async (req, res) => {
  try {
    const [member] = await db.query(
      'SELECT id FROM room_members WHERE room_id=? AND user_id=?',
      [req.params.id, req.user.id]
    );
    if (!member.length)
      return res.status(403).json({ message: 'Anda bukan anggota room ini' });

    const [messages] = await db.query(
      `SELECT m.id, m.room_id, m.user_id, m.isi, m.created_at,
              u.nama AS sender_nama, u.avatar AS sender_avatar
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.room_id = ?
       ORDER BY m.created_at ASC
       LIMIT 100`,
      [req.params.id]
    );
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

/* ── POST /api/chat/rooms/:id/messages ── */
router.post('/rooms/:id/messages', auth, async (req, res) => {
  try {
    const [member] = await db.query(
      'SELECT id FROM room_members WHERE room_id=? AND user_id=?',
      [req.params.id, req.user.id]
    );
    if (!member.length)
      return res.status(403).json({ message: 'Anda bukan anggota room ini' });

    const isi = req.body.isi?.trim();
    if (!isi) return res.status(400).json({ message: 'Pesan tidak boleh kosong' });

    const [result] = await db.query(
      'INSERT INTO messages (room_id, user_id, isi) VALUES (?,?,?)',
      [req.params.id, req.user.id, isi]
    );

    const [msg] = await db.query(
      `SELECT m.*, u.nama AS sender_nama FROM messages m
       JOIN users u ON m.user_id = u.id WHERE m.id=?`,
      [result.insertId]
    );

    res.status(201).json(msg[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

/* ── GET /api/chat/rooms/:id/jadwal ── */
router.get('/rooms/:id/jadwal', auth, async (req, res) => {
  try {
    const [member] = await db.query(
      'SELECT id FROM room_members WHERE room_id=? AND user_id=?',
      [req.params.id, req.user.id]
    );
    if (!member.length)
      return res.status(403).json({ message: 'Anda bukan anggota room ini' });

    const [rows] = await db.query(
      `SELECT jb.*, u.nama AS creator_nama
       FROM jadwal_bersama jb
       JOIN users u ON jb.created_by = u.id
       WHERE jb.room_id = ?
       ORDER BY jb.tanggal, jb.jam_mulai`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

/* ── POST /api/chat/rooms/:id/jadwal ── */
router.post('/rooms/:id/jadwal', auth, async (req, res) => {
  try {
    const [member] = await db.query(
      'SELECT id FROM room_members WHERE room_id=? AND user_id=?',
      [req.params.id, req.user.id]
    );
    if (!member.length)
      return res.status(403).json({ message: 'Anda bukan anggota room ini' });

    const { judul, tanggal, jam_mulai, jam_selesai, lokasi } = req.body;
    if (!judul || !tanggal)
      return res.status(400).json({ message: 'Judul dan tanggal wajib diisi' });

    await db.query(
      'INSERT INTO jadwal_bersama (room_id, judul, tanggal, jam_mulai, jam_selesai, lokasi, created_by) VALUES (?,?,?,?,?,?,?)',
      [req.params.id, judul, tanggal, jam_mulai || null, jam_selesai || null, lokasi || null, req.user.id]
    );

    res.status(201).json({ message: 'Jadwal belajar berhasil dibuat' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

module.exports = router;