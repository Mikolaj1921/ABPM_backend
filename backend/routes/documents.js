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
      obowiazki,
      oferty,
      nazwa_firmy,
      adres_firmy,
      nip,
      regon,
      przedstawiciel_imie_nazwisko,
      przedstawiciel_stanowisko,
      imie_nazwisko_pracownika,
      adres_pracownika,
      pesel_pracownika,
      stanowisko,
      wymiar_pracy,
      miejsce_pracy,
      wynagrodzenie,
      termin_platnosci,
      czas_trwania_umowy,
      data_rozpoczecia,
      data,
      miejsce_zawarcia,
      numer_faktury,
      data_sprzedazy,
      sposob_platnosci,
      telefon_wystawcy,
      email_wystawcy,
      telefon_klienta,
      email_klienta,
      wystawiajacy,
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

    // Parsowanie obowiazki z JSON
    let parsedObowiazki = [];
    try {
      parsedObowiazki = obowiazki ? JSON.parse(obowiazki) : [];
      if (!Array.isArray(parsedObowiazki)) {
        parsedObowiazki = [];
      }
    } catch (e) {
      console.error("Error parsing obowiazki:", e);
      parsedObowiazki = [];
    }

    // Parsowanie oferty z JSON
    let parsedOferty = [];
    try {
      parsedOferty = oferty ? JSON.parse(oferty) : [];
      if (!Array.isArray(parsedOferty)) {
        parsedOferty = [];
      }
    } catch (e) {
      console.error("Error parsing oferty:", e);
      parsedOferty = [];
    }

    console.log("Received data:", {
      products: parsedProducts,
      obowiazki: parsedObowiazki,
      oferty: parsedOferty,
    });

    // Nazwa pliku
    const fileName = `${type
      .toLowerCase()
      .replace(" ", "_")}_${Date.now()}.pdf`;

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
            obowiazki: parsedObowiazki,
            oferty: parsedOferty,
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
            nazwa_firmy: nazwa_firmy || null,
            adres_firmy: adres_firmy || null,
            nip: nip || null,
            regon: regon || null,
            przedstawiciel_imie_nazwisko: przedstawiciel_imie_nazwisko || null,
            przedstawiciel_stanowisko: przedstawiciel_stanowisko || null,
            imie_nazwisko_pracownika: imie_nazwisko_pracownika || null,
            adres_pracownika: adres_pracownika || null,
            pesel_pracownika: pesel_pracownika || null,
            stanowisko: stanowisko || null,
            wymiar_pracy: wymiar_pracy || null,
            miejsce_pracy: miejsce_pracy || null,
            wynagrodzenie: wynagrodzenie || null,
            termin_platnosci: termin_platnosci || null,
            czas_trwania_umowy: czas_trwania_umowy || null,
            data_rozpoczecia: data_rozpoczecia || null,
            data: data || null,
            miejsce_zawarcia: miejsce_zawarcia || null,
            numer_faktury: numer_faktury || null,
            data_sprzedazy: data_sprzedazy || null,
            sposob_platnosci: sposob_platnosci || null,
            telefon_wystawcy: telefon_wystawcy || null,
            email_wystawcy: email_wystawcy || null,
            telefon_klienta: telefon_klienta || null,
            email_klienta: email_klienta || null,
            wystawiajacy: wystawiajacy || null,
          },
        },
      ])
      .select()
      .single();

    if (documentError) {
      console.error("Supabase error (POST /documents):", documentError);
      throw documentError;
    }

    console.log("Inserted document data:", documentData.data);

    res.status(200).json({
      document: {
        ...documentData,
        url: uploadResult.secure_url,
        products: documentData.data?.products || [],
        obowiazki: documentData.data?.obowiazki || [],
        oferty: documentData.data?.oferty || [],
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
        nazwa_firmy: documentData.data?.nazwa_firmy || null,
        adres_firmy: documentData.data?.adres_firmy || null,
        nip: documentData.data?.nip || null,
        regon: documentData.data?.regon || null,
        przedstawiciel_imie_nazwisko:
          documentData.data?.przedstawiciel_imie_nazwisko || null,
        przedstawiciel_stanowisko:
          documentData.data?.przedstawiciel_stanowisko || null,
        imie_nazwisko_pracownika:
          documentData.data?.imie_nazwisko_pracownika || null,
        adres_pracownika: documentData.data?.adres_pracownika || null,
        pesel_pracownika: documentData.data?.pesel_pracownika || null,
        stanowisko: documentData.data?.stanowisko || null,
        wymiar_pracy: documentData.data?.wymiar_pracy || null,
        miejsce_pracy: documentData.data?.miejsce_pracy || null,
        wynagrodzenie: documentData.data?.wynagrodzenie || null,
        termin_platnosci: documentData.data?.termin_platnosci || null,
        czas_trwania_umowy: documentData.data?.czas_trwania_umowy || null,
        data_rozpoczecia: documentData.data?.data_rozpoczecia || null,
        data: documentData.data?.data || null,
        miejsce_zawarcia: documentData.data?.miejsce_zawarcia || null,
        numer_faktury: documentData.data?.numer_faktury || null,
        data_sprzedazy: documentData.data?.data_sprzedazy || null,
        sposob_platnosci: documentData.data?.sposob_platnosci || null,
        telefon_wystawcy: documentData.data?.telefon_wystawcy || null,
        email_wystawcy: documentData.data?.email_wystawcy || null,
        telefon_klienta: documentData.data?.telefon_klienta || null,
        email_klienta: documentData.data?.email_klienta || null,
        wystawiajacy: documentData.data?.wystawiajacy || null,
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
      console.log("Document data:", doc.data);
      return {
        ...doc,
        url: doc.file_path,
        template_name: doc.templates?.name || null,
        products: Array.isArray(doc.data?.products) ? doc.data.products : [],
        obowiazki: Array.isArray(doc.data?.obowiazki) ? doc.data.obowiazki : [],
        oferty: Array.isArray(doc.data?.oferty) ? doc.data.oferty : [],
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
        nazwa_firmy: doc.data?.nazwa_firmy || null,
        adres_firmy: doc.data?.adres_firmy || null,
        nip: doc.data?.nip || null,
        regon: doc.data?.regon || null,
        przedstawiciel_imie_nazwisko:
          doc.data?.przedstawiciel_imie_nazwisko || null,
        przedstawiciel_stanowisko: doc.data?.przedstawiciel_stanowisko || null,
        imie_nazwisko_pracownika: doc.data?.imie_nazwisko_pracownika || null,
        adres_pracownika: doc.data?.adres_pracownika || null,
        pesel_pracownika: doc.data?.pesel_pracownika || null,
        stanowisko: doc.data?.stanowisko || null,
        wymiar_pracy: doc.data?.wymiar_pracy || null,
        miejsce_pracy: doc.data?.miejsce_pracy || null,
        wynagrodzenie: doc.data?.wynagrodzenie || null,
        termin_platnosci: doc.data?.termin_platnosci || null,
        czas_trwania_umowy: doc.data?.czas_trwania_umowy || null,
        data_rozpoczecia: doc.data?.data_rozpoczecia || null,
        data: doc.data?.data || null,
        miejsce_zawarcia: doc.data?.miejsce_zawarcia || null,
        numer_faktury: doc.data?.numer_faktury || null,
        data_sprzedazy: doc.data?.data_sprzedazy || null,
        sposob_platnosci: doc.data?.sposob_platnosci || null,
        telefon_wystawcy: doc.data?.telefon_wystawcy || null,
        email_wystawcy: doc.data?.email_wystawcy || null,
        telefon_klienta: doc.data?.telefon_klienta || null,
        email_klienta: doc.data?.email_klienta || null,
        wystawiajacy: doc.data?.wystawiajacy || null,
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

      // Parsowanie obowiazki z JSON
      let parsedObowiazki = existingDoc.data?.obowiazki || [];
      if (formData.obowiazki) {
        try {
          parsedObowiazki = JSON.parse(formData.obowiazki);
          if (!Array.isArray(parsedObowiazki)) {
            parsedObowiazki = [];
          }
        } catch (e) {
          console.error("Error parsing obowiazki:", e);
          parsedObowiazki = [];
        }
      }

      // Parsowanie oferty z JSON
      let parsedOferty = existingDoc.data?.oferty || [];
      if (formData.oferty) {
        try {
          parsedOferty = JSON.parse(formData.oferty);
          if (!Array.isArray(parsedOferty)) {
            parsedOferty = [];
          }
        } catch (e) {
          console.error("Error parsing oferty:", e);
          parsedOferty = [];
        }
      }

      console.log("Received data for update:", {
        products: parsedProducts,
        obowiazki: parsedObowiazki,
        oferty: parsedOferty,
      });

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
        const fileName = `${existingDoc.type
          .toLowerCase()
          .replace(" ", "_")}_${Date.now()}.pdf`;
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
          obowiazki: parsedObowiazki,
          oferty: parsedOferty,
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
          nazwa_firmy:
            formData.nazwa_firmy || existingDoc.data?.nazwa_firmy || null,
          adres_firmy:
            formData.adres_firmy || existingDoc.data?.adres_firmy || null,
          nip: formData.nip || null,
          regon: formData.regon || existingDoc.data?.regon || null,
          przedstawiciel_imie_nazwisko:
            formData.przedstawiciel_imie_nazwisko ||
            existingDoc.data?.przedstawiciel_imie_nazwisko ||
            null,
          przedstawiciel_stanowisko:
            formData.przedstawiciel_stanowisko ||
            existingDoc.data?.przedstawiciel_stanowisko ||
            null,
          imie_nazwisko_pracownika:
            formData.imie_nazwisko_pracownika ||
            existingDoc.data?.imie_nazwisko_pracownika ||
            null,
          adres_pracownika:
            formData.adres_pracownika ||
            existingDoc.data?.adres_pracownika ||
            null,
          pesel_pracownika:
            formData.pesel_pracownika ||
            existingDoc.data?.pesel_pracownika ||
            null,
          stanowisko:
            formData.stanowisko || existingDoc.data?.stanowisko || null,
          wymiar_pracy:
            formData.wymiar_pracy || existingDoc.data?.wymiar_pracy || null,
          miejsce_pracy:
            formData.miejsce_pracy || existingDoc.data?.miejsce_pracy || null,
          wynagrodzenie:
            formData.wynagrodzenie || existingDoc.data?.wynagrodzenie || null,
          termin_platnosci:
            formData.termin_platnosci ||
            existingDoc.data?.termin_platnosci ||
            null,
          czas_trwania_umowy:
            formData.czas_trwania_umowy ||
            existingDoc.data?.czas_trwania_umowy ||
            null,
          data_rozpoczecia:
            formData.data_rozpoczecia ||
            existingDoc.data?.data_rozpoczecia ||
            null,
          data: formData.data || existingDoc.data?.data || null,
          miejsce_zawarcia:
            formData.miejsce_zawarcia ||
            existingDoc.data?.miejsce_zawarcia ||
            null,
          numer_faktury:
            formData.numer_faktury || existingDoc.data?.numer_faktury || null,
          data_sprzedazy:
            formData.data_sprzedazy || existingDoc.data?.data_sprzedazy || null,
          sposob_platnosci:
            formData.sposob_platnosci ||
            existingDoc.data?.sposob_platnosci ||
            null,
          telefon_wystawcy:
            formData.telefon_wystawcy ||
            existingDoc.data?.telefon_wystawcy ||
            null,
          email_wystawcy:
            formData.email_wystawcy || existingDoc.data?.email_wystawcy || null,
          telefon_klienta:
            formData.telefon_klienta ||
            existingDoc.data?.telefon_klienta ||
            null,
          email_klienta:
            formData.email_klienta || existingDoc.data?.email_klienta || null,
          wystawiajacy:
            formData.wystawiajacy || existingDoc.data?.wystawiajacy || null,
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

      console.log("Updated document data:", updatedDoc.data);

      res.status(200).json({
        document: {
          ...updatedDoc,
          url: filePath,
          products: updatedDoc.data?.products || [],
          obowiazki: updatedDoc.data?.obowiazki || [],
          oferty: updatedDoc.data?.oferty || [],
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
          nazwa_firmy: updatedDoc.data?.nazwa_firmy || null,
          adres_firmy: updatedDoc.data?.adres_firmy || null,
          nip: updatedDoc.data?.nip || null,
          regon: updatedDoc.data?.regon || null,
          przedstawiciel_imie_nazwisko:
            updatedDoc.data?.przedstawiciel_imie_nazwisko || null,
          przedstawiciel_stanowisko:
            updatedDoc.data?.przedstawiciel_stanowisko || null,
          imie_nazwisko_pracownika:
            updatedDoc.data?.imie_nazwisko_pracownika || null,
          adres_pracownika: updatedDoc.data?.adres_pracownika || null,
          pesel_pracownika: updatedDoc.data?.pesel_pracownika || null,
          stanowisko: updatedDoc.data?.stanowisko || null,
          wymiar_pracy: updatedDoc.data?.wymiar_pracy || null,
          miejsce_pracy: updatedDoc.data?.miejsce_pracy || null,
          wynagrodzenie: updatedDoc.data?.wynagrodzenie || null,
          termin_platnosci: updatedDoc.data?.termin_platnosci || null,
          czas_trwania_umowy: updatedDoc.data?.czas_trwania_umowy || null,
          data_rozpoczecia: updatedDoc.data?.data_rozpoczecia || null,
          data: updatedDoc.data?.data || null,
          miejsce_zawarcia: updatedDoc.data?.miejsce_zawarcia || null,
          numer_faktury: updatedDoc.data?.numer_faktury || null,
          data_sprzedazy: updatedDoc.data?.data_sprzedazy || null,
          sposob_platnosci: updatedDoc.data?.sposob_platnosci || null,
          telefon_wystawcy: updatedDoc.data?.telefon_wystawcy || null,
          email_wystawcy: updatedDoc.data?.email_wystawcy || null,
          telefon_klienta: updatedDoc.data?.telefon_klienta || null,
          email_klienta: updatedDoc.data?.email_klienta || null,
          wystawiajacy: updatedDoc.data?.wystawiajacy || null,
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
