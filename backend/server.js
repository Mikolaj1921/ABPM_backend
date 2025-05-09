const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const PDFDocument = require("pdfkit");
const crypto = require("crypto");
const cors = require("cors");
const pool = require("./config/db");
const app = express();

// Routers path
const templatesRouter = require("./routes/templates");
const documentsRouter = require("./routes/documents");
const generateDocumentRouter = require("./routes/generate-document");
const authRoutes = require("./routes/authRoutes");

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/templates", templatesRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/generate-document", generateDocumentRouter);
app.use("/api/auth", authRoutes);

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Test database connection
pool.connect((err) => {
  if (err) {
    console.error("DB error:", err.message);
  } else {
    console.log("Connected to Supabase");
  }
});

// Error handling for undefined routes
app.use((req, res, next) => {
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
