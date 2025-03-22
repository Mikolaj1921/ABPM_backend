// Importowanie zależności
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Ładowanie zmiennych środowiskowych z pliku .env
dotenv.config();

// Inicjalizacja aplikacji Express
const app = express();

// Middleware
app.use(cors()); // Umożliwia CORS
app.use(express.json()); // Parsuje JSON w żądaniach

// Podstawowa trasa (endpoint)
app.get('/', (req, res) => {
  res.json({ message: 'Witaj w backendzie ABPM!' });
});

// Uruchomienie serwera
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Serwer działa na porcie ${PORT}`);
});