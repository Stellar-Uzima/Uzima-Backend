/* eslint-disable prettier/prettier */
function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ message: 'User not authenticated' });
    }

    // Check both 'role' (singular) and 'roles' (plural) for flexibility
    const userRoles = Array.isArray(req.user.roles) ? req.user.roles : (req.user.role ? [req.user.role] : []);
    
    if (userRoles.length === 0) {
      return res.status(403).json({ message: 'User not authenticated' });
    }

    const hasRole = userRoles.some(r => allowedRoles[0].includes(r));
    if (!hasRole) {
      return res.status(403).json({ message: 'Insufficient role' });
    }

    next();
  };
}

export default requireRoles;
