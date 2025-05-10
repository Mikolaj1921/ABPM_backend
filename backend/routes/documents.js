const express = require("express");
const router = express.Router();
const multer = require("multer");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const cloudinary = require("cloudinary").v2;

// Konfiguracja Multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// Konfiguracja Supabase
const supabase = createClient(
  process.env.SUPABASE_API_URL,
  process.env.SUPABASE_ANON_KEY
);

// Konfiguracja Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// POST /api/documents
router.post("/", upload.single("file"), async (req, res) => {
  try {
    const { templateId, title, type } = req.body;
    const file = req.file;
    const userId = req.user.id;

    if (!file) {
      return res.status(400).json({ error: "Brak pliku PDF." });
    }

    if (!templateId || !title || !type) {
      return res
        .status(400)
        .json({ error: "Brak wymaganych danych (templateId, title, type)." });
    }

    // Nazwa pliku
    const fileName = `oferta_handlowa_${Date.now()}.pdf`;

    // Zapisz PDF w Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: "raw",
          folder: `documents/user_${userId}`,
          public_id: fileName,
          flags: "attachment",
        },
        (error, result) => {
          if (error) {
            console.error("Cloudinary error:", error);
            reject(error);
          } else {
            resolve(result);
          }
        }
      );
      stream.end(file.buffer);
    });

    // Generuj hash SHA-256
    const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");

    // Zapisz w Supabase
    const { data: documentData, error: documentError } = await supabase
      .from("documents")
      .insert([
        {
          user_id: userId,
          template_id: templateId,
          file_path: uploadResult.secure_url,
          hash,
          type: type || "Oferta Handlowa",
          is_image: false,
          name: title || fileName, // Używamy title zamiast fileName
        },
      ])
      .select()
      .single();

    if (documentError) {
      console.error("Supabase error (POST /documents):", documentError);
      throw documentError;
    }

    res.status(200).json({
      document: { ...documentData, url: uploadResult.secure_url },
    });
  } catch (error) {
    console.error("Błąd podczas zapisu dokumentu:", error);
    res.status(500).json({
      error: "Błąd podczas zapisu dokumentu",
      details: error.message,
    });
  }
});

// GET /api/documents
router.get("/", async (req, res) => {
  try {
    const userId = req.user.id;
    const { category } = req.query; // Obsługa filtrowania po kategorii

    let query = supabase
      .from("documents")
      .select(
        `
        id,
        user_id,
        template_id,
        file_path,
        hash,
        type,
        is_image,
        name,
        created_at,
        templates:template_id (name)
      `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    // Filtrowanie po kategorii, jeśli podano
    if (category) {
      query = query.eq("type", category);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase error (GET /documents):", error);
      throw error;
    }

    // Mapowanie file_path na url
    const formattedData = data.map((doc) => ({
      ...doc,
      url: doc.file_path, // Dodajemy pole url
      template_name: doc.templates?.name || null,
      templates: undefined, // Usuwamy obiekt templates
    }));

    res.json(formattedData);
  } catch (error) {
    console.error("Błąd podczas pobierania dokumentów:", error);
    res.status(500).json({
      error: "Błąd podczas pobierania dokumentów",
      details: error.message,
    });
  }
});

// DELETE /api/documents/:id
router.delete("/:id", async (req, res) => {
  try {
    const userId = req.user.id;
    const documentId = req.params.id;

    // Pobierz dokument, by zweryfikować właściciela i uzyskać file_path
    const { data: document, error: fetchError } = await supabase
      .from("documents")
      .select("id, user_id, file_path")
      .eq("id", documentId)
      .eq("user_id", userId)
      .single();

    if (fetchError || !document) {
      console.error("Supabase error (DELETE /documents):", fetchError);
      return res
        .status(404)
        .json({ error: "Dokument nie znaleziony lub brak uprawnień" });
    }

    // Usuń z Cloudinary
    const publicId = document.file_path
      .split("/")
      .slice(-2)
      .join("/")
      .replace(".pdf", "");
    await cloudinary.uploader.destroy(publicId, { resource_type: "raw" });

    // Usuń z Supabase
    const { error: deleteError } = await supabase
      .from("documents")
      .delete()
      .eq("id", documentId)
      .eq("user_id", userId);

    if (deleteError) {
      console.error("Supabase error (DELETE /documents):", deleteError);
      throw deleteError;
    }

    res.status(200).json({ message: "Dokument usunięty" });
  } catch (error) {
    console.error("Błąd podczas usuwania dokumentu:", error);
    res.status(500).json({
      error: "Błąd podczas usuwania dokumentu",
      details: error.message,
    });
  }
});

module.exports = router;
