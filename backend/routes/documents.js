const express = require("express");
const router = express.Router();
const multer = require("multer");
const crypto = require("crypto"); // ← to było użyte, więc import!
const { createClient } = require("@supabase/supabase-js");

// Konfiguracja Multer
const upload = multer({
  storage: multer.memoryStorage(), // Przechowuj plik w pamięci
  limits: { fileSize: 10 * 1024 * 1024 }, // Maksymalny rozmiar pliku: 10 MB
});

// Konfiguracja Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// POST /api/documents
router.post("/", upload.single("file"), async (req, res) => {
  try {
    const { templateId, category } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "Brak pliku PDF." });
    }

    if (!templateId || !category) {
      return res.status(400).json({
        error: "Brak wymaganych danych (templateId, category).",
      });
    }

    const userId = req.body.userId || null;

    const fileName = `document-${userId || "anonymous"}-${Date.now()}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(fileName, file.buffer, { contentType: "application/pdf" });

    if (uploadError) {
      throw uploadError;
    }

    const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");

    const { data: documentData, error: documentError } = await supabase
      .from("documents")
      .insert([
        {
          user_id: userId,
          template_id: templateId,
          file_path: fileName,
          hash,
          category,
        },
      ])
      .select()
      .single();

    if (documentError) {
      throw documentError;
    }

    const { data: publicUrlData } = supabase.storage
      .from("documents")
      .getPublicUrl(fileName);

    res.status(200).json({
      document: { ...documentData, public_url: publicUrlData.publicUrl },
    });
  } catch (error) {
    console.error("Błąd podczas zapisu dokumentu:", error);
    res.status(500).json({
      error: "Błąd podczas zapisu dokumentu",
      details: error.message,
    });
  }
});

// ⚡️ TO JEST MEGA WAŻNE:
module.exports = router;
