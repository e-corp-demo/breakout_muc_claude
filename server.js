'use strict';

const express = require('express');
const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 3000;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = /^\.[a-z0-9]+$/.test(ext) ? ext : '.bin';
    cb(null, `bg_${crypto.randomBytes(16).toString('hex')}${safeExt}`);
  }
});

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(Object.assign(new Error('Only JPEG, PNG, WebP, or GIF images are allowed'), { code: 'INVALID_MIME' }), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE, files: 1 } });

app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

app.post('/api/upload-bg', upload.single('background'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No valid image file provided' });
  }
  res.json({ url: `/uploads/${req.file.filename}` });
});

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  if (err && (err.code === 'LIMIT_FILE_SIZE' || err.code === 'INVALID_MIME' || err instanceof multer.MulterError)) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Internal server error' });
}
app.use(errorHandler);

/* istanbul ignore next */
if (require.main === module) {
  app.listen(PORT, () => {
    process.stdout.write(`Breakout game running at http://localhost:${PORT}\n`);
  });
}

module.exports = app;
module.exports.errorHandler = errorHandler;
