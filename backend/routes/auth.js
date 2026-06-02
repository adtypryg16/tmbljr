const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const db      = require('../config/db');
const { auth } = require('../middleware/auth');

/* ── POST /api/auth/register ── */
router.post('/register', async (req, res) => {
  try {
    const { nama, email, password, jurusan, semester } = req.body;

    if (!nama || !email || !password) {
      return res.status(400).json({ message: 'Nama, email, dan password wajib diisi' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password minimal 6 karakter' });
    }

    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing.length) {
      return res.status(409).json({ message: 'Email sudah terdaftar' });
    }

    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (nama, email, password, jurusan, semester, role, status) VALUES (?,?,?,?,?,?,?)',
      [nama.trim(), email.toLowerCase().trim(), hash, jurusan || null, semester ? parseInt(semester) : null, 'mahasiswa', 'aktif']
    );

    res.status(201).json({ message: 'Registrasi berhasil! Silakan login.' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

/* ── POST /api/auth/login ── */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email dan password wajib diisi' });
    }

    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (!users.length) {
      return res.status(401).json({ message: 'Email atau password salah' });
    }

    const user = users[0];

    if (user.status === 'banned') {
      return res.status(403).json({ message: 'Akun Anda telah dinonaktifkan. Hubungi admin.' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: 'Email atau password salah' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, nama: user.nama },
      process.env.JWT_SECRET || 'temanbelajar_secret',
      { expiresIn: process.env.JWT_EXPIRES || '7d' }
    );

    res.json({
      message: 'Login berhasil',
      token,
      user: {
        id:       user.id,
        nama:     user.nama,
        email:    user.email,
        role:     user.role,
        jurusan:  user.jurusan,
        semester: user.semester,
        bio:      user.bio,
        avatar:   user.avatar,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

/* ── GET /api/auth/me ── */
router.get('/me', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nama, email, role, jurusan, semester, bio, avatar, status, created_at FROM users WHERE id=?',
      [req.user.id]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    const user = rows[0];

    const [matkul] = await db.query(
      `SELECT mk.id, mk.nama, mk.jurusan FROM mata_kuliah mk
       JOIN user_matkul um ON mk.id = um.matkul_id
       WHERE um.user_id = ?`,
      [req.user.id]
    );

    const [jadwal] = await db.query(
      'SELECT * FROM jadwal WHERE user_id=?',
      [req.user.id]
    );

    res.json({ ...user, matkul, jadwal });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

/* ── PUT /api/auth/profile ── */
router.put('/profile', auth, async (req, res) => {
  try {
    const { nama, jurusan, semester, bio, matkul_ids, jadwal } = req.body;

    if (!nama) {
      return res.status(400).json({ message: 'Nama wajib diisi' });
    }

    await db.query(
      'UPDATE users SET nama=?, jurusan=?, semester=?, bio=? WHERE id=?',
      [nama.trim(), jurusan || null, semester ? parseInt(semester) : null, bio || null, req.user.id]
    );

    if (Array.isArray(matkul_ids)) {
      await db.query('DELETE FROM user_matkul WHERE user_id=?', [req.user.id]);
      for (const mid of matkul_ids) {
        await db.query('INSERT IGNORE INTO user_matkul (user_id, matkul_id) VALUES (?,?)', [req.user.id, mid]);
      }
    }

    if (Array.isArray(jadwal)) {
      await db.query('DELETE FROM jadwal WHERE user_id=?', [req.user.id]);
      for (const j of jadwal) {
        if (j.hari && j.jam_mulai && j.jam_selesai) {
          await db.query(
            'INSERT INTO jadwal (user_id, hari, jam_mulai, jam_selesai) VALUES (?,?,?,?)',
            [req.user.id, j.hari, j.jam_mulai, j.jam_selesai]
          );
        }
      }
    }

    res.json({ message: 'Profil berhasil diperbarui' });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

module.exports = router;