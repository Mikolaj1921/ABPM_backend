const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Rejestracja użytkownika
const register = async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    password,
    phone_number,
    phone_prefix,
    date_of_birth,
    rodo,
  } = req.body;

  try {
    // Sprawdzenie, czy email już istnieje
    const existing = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: "Email already in use" });
    }

    // Walidacja zgody RODO
    if (!rodo) {
      return res.status(400).json({ message: "RODO consent is required" });
    }

    // Hashowanie hasła
    const hashedPassword = await bcrypt.hash(password, 12);

    // Wstawienie użytkownika do bazy danych
    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password, phone_number, phone_prefix, date_of_birth, rodo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, first_name, last_name, email`,
      [
        firstName,
        lastName,
        email,
        hashedPassword,
        phone_number,
        phone_prefix,
        date_of_birth,
        rodo,
      ]
    );

    // Generowanie tokenu JWT
    const token = jwt.sign(
      { userId: result.rows[0].id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(201).json({
      token,
      user: {
        id: result.rows[0].id,
        first_name: result.rows[0].first_name,
        last_name: result.rows[0].last_name,
        email: result.rows[0].email,
      },
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
};

// Logowanie użytkownika
const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Wyszukiwanie użytkownika
    const userRes = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (userRes.rows.length === 0) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const user = userRes.rows[0];

    // Weryfikacja hasła
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Generowanie tokenu JWT
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
      },
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
};

// Pobieranie danych zalogowanego użytkownika
const getUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      "SELECT id, first_name, last_name, email FROM users WHERE id = $1",
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Error in getUser:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Aktualizacja danych użytkownika
const updateUser = async (req, res) => {
  const { firstName, lastName, email } = req.body;
  const userId = req.user.id;

  try {
    // Sprawdzenie, czy nowy email nie jest już używany
    if (email) {
      const existing = await pool.query(
        "SELECT * FROM users WHERE email = $1 AND id != $2",
        [email, userId]
      );
      if (existing.rows.length > 0) {
        return res.status(400).json({ message: "Email already in use" });
      }
    }

    // Aktualizacja danych
    const result = await pool.query(
      `UPDATE users
       SET first_name = $1, last_name = $2, email = $3
       WHERE id = $4
       RETURNING id, first_name, last_name, email`,
      [firstName, lastName, email, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Error in updateUser:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Usuwanie konta użytkownika
const deleteUser = async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      "DELETE FROM users WHERE id = $1 RETURNING id",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Error in deleteUser:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Zmiana hasła użytkownika
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  try {
    // Wyszukiwanie użytkownika
    const userRes = await pool.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userRes.rows[0];

    // Weryfikacja bieżącego hasła
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Incorrect current password" });
    }

    // Walidacja nowego hasła
    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "New password must be at least 6 characters long" });
    }

    // Hashowanie nowego hasła
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Aktualizacja hasła
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [
      hashedPassword,
      userId,
    ]);

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Error in changePassword:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  register,
  login,
  getUser,
  updateUser,
  deleteUser,
  changePassword,
};
