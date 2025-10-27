const express = require('express');
const router = express.Router();

// Health check route
router.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'OCI Creator bot is running.' });
});

// You could add more routes here later
// router.get('/status', (req, res) => { ... });

module.exports = router;