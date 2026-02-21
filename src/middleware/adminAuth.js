// src/middlewares/adminAuth.js
const adminAuth = (req, res, next) => {
  // Adapt this to match however the project handles admin auth
  // e.g., check req.user.role from a JWT middleware already in the pipeline
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

module.exports = adminAuth;