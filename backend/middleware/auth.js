const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Token tidak ditemukan' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'temanbelajar_secret');
    next();
  } catch {
    res.status(401).json({ message: 'Token tidak valid atau sudah kadaluarsa' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ message: 'Akses admin diperlukan' });
  next();
};

module.exports = { auth, adminOnly };