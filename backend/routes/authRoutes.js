const express = require("express");
const {
  register,
  login,
  getUser,
  updateUser,
  deleteUser,
  changePassword,
} = require("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware");
const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", authMiddleware, getUser);
router.put("/me", authMiddleware, updateUser);
router.delete("/me", authMiddleware, deleteUser);
router.post("/change-password", authMiddleware, changePassword);

module.exports = router;
