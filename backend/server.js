const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const templatesRouter = require("./routes/templates");
const documentsRouter = require("./routes/documents");
const authRoutes = require("./routes/authRoutes");
const authMiddleware = require("./middlewares/authMiddleware");
const pool = require("./config/db");

const app = express();
app.set("timeout", 60000);

// Middleware
app.use(cors());
app.use(express.json());

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_API_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    fetch: (url, options) => fetch(url, { ...options, timeout: 20000 }), //for unstable wifi
  }
);

// Routes
app.use("/api/templates", authMiddleware, templatesRouter);
app.use("/api/documents", authMiddleware, documentsRouter);
app.use("/api/auth", authRoutes);

// Test database connection (pozostawione dla kompatybilności)
pool.connect((err) => {
  if (err) {
    console.error("DB error:", err.message);
  } else {
    console.log("Connected to Supabase via pool");
  }
});

// Error handling
app.use((req, res) => {
  res.status(404).json({ message: `Cannot ${req.method} ${req.originalUrl}` });
});

// Root route
app.get("/", (req, res) => {
  res.json({ message: "Witaj w backendzie ABPM!" });
});

// Run server
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Serwer działa na porcie ${PORT}`);
});
