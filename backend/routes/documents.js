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

// Middleware do obsługi błędów Multera
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
  if (
    err.message ===
    "Niedozwolony typ pliku. Dozwolone: PNG, JPEG, JPG, PDF, GIF, WebP, BMP"
  ) {
    return res.status(400).json({
      error: "Niedozwolony typ pliku",
      details: "Dozwolone typy: PNG, JPEG, JPG, PDF, GIF, WebP, BMP",
    });
  }
  next(err);
};

// POST /api/documents
router.post("/", upload.single("file"), handleMulterError, async (req, res) => {
  try {
    // Parsowanie FormData
    const formData = {};
    for (const [key, value] of Object.entries(req.body)) {
      formData[key] = value;
    }
    const file = req.file;
    const userId = req.user.id;

    if (!file) {
      return res.status(400).json({ error: "Brak pliku PDF." });
    }

    const {
      templateId,
      title,
      type,
      logo,
      podpis,
      numer_oferty,
      nazwa_firmy_wystawcy,
      nip_wystawcy,
      adres_wystawcy,
      nazwa_firmy_klienta,
      nip_klienta,
      adres_firmy_klienta,
      wartosc_netto_suma,
      stawka_vat,
      wartosc_vat,
      wartosc_brutto_suma,
      data_wystawienia,
      numer_konta_bankowego,
      products,
    } = formData;

    if (!templateId || !title || !type) {
      return res
        .status(400)
        .json({ error: "Brak wymaganych danych (templateId, title, type)." });
    }

    // Parsowanie products z JSON
    let parsedProducts = [];
    try {
      parsedProducts = products ? JSON.parse(products) : [];
      if (!Array.isArray(parsedProducts)) {
        parsedProducts = [];
      }
    } catch (e) {
      console.error("Error parsing products:", e);
      parsedProducts = [];
    }

    console.log("Received products:", parsedProducts);

    // Nazwa pliku
    const fileName = `faktura_${Date.now()}.pdf`;

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
          type: type || "Faktura",
          is_image: false,
          name: title || fileName,
          logo: logo || null,
          podpis: podpis || null,
          data: {
            products: parsedProducts,
            numer_oferty: numer_oferty || null,
            nazwa_firmy_wystawcy: nazwa_firmy_wystawcy || null,
            nip_wystawcy: nip_wystawcy || null,
            adres_wystawcy: adres_wystawcy || null,
            nazwa_firmy_klienta: nazwa_firmy_klienta || null,
            nip_klienta: nip_klienta || null,
            adres_firmy_klienta: adres_firmy_klienta || null,
            wartosc_netto_suma: wartosc_netto_suma || null,
            stawka_vat: stawka_vat || null,
            wartosc_vat: wartosc_vat || null,
            wartosc_brutto_suma: wartosc_brutto_suma || null,
            data_wystawienia: data_wystawienia || null,
            numer_konta_bankowego: numer_konta_bankowego || null,
          },
        },
      ])
      .select()
      .single();

    if (documentError) {
      console.error("Supabase error (POST /documents):", documentError);
      throw documentError;
    }

    console.log("Inserted document products:", documentData.data?.products);

    res.status(200).json({
      document: {
        ...documentData,
        url: uploadResult.secure_url,
        products: documentData.data?.products || [],
        numer_oferty: documentData.data?.numer_oferty || null,
        nazwa_firmy_wystawcy: documentData.data?.nazwa_firmy_wystawcy || null,
        nip_wystawcy: documentData.data?.nip_wystawcy || null,
        adres_wystawcy: documentData.data?.adres_wystawcy || null,
        nazwa_firmy_klienta: documentData.data?.nazwa_firmy_klienta || null,
        nip_klienta: documentData.data?.nip_klienta || null,
        adres_firmy_klienta: documentData.data?.adres_firmy_klienta || null,
        wartosc_netto_suma: documentData.data?.wartosc_netto_suma || null,
        stawka_vat: documentData.data?.stawka_vat || null,
        wartosc_vat: documentData.data?.wartosc_vat || null,
        wartosc_brutto_suma: documentData.data?.wartosc_brutto_suma || null,
        data_wystawienia: documentData.data?.data_wystawienia || null,
        numer_konta_bankowego: documentData.data?.numer_konta_bankowego || null,
      },
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
        data,
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

    const formattedData = data.map((doc) => {
      console.log("Document products:", doc.data?.products);
      return {
        ...doc,
        url: doc.file_path,
        template_name: doc.templates?.name || null,
        products: Array.isArray(doc.data?.products) ? doc.data.products : [],
        numer_oferty: doc.data?.numer_oferty || null,
        nazwa_firmy_wystawcy: doc.data?.nazwa_firmy_wystawcy || null,
        nip_wystawcy: doc.data?.nip_wystawcy || null,
        adres_wystawcy: doc.data?.adres_wystawcy || null,
        nazwa_firmy_klienta: doc.data?.nazwa_firmy_klienta || null,
        nip_klienta: doc.data?.nip_klienta || null,
        adres_firmy_klienta: doc.data?.adres_firmy_klienta || null,
        wartosc_netto_suma: doc.data?.wartosc_netto_suma || null,
        stawka_vat: doc.data?.stawka_vat || null,
        wartosc_vat: doc.data?.wartosc_vat || null,
        wartosc_brutto_suma: doc.data?.wartosc_brutto_suma || null,
        data_wystawienia: doc.data?.data_wystawienia || null,
        numer_konta_bankowego: doc.data?.numer_konta_bankowego || null,
        templates: undefined,
        data: undefined,
      };
    });

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
      const formData = {};
      for (const [key, value] of Object.entries(req.body)) {
        formData[key] = value;
      }
      const file = req.file;
      const userId = req.user.id;

      // Pobierz istniejący dokument
      const { data: existingDoc, error: fetchError } = await supabase
        .from("documents")
        .select(
          "id, user_id, file_path, template_id, type, name, logo, podpis, data"
        )
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (fetchError || !existingDoc) {
        console.error("Supabase error (PUT /documents):", fetchError);
        return res
          .status(404)
          .json({ error: "Dokument nie znaleziony lub brak uprawnień" });
      }

      // Parsowanie products z JSON
      let parsedProducts = existingDoc.data?.products || [];
      if (formData.products) {
        try {
          parsedProducts = JSON.parse(formData.products);
          if (!Array.isArray(parsedProducts)) {
            parsedProducts = [];
          }
        } catch (e) {
          console.error("Error parsing products:", e);
          parsedProducts = [];
        }
      }

      console.log("Received products for update:", parsedProducts);

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
        const fileName = `faktura_${Date.now()}.pdf`;
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

      // Przygotuj dane do aktualizacji
      const updateData = {
        template_id: formData.templateId || existingDoc.template_id,
        file_path: filePath,
        hash: hash || existingDoc.hash,
        type: formData.type || existingDoc.type,
        name: formData.title || existingDoc.name,
        logo: formData.logo !== undefined ? formData.logo : existingDoc.logo,
        podpis:
          formData.podpis !== undefined ? formData.podpis : existingDoc.podpis,
        data: {
          products: parsedProducts,
          numer_oferty:
            formData.numer_oferty || existingDoc.data?.numer_oferty || null,
          nazwa_firmy_wystawcy:
            formData.nazwa_firmy_wystawcy ||
            existingDoc.data?.nazwa_firmy_wystawcy ||
            null,
          nip_wystawcy:
            formData.nip_wystawcy || existingDoc.data?.nip_wystawcy || null,
          adres_wystawcy:
            formData.adres_wystawcy || existingDoc.data?.adres_wystawcy || null,
          nazwa_firmy_klienta:
            formData.nazwa_firmy_klienta ||
            existingDoc.data?.nazwa_firmy_klienta ||
            null,
          nip_klienta:
            formData.nip_klienta || existingDoc.data?.nip_klienta || null,
          adres_firmy_klienta:
            formData.adres_firmy_klienta ||
            existingDoc.data?.adres_firmy_klienta ||
            null,
          wartosc_netto_suma:
            formData.wartosc_netto_suma ||
            existingDoc.data?.wartosc_netto_suma ||
            null,
          stawka_vat:
            formData.stawka_vat || existingDoc.data?.stawka_vat || null,
          wartosc_vat:
            formData.wartosc_vat || existingDoc.data?.wartosc_vat || null,
          wartosc_brutto_suma:
            formData.wartosc_brutto_suma ||
            existingDoc.data?.wartosc_brutto_suma ||
            null,
          data_wystawienia:
            formData.data_wystawienia ||
            existingDoc.data?.data_wystawienia ||
            null,
          numer_konta_bankowego:
            formData.numer_konta_bankowego ||
            existingDoc.data?.numer_konta_bankowego ||
            null,
        },
        updated_at: new Date().toISOString(),
      };

      // Aktualizuj dokument w Supabase
      const { data: updatedDoc, error: updateError } = await supabase
        .from("documents")
        .update(updateData)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();

      if (updateError) {
        console.error("Supabase error (PUT /documents):", updateError);
        throw updateError;
      }

      console.log("Updated document products:", updatedDoc.data?.products);

      res.status(200).json({
        document: {
          ...updatedDoc,
          url: filePath,
          products: updatedDoc.data?.products || [],
          numer_oferty: updatedDoc.data?.numer_oferty || null,
          nazwa_firmy_wystawcy: updatedDoc.data?.nazwa_firmy_wystawcy || null,
          nip_wystawcy: updatedDoc.data?.nip_wystawcy || null,
          adres_wystawcy: updatedDoc.data?.adres_wystawcy || null,
          nazwa_firmy_klienta: updatedDoc.data?.nazwa_firmy_klienta || null,
          nip_klienta: updatedDoc.data?.nip_klienta || null,
          adres_firmy_klienta: updatedDoc.data?.adres_firmy_klienta || null,
          wartosc_netto_suma: updatedDoc.data?.wartosc_netto_suma || null,
          stawka_vat: updatedDoc.data?.stawka_vat || null,
          wartosc_vat: updatedDoc.data?.wartosc_vat || null,
          wartosc_brutto_suma: updatedDoc.data?.wartosc_brutto_suma || null,
          data_wystawienia: updatedDoc.data?.data_wystawienia || null,
          numer_konta_bankowego: updatedDoc.data?.numer_konta_bankowego || null,
        },
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

      const extension =
        file.mimetype === "application/pdf"
          ? "pdf"
          : file.mimetype.split("/")[1];
      const fileName = `${field}_${userId}_${Date.now()}.${extension}`;
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
// zaebis
