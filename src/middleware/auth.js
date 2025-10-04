export const verifyUser = (req, res, next) => {
  // Simulate authenticated user
  req.user = { _id: "652f2b1f8a0c1f00123abcd4", role: "admin" };
  next();
};

export const verifyAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin only" });
  }
  next();
};
