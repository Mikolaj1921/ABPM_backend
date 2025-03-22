const express = require('express');
const pool = require('../db');
const router = express.Router();

//method get from data db
router.get('/dataget', async (req, res) => {
  try {
    const result = await pool.query('SELECT text FROM test');
    res.json(result.rows);
  } catch (err) {
    console.error(err.stack);
    res.status(500).json({ error: 'Error DB' });
  }
});


module.exports = router;