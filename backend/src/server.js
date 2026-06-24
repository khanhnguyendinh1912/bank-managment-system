// server.js — Express app: JSON API + static frontend
'use strict';
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const { pool } = require('./db');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

// Request log (lightweight)
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// API
app.use('/api', routes);

// Health check
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (e) {
    res.status(500).json({ status: 'error', db: e.message });
  }
});

// Serve the static frontend folder
const frontendDir = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(frontendDir));
app.get('/', (_req, res) => res.sendFile(path.join(frontendDir, 'index.html')));

app.listen(PORT, () => {
  console.log(`Bank Management System chạy tại http://localhost:${PORT}`);
});
