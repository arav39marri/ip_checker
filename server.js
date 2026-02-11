// server.js
// Minimal Express server that returns client IP + geo info
const express = require('express');
const path = require('path');
const { buildMetrics } = require('./lib/metrics');

const app = express();

// Trust proxy if you're behind a reverse proxy / load balancer or CDN
// WARNING: enable only when you actually are behind trusted proxies.
app.set('trust proxy', true);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/metrics', async (req, res) => {
  try {
    const metrics = await buildMetrics(req);
    res.json(metrics);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index..html'));
});

const PORT = process.env.PORT || 5500;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
