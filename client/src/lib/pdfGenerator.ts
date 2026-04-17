// pdfGenerator.js
const puppeteer = require('puppeteer');

/**
 * Renders a resume object into a clean, ATS-friendly PDF buffer.
 * No watermarks. No branding. Professional layout.
 *
 * @param {Object} resume
 * @param {string} resume.name
 * @param {string} resume.email
 * @param {string} resume.phone
 * @param {string} resume.location
 * @param {string} resume.linkedin
 * @param {string} resume.github
 * @param {string} resume.summary
 * @param {Array}  resume.experience  [{ title, company, location, startDate, endDate, bullets[] }]
 * @param {Array}  resume.education   [{ degree, institution, location, graduation }]
 * @param {Array}  resume.skills      [{ category, items[] }]
 * @param {Array}  resume.projects    [{ name, description, technologies, bullets[] }]
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateResumePDF(resume) {
  const html = buildResumeHTML(resume);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('print');

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: false,
      displayHeaderFooter: false,   // ← kills any header/footer watermarks
      margin: { top: '0.65in', bottom: '0.65in', left: '0.7in', right: '0.7in' },
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

function esc(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildContactLine(resume) {
  const parts = [];
  if (resume.email)    parts.push(`<a href="mailto:${esc(resume.email)}">${esc(resume.email)}</a>`);
  if (resume.phone)    parts.push(esc(resume.phone));
  if (resume.location) parts.push(esc(resume.location));
  if (resume.linkedin) parts.push(`<a href="${esc(resume.linkedin)}">LinkedIn</a>`);
  if (resume.github)   parts.push(`<a href="${esc(resume.github)}">GitHub</a>`);
  return parts.join(' &nbsp;|&nbsp; ');
}

function sectionHeader(title) {
  return `
    <div class="section-header">
      <span class="section-title">${esc(title)}</span>
      <div class="section-rule"></div>
    </div>`;
}

function buildExperience(experience = []) {
  if (!experience.length) return '';
  const items = experience.map(job => `
    <div class="entry">
      <div class="entry-header">
        <span class="entry-title">${esc(job.title)}</span>
        <span class="entry-date">${esc(job.startDate)} – ${esc(job.endDate || 'Present')}</span>
      </div>
      <div class="entry-sub">
        <span class="entry-org">${esc(job.company)}</span>
        ${job.location ? `<span class="entry-location">${esc(job.location)}</span>` : ''}
      </div>
      ${job.bullets && job.bullets.length ? `
        <ul class="bullets">
          ${job.bullets.map(b => `<li>${esc(b)}</li>`).join('')}
        </ul>` : ''}
    </div>`).join('');
  return sectionHeader('Experience') + items;
}

function buildEducation(education = []) {
  if (!education.length) return '';
  const items = education.map(edu => `
    <div class="entry">
      <div class="entry-header">
        <span class="entry-title">${esc(edu.degree)}</span>
        <span class="entry-date">${esc(edu.graduation)}</span>
      </div>
      <div class="entry-sub">
        <span class="entry-org">${esc(edu.institution)}</span>
        ${edu.location ? `<span class="entry-location">${esc(edu.location)}</span>` : ''}
      </div>
    </div>`).join('');
  return sectionHeader('Education') + items;
}

function buildSkills(skills = []) {
  if (!skills.length) return '';
  const rows = skills.map(s => `
    <div class="skill-row">
      <span class="skill-cat">${esc(s.category)}:</span>
      <span class="skill-items">${esc(s.items.join(', '))}</span>
    </div>`).join('');
  return sectionHeader('Skills') + rows;
}

function buildProjects(projects = []) {
  if (!projects.length) return '';
  const items = projects.map(p => `
    <div class="entry">
      <div class="entry-header">
        <span class="entry-title">${esc(p.name)}</span>
        ${p.technologies ? `<span class="entry-date">${esc(p.technologies)}</span>` : ''}
      </div>
      ${p.description ? `<div class="entry-desc">${esc(p.description)}</div>` : ''}
      ${p.bullets && p.bullets.length ? `
        <ul class="bullets">
          ${p.bullets.map(b => `<li>${esc(b)}</li>`).join('')}
        </ul>` : ''}
    </div>`).join('');
  return sectionHeader('Projects') + items;
}

function buildResumeHTML(resume) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(resume.name)} — Resume</title>
<style>
  /* ─── Reset ─── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* ─── Base ─── */
  html, body {
    font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif;
    font-size: 10.5pt;
    line-height: 1.45;
    color: #1a1a1a;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
  }

  a { color: inherit; text-decoration: none; }

  /* ─── Page wrapper ─── */
  .page {
    width: 100%;
    max-width: 100%;
    padding: 0;          /* margins controlled by Puppeteer */
  }

  /* ─── Header ─── */
  .resume-header {
    text-align: center;
    margin-bottom: 10pt;
  }
  .resume-name {
    font-size: 20pt;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: #0d0d0d;
    margin-bottom: 3pt;
  }
  .resume-contact {
    font-size: 9pt;
    color: #444;
    line-height: 1.6;
  }

  /* ─── Section headers ─── */
  .section-header {
    display: flex;
    align-items: center;
    gap: 6pt;
    margin: 11pt 0 5pt;
  }
  .section-title {
    font-size: 11pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    white-space: nowrap;
    color: #0d0d0d;
  }
  .section-rule {
    flex: 1;
    height: 1.2pt;
    background: #0d0d0d;
  }

  /* ─── Entries ─── */
  .entry { margin-bottom: 7pt; }
  .entry-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .entry-title  { font-weight: 700; font-size: 10.5pt; }
  .entry-date   { font-size: 9.5pt; color: #444; white-space: nowrap; margin-left: 8pt; }
  .entry-sub    { display: flex; gap: 10pt; font-size: 9.5pt; color: #444; margin-top: 1pt; }
  .entry-org    { font-style: italic; }
  .entry-location::before { content: '·  '; }
  .entry-desc   { font-size: 9.5pt; margin-top: 2pt; color: #333; }

  /* ─── Bullets ─── */
  .bullets {
    margin: 3pt 0 0 13pt;
    padding: 0;
    list-style: disc;
  }
  .bullets li {
    font-size: 10pt;
    margin-bottom: 2pt;
    color: #1a1a1a;
  }

  /* ─── Summary ─── */
  .summary-text {
    font-size: 10pt;
    color: #333;
    line-height: 1.5;
  }

  /* ─── Skills ─── */
  .skill-row { display: flex; gap: 4pt; margin-bottom: 3pt; font-size: 10pt; }
  .skill-cat  { font-weight: 700; white-space: nowrap; }
  .skill-items { color: #333; }

  /* ─── Print safety ─── */
  @media print {
    body { margin: 0; }
    .entry { page-break-inside: avoid; }
    .section-header { page-break-after: avoid; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="resume-header">
    <div class="resume-name">${esc(resume.name)}</div>
    <div class="resume-contact">${buildContactLine(resume)}</div>
  </div>

  <!-- Summary -->
  ${resume.summary ? `
  ${sectionHeader('Summary')}
  <div class="summary-text">${esc(resume.summary)}</div>` : ''}

  <!-- Experience -->
  ${buildExperience(resume.experience)}

  <!-- Education -->
  ${buildEducation(resume.education)}

  <!-- Skills -->
  ${buildSkills(resume.skills)}

  <!-- Projects -->
  ${buildProjects(resume.projects)}

</div>
</body>
</html>`;
}

module.exports = { generateResumePDF };
