const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const app = express();
const testRoute = require('./routes/test');

// load .env
dotenv.config();

// Middleware
app.use(cors()); //  CORS
app.use(express.json()); // parse JSON

app.use('/test', testRoute);


app.get('/', (req, res) => {
  res.json({ message: 'Witaj w backendzie ABPM!' });
});

// run server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Serwer działa na porcie ${PORT}`);
});