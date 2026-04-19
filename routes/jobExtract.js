// routes/jobExtract.js
const express = require('express');
const router = express.Router();
const { scrapeLinkedInJob } = require('../linkedinScraper');

function isValidLinkedInUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.includes('linkedin.com') &&
      (parsed.pathname.includes('/jobs/view/') || parsed.pathname.includes('/jobs/collections/'))
    );
  } catch (_) {
    return false;
  }
}

// POST /api/job/extract
router.post('/extract', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid URL.' });
  }

  const cleanUrl = url.trim();

  if (!isValidLinkedInUrl(cleanUrl)) {
    return res.status(400).json({ error: 'URL must be a valid LinkedIn job listing.' });
  }

  try {
    const jobData = await scrapeLinkedInJob(cleanUrl);
    return res.status(200).json(jobData);
  } catch (err) {
    console.error('[JobExtract] Scrape failed:', err.message);
    return res.status(502).json({
      error: 'Failed to extract job description. LinkedIn may have blocked the request.',
      detail: err.message,
    });
  }
});

module.exports = router;
