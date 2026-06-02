const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const { auth } = require('../middleware/auth');

/* ── GET /api/partner/matkul ── */
router.get('/matkul', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM mata_kuliah ORDER BY jurusan, nama');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

/* ── GET /api/partner/cari ── */
router.get('/cari', auth, async (req, res) => {
  try {
    const { matkul, jurusan, semester } = req.query;

    let query = `
      SELECT DISTINCT u.id, u.nama, u.jurusan, u.semester, u.bio, u.avatar
      FROM users u
      LEFT JOIN user_matkul um ON u.id = um.user_id
      LEFT JOIN mata_kuliah mk ON um.matkul_id = mk.id
      WHERE u.id != ? AND u.role = 'mahasiswa' AND u.status = 'aktif'
    `;
    const params = [req.user.id];

    if (matkul)   { query += ' AND mk.id = ?';       params.push(parseInt(matkul)); }
    if (jurusan)  { query += ' AND u.jurusan = ?';   params.push(jurusan); }
    if (semester) { query += ' AND u.semester = ?';  params.push(parseInt(semester)); }

    query += ' ORDER BY u.nama LIMIT 50';

    const [users] = await db.query(query, params);

    for (const u of users) {
      const [mk] = await db.query(
        `SELECT mk.nama FROM mata_kuliah mk JOIN user_matkul um ON mk.id=um.matkul_id WHERE um.user_id=?`,
        [u.id]
      );
      u.matkul = mk.map(m => m.nama);
    }

    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

/* ── POST /api/partner/request ── */
router.post('/request', auth, async (req, res) => {
  try {
    const { penerima_id, pesan } = req.body;

    if (!penerima_id)
      return res.status(400).json({ message: 'penerima_id wajib diisi' });

    if (penerima_id == req.user.id)
      return res.status(400).json({ message: 'Tidak bisa mengirim permintaan ke diri sendiri' });

    // Cek request pending yang sudah ada
    const [existing] = await db.query(
      `SELECT id FROM partner_requests
       WHERE pengirim_id=? AND penerima_id=? AND status='pending'`,
      [req.user.id, penerima_id]
    );
    if (existing.length)
      return res.status(409).json({ message: 'Permintaan sudah terkirim, tunggu balasan' });

    // Cek apakah sudah berteman (sudah ada room)
    const [alreadyFriend] = await db.query(
      `SELECT id FROM partner_requests
       WHERE ((pengirim_id=? AND penerima_id=?) OR (pengirim_id=? AND penerima_id=?))
         AND status='diterima'`,
      [req.user.id, penerima_id, penerima_id, req.user.id]
    );
    if (alreadyFriend.length)
      return res.status(409).json({ message: 'Kalian sudah menjadi partner belajar' });

    await db.query(
      'INSERT INTO partner_requests (pengirim_id, penerima_id, pesan) VALUES (?,?,?)',
      [req.user.id, penerima_id, pesan || null]
    );

    res.status(201).json({ message: 'Permintaan berhasil terkirim!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

/* ── GET /api/partner/requests/masuk ── */
router.get('/requests/masuk', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT pr.id, pr.pesan, pr.status, pr.created_at,
              u.id as pengirim_id, u.nama as pengirim_nama,
              u.jurusan as pengirim_jurusan, u.avatar as pengirim_avatar
       FROM partner_requests pr
       JOIN users u ON pr.pengirim_id = u.id
       WHERE pr.penerima_id = ?
       ORDER BY pr.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

/* ── GET /api/partner/requests/keluar ── */
router.get('/requests/keluar', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT pr.id, pr.pesan, pr.status, pr.created_at,
              u.id as penerima_id, u.nama as penerima_nama,
              u.jurusan as penerima_jurusan, u.avatar as penerima_avatar
       FROM partner_requests pr
       JOIN users u ON pr.penerima_id = u.id
       WHERE pr.pengirim_id = ?
       ORDER BY pr.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

/* ── PUT /api/partner/request/:id ── */
router.put('/request/:id', auth, async (req, res) => {
  try {
    const { status } = req.body;

    if (!['diterima', 'ditolak'].includes(status))
      return res.status(400).json({ message: 'Status harus diterima atau ditolak' });

    const [rows] = await db.query(
      "SELECT * FROM partner_requests WHERE id=? AND penerima_id=? AND status='pending'",
      [req.params.id, req.user.id]
    );
    if (!rows.length)
      return res.status(404).json({ message: 'Permintaan tidak ditemukan' });

    await db.query('UPDATE partner_requests SET status=? WHERE id=?', [status, req.params.id]);

    if (status === 'diterima') {
      const reqData = rows[0];
      // Buat room diskusi
      const [result] = await db.query(
        'INSERT INTO rooms (nama) VALUES (?)',
        [`Room ${reqData.pengirim_id}-${reqData.penerima_id}`]
      );
      const roomId = result.insertId;
      await db.query(
        'INSERT INTO room_members (room_id, user_id) VALUES (?,?),(?,?)',
        [roomId, reqData.pengirim_id, roomId, reqData.penerima_id]
      );
      return res.json({ message: 'Permintaan diterima! Room diskusi telah dibuat.', room_id: roomId });
    }

    res.json({ message: 'Permintaan ditolak.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

module.exports = router;