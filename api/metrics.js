const { buildMetrics } = require('../lib/metrics');

module.exports = async (req, res) => {
  try {
    const metrics = await buildMetrics(req);
    res.status(200).json(metrics);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
