const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db/pool');

const router = Router();

// Store uploads in data/resumes/ (persisted on Railway volume)
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'data', 'resumes');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

// GET /api/resumes — list all variants for the user
router.get('/', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT id, slug, label, file_url, filename, is_default, created_at
     FROM resume_variants WHERE user_id = $1 ORDER BY created_at`,
    [req.user.id]
  );
  res.json(rows);
});

// POST /api/resumes/:slug/upload — upload PDF for a variant
router.post('/:slug/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { slug } = req.params;

  // Verify the variant exists and belongs to user
  const { rows } = await query(
    `SELECT id FROM resume_variants WHERE user_id = $1 AND slug = $2`,
    [req.user.id, slug]
  );
  if (!rows.length) return res.status(404).json({ error: 'Resume variant not found' });

  // Parse PDF text
  let parsedText = '';
  try {
    const pdfData = await pdfParse(req.file.buffer);
    parsedText = pdfData.text.replace(/\s+/g, ' ').trim();
  } catch (e) {
    console.error('[resume] PDF parse error:', e.message);
    return res.status(400).json({ error: 'Could not parse PDF. Make sure it contains text (not scanned images).' });
  }

  if (!parsedText || parsedText.length < 50) {
    return res.status(400).json({ error: 'PDF appears to be empty or image-only. Upload a text-based PDF.' });
  }

  // Save file to disk
  const filename = `${req.user.id}_${slug}_${Date.now()}.pdf`;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, req.file.buffer);

  // Update DB
  const { rows: updated } = await query(
    `UPDATE resume_variants
     SET file_url = $1, filename = $2, parsed_text = $3
     WHERE user_id = $4 AND slug = $5
     RETURNING id, slug, label, file_url, filename, is_default, created_at`,
    [`/data/resumes/${filename}`, req.file.originalname, parsedText, req.user.id, slug]
  );

  res.json(updated[0]);
});

// DELETE /api/resumes/:slug/file — remove uploaded file from a variant
router.delete('/:slug/file', requireAuth, async (req, res) => {
  const { slug } = req.params;
  const { rows } = await query(
    `SELECT id, file_url FROM resume_variants WHERE user_id = $1 AND slug = $2`,
    [req.user.id, slug]
  );
  if (!rows.length) return res.status(404).json({ error: 'Resume variant not found' });

  // Delete physical file if it exists
  if (rows[0].file_url) {
    const filePath = path.join(__dirname, '..', '..', rows[0].file_url);
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
  }

  // Clear DB fields
  await query(
    `UPDATE resume_variants SET file_url = '', filename = '', parsed_text = '' WHERE id = $1`,
    [rows[0].id]
  );

  res.json({ ok: true });
});

// PATCH /api/resumes/:slug/default — set a variant as default
router.patch('/:slug/default', requireAuth, async (req, res) => {
  const { slug } = req.params;

  // Unset all defaults for this user
  await query(`UPDATE resume_variants SET is_default = false WHERE user_id = $1`, [req.user.id]);

  // Set the specified variant as default
  const { rows } = await query(
    `UPDATE resume_variants SET is_default = true WHERE user_id = $1 AND slug = $2 RETURNING *`,
    [req.user.id, slug]
  );
  if (!rows.length) return res.status(404).json({ error: 'Variant not found' });

  res.json(rows[0]);
});

module.exports = router;
