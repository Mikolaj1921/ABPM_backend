const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");

// Konfiguracja klienta Supabase
const supabaseUrl = process.env.SUPABASE_URL; // Zastąp swoim URL-em Supabase
const supabaseKey = process.env.SUPABASE_ANON_KEY; // Zastąp swoim kluczem API (anon key)
const supabase = createClient(supabaseUrl, supabaseKey);

// Endpoint do zapisywania szablonów (POST /api/templates)
router.post("/", async (req, res) => {
  const { name, category, content, created_by } = req.body;
  try {
    const { data, error } = await supabase
      .from("templates")
      .insert([{ name, category, content, created_by }])
      .select();

    if (error) {
      throw error;
    }

    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({
      error: "Błąd podczas zapisywania szablonu",
      details: error.message,
    });
  }
});

router.get("/", async (req, res) => {
  const { category } = req.query;
  try {
    let query = supabase.from("templates").select("*");

    if (category) {
      query = query.eq("category", category); // UWAGA: przypisujemy z powrotem
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: "Błąd podczas pobierania szablonów",
      details: error.message,
    });
  }
});

module.exports = router;
