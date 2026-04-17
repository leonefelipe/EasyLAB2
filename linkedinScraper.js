// linkedinScraper.js
const { chromium } = require('playwright');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');

const LINKEDIN_SELECTORS = {
  title: [
    'h1.top-card-layout__title',
    'h1.job-details-jobs-unified-top-card__job-title',
    '.jobs-unified-top-card__job-title h1',
    'h1[data-test-id="job-title"]',
    '.job-title',
    'h1',
  ],
  company: [
    'a.topcard__org-name-link',
    '.job-details-jobs-unified-top-card__company-name a',
    '.jobs-unified-top-card__company-name a',
    '[data-test-id="job-poster-name"]',
    '.topcard__flavor a',
  ],
  location: [
    '.topcard__flavor--bullet',
    '.job-details-jobs-unified-top-card__bullet',
    '.jobs-unified-top-card__bullet',
    '[data-test-id="job-location"]',
  ],
  description: [
    '.jobs-description__content .jobs-box__html-content',
    '.jobs-description-content__text',
    '#job-details',
    '.description__text',
    '.jobs-description',
    '[data-test-id="job-description"]',
  ],
};

async function extractText(page, selectors) {
  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        const text = await el.innerText();
        if (text && text.trim().length > 0) return text.trim();
      }
    } catch (_) {}
  }
  return null;
}

function parseDescriptionSections(rawText) {
  if (!rawText) return { description: '', responsibilities: [], requirements: [] };

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  const responsibilityKeywords = /responsibilit|you will|what you.ll do|duties|your role|key tasks/i;
  const requirementKeywords = /requirement|qualif|what we.re looking|you (have|bring|possess)|must have|skills needed|experience (required|needed)/i;

  let description = [];
  let responsibilities = [];
  let requirements = [];
  let currentSection = 'description';

  for (const line of lines) {
    if (responsibilityKeywords.test(line) && line.length < 80) {
      currentSection = 'responsibilities';
      continue;
    }
    if (requirementKeywords.test(line) && line.length < 80) {
      currentSection = 'requirements';
      continue;
    }

    const isBullet = /^[-•·*▪◦‣⁃]/.test(line);

    if (currentSection === 'description') {
      description.push(line);
    } else if (currentSection === 'responsibilities') {
      if (isBullet || line.length < 200) responsibilities.push(line.replace(/^[-•·*▪◦‣⁃]\s*/, ''));
    } else if (currentSection === 'requirements') {
      if (isBullet || line.length < 200) requirements.push(line.replace(/^[-•·*▪◦‣⁃]\s*/, ''));
    }
  }

  return {
    description: description.join(' ').slice(0, 1500),
    responsibilities,
    requirements,
  };
}

async function fallbackReadability(page) {
  const html = await page.content();
  const dom = new JSDOM(html, { url: page.url() });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  return article ? article.textContent : null;
}

async function scrapeLinkedInJob(url) {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
      ],
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
    });

    const page = await context.newPage();

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Dismiss login modal if it appears
    try {
      await page.waitForSelector('.modal__dismiss, [data-tracking-control-name="guest_homepage-basic_guest_nav_menu_login"]', { timeout: 3000 });
      await page.click('.modal__dismiss').catch(() => {});
    } catch (_) {}

    // Expand "See more" if available
    try {
      await page.click('button.show-more-less-html__button--more').catch(() => {});
      await page.waitForTimeout(800);
    } catch (_) {}

    await page.waitForTimeout(1500);

    const title = await extractText(page, LINKEDIN_SELECTORS.title);
    const company = await extractText(page, LINKEDIN_SELECTORS.company);
    const location = await extractText(page, LINKEDIN_SELECTORS.location);
    const rawDescription = await extractText(page, LINKEDIN_SELECTORS.description);

    let parsed;

    if (rawDescription && rawDescription.length > 100) {
      parsed = parseDescriptionSections(rawDescription);
    } else {
      // Fallback: readability extraction
      const fallbackText = await fallbackReadability(page);
      if (!fallbackText) throw new Error('Could not extract job description from page.');
      parsed = parseDescriptionSections(fallbackText);
    }

    return {
      title: title || 'Unknown Title',
      company: company || 'Unknown Company',
      location: location || 'Unknown Location',
      description: parsed.description,
      responsibilities: parsed.responsibilities,
      requirements: parsed.requirements,
    };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scrapeLinkedInJob };
