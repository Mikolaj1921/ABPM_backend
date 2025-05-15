const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");

// Konfiguracja Supabase
const supabase = createClient(
  process.env.SUPABASE_API_URL,
  process.env.SUPABASE_ANON_KEY
);

// GET /api/templates/:id/content
router.get("/:id/content", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("templates")
      .select("content")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Supabase error (GET /templates/:id/content):", error);
      throw error;
    }

    if (!data) {
      return res.status(404).json({ error: `Szablon o ID ${id} nie istnieje` });
    }

    res.json({ content: data.content });
  } catch (error) {
    console.error("Błąd podczas pobierania treści szablonu:", error);
    res.status(500).json({
      error: "Błąd podczas pobierania treści szablonu",
      details: error.message,
    });
  }
});

// POST /api/templates
router.post("/", async (req, res) => {
  try {
    const { name, category, content } = req.body;

    if (!name || !category || !content) {
      return res
        .status(400)
        .json({ error: "Brak wymaganych pól: name, category, content" });
    }

    const { data, error } = await supabase
      .from("templates")
      .insert([{ name, category, content }])
      .select()
      .single();

    if (error) {
      console.error("Supabase error (POST /templates):", error);
      throw error;
    }

    res.status(201).json(data);
  } catch (error) {
    console.error("Błąd podczas zapisywania szablonu:", error);
    res.status(500).json({
      error: "Błąd podczas zapisywania szablonu",
      details: error.message,
    });
  }
});

// GET /api/templates
router.get("/", async (req, res) => {
  try {
    const { category } = req.query;

    let query = supabase.from("templates").select("*");

    if (category) {
      query = query.eq("category", category);
    }

    const { data, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) {
      console.error("Supabase error (GET /templates):", error);
      throw error;
    }

    res.json(data);
  } catch (error) {
    console.error("Błąd podczas pobierania szablonów:", error);
    res.status(500).json({
      error: "Błąd podczas pobierania szablonów",
      details: error.message,
    });
  }
});

// NEW: GET /api/templates/:id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Supabase error (GET /templates/:id):", error);
      throw error;
    }

    if (!data) {
      return res.status(404).json({ error: `Szablon o ID ${id} nie istnieje` });
    }

    res.json(data);
  } catch (error) {
    console.error("Błąd podczas pobierania szablonu:", error);
    res.status(500).json({
      error: "Błąd podczas pobierania szablonu",
      details: error.message,
    });
  }
});

module.exports = router;
