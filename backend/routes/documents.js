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
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "application/pdf",
      "image/gif",
      "image/webp",
      "image/bmp",
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Niedozwolony typ pliku. Dozwolone: PNG, JPEG, JPG, PDF, GIF, WebP, BMP"
        ),
        false
      );
    }
  },
});

// Konfiguracja Supabase
const supabase = createClient(
  process.env.SUPABASE_API_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Konfiguracja Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Error handling middleware for Multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "Plik jest za duży",
        details: `Maksymalny rozmiar pliku to ${
          upload.limits.fileSize / (1024 * 1024)
        } MB`,
      });
    }
    return res.status(400).json({
      error: "Błąd podczas wgrywania pliku",
      details: err.message,
    });
  }
  if (err.message === "Niedozwolony typ pliku. Dozwolone: PNG, JPEG, PDF") {
    return res.status(400).json({
      error: "Niedozwolony typ pliku",
      details: "Dozwolone typy: PNG, JPEG, PDF",
    });
  }
  next(err);
};

// POST /api/documents
router.post("/", upload.single("file"), handleMulterError, async (req, res) => {
  try {
    const { templateId, title, type, logo, podpis } = req.body;
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
          name: title || fileName,
          logo: logo || null,
          podpis: podpis || null,
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
    const { category } = req.query;

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
        logo,
        podpis,
        templates:template_id (name)
      `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (category) {
      query = query.eq("type", category);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase error (GET /documents):", error);
      throw error;
    }

    const formattedData = data.map((doc) => ({
      ...doc,
      url: doc.file_path,
      template_name: doc.templates?.name || null,
      templates: undefined,
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

// PUT /api/documents/:id
router.put(
  "/:id",
  upload.single("file"),
  handleMulterError,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { templateId, title, type, logo, podpis } = req.body;
      const file = req.file;
      const userId = req.user.id;

      // Pobierz istniejący dokument
      const { data: existingDoc, error: fetchError } = await supabase
        .from("documents")
        .select("id, user_id, file_path, template_id, type, name, logo, podpis")
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (fetchError || !existingDoc) {
        console.error("Supabase error (PUT /documents):", fetchError);
        return res
          .status(404)
          .json({ error: "Dokument nie znaleziony lub brak uprawnień" });
      }

      let filePath = existingDoc.file_path;
      let hash = existingDoc.hash;

      // Jeśli przesłano nowy plik PDF
      if (file) {
        // Usuń stary plik z Cloudinary
        const publicId = existingDoc.file_path
          .split("/")
          .slice(-2)
          .join("/")
          .replace(".pdf", "");
        await cloudinary.uploader.destroy(publicId, { resource_type: "raw" });

        // Zapisz nowy PDF w Cloudinary
        const fileName = `oferta_handlowa_${Date.now()}.pdf`;
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

        filePath = uploadResult.secure_url;
        hash = crypto.createHash("sha256").update(file.buffer).digest("hex");
      }

      // Aktualizuj dokument w Supabase
      const { data: updatedDoc, error: updateError } = await supabase
        .from("documents")
        .update({
          template_id: templateId || existingDoc.template_id,
          file_path: filePath,
          hash: hash || existingDoc.hash,
          type: type || existingDoc.type,
          name: title || existingDoc.name,
          logo: logo !== undefined ? logo : existingDoc.logo,
          podpis: podpis !== undefined ? podpis : existingDoc.podpis,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();

      if (updateError) {
        console.error("Supabase error (PUT /documents):", updateError);
        throw updateError;
      }

      res.status(200).json({
        document: { ...updatedDoc, url: filePath },
      });
    } catch (error) {
      console.error("Błąd podczas aktualizacji dokumentu:", error);
      res.status(500).json({
        error: "Błąd podczas aktualizacji dokumentu",
        details: error.message,
      });
    }
  }
);

// POST /api/documents/upload-image
router.post(
  "/upload-image",
  upload.single("image"),
  handleMulterError,
  async (req, res) => {
    try {
      const file = req.file;
      const { userId, field } = req.body;

      if (!file) {
        return res.status(400).json({ error: "Brak pliku obrazu." });
      }
      if (!userId || !field) {
        return res.status(400).json({ error: "Brak userId lub field." });
      }

      const fileName = `${field}_${userId}_${Date.now()}.png`;
      const { data, error } = await supabase.storage
        .from("documents")
        .upload(fileName, file.buffer, { contentType: file.mimetype });

      if (error) {
        console.error("Supabase Storage error:", error);
        throw error;
      }

      const fileUrl = supabase.storage.from("documents").getPublicUrl(fileName)
        .data.publicUrl;

      res.status(200).json({ url: fileUrl });
    } catch (error) {
      console.error("Błąd podczas wgrywania obrazu:", error);
      res.status(500).json({
        error: "Błąd podczas wgrywania obrazu",
        details: error.message,
      });
    }
  }
);

// DELETE /api/documents/:id
router.delete("/:id", async (req, res) => {
  try {
    const userId = req.user.id;
    const documentId = req.params.id;

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

    const publicId = document.file_path
      .split("/")
      .slice(-2)
      .join("/")
      .replace(".pdf", "");
    await cloudinary.uploader.destroy(publicId, { resource_type: "raw" });

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
