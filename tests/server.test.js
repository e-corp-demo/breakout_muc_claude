'use strict';

const request  = require('supertest');
const path     = require('node:path');
const fs       = require('node:fs');
const multer   = require('multer');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Minimal valid JPEG bytes
const JPEG_BUF = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
                               0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
                               0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9]);

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeMockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

// ── Server module with uploads dir already present ────────────────────────────
describe('server (uploads dir exists)', () => {
  let app, errorHandler;

  beforeAll(() => {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    ({ errorHandler } = require('../server'));
    app = require('../server');
  });

  afterAll(() => {
    // Remove test-generated uploads
    if (fs.existsSync(UPLOADS_DIR)) {
      fs.readdirSync(UPLOADS_DIR)
        .filter(f => f.startsWith('bg_'))
        .forEach(f => {
          try { fs.unlinkSync(path.join(UPLOADS_DIR, f)); } catch { /* ignore */ }
        });
    }
  });

  // ── Static serving ──────────────────────────────────────────────────────
  describe('GET /', () => {
    test('serves index.html with game canvas', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.text).toContain('game-canvas');
    });
  });

  // ── Upload endpoint ─────────────────────────────────────────────────────
  describe('POST /api/upload-bg', () => {
    test('returns 400 when no file provided', async () => {
      const res = await request(app).post('/api/upload-bg');
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    test('accepts image/jpeg and returns URL matching pattern', async () => {
      const res = await request(app)
        .post('/api/upload-bg')
        .attach('background', JPEG_BUF, { filename: 'test.jpg', contentType: 'image/jpeg' });
      expect(res.status).toBe(200);
      expect(res.body.url).toMatch(/^\/uploads\/bg_[0-9a-f]{32}\.jpg$/);
    });

    test('accepts image/png', async () => {
      const pngBuf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const res = await request(app)
        .post('/api/upload-bg')
        .attach('background', pngBuf, { filename: 'test.png', contentType: 'image/png' });
      expect(res.status).toBe(200);
    });

    test('accepts image/webp', async () => {
      const res = await request(app)
        .post('/api/upload-bg')
        .attach('background', JPEG_BUF, { filename: 'test.webp', contentType: 'image/webp' });
      expect(res.status).toBe(200);
    });

    test('accepts image/gif', async () => {
      const gifBuf = Buffer.from('GIF87a\x01\x00\x01\x00\x00\x00\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x00;', 'binary');
      const res = await request(app)
        .post('/api/upload-bg')
        .attach('background', gifBuf, { filename: 'test.gif', contentType: 'image/gif' });
      expect(res.status).toBe(200);
    });

    test('uses .bin extension when filename has no extension', async () => {
      const res = await request(app)
        .post('/api/upload-bg')
        .attach('background', JPEG_BUF, { filename: 'noext', contentType: 'image/jpeg' });
      expect(res.status).toBe(200);
      expect(res.body.url).toMatch(/\.bin$/);
    });

    test('rejects non-image MIME type with 400', async () => {
      const res = await request(app)
        .post('/api/upload-bg')
        .attach('background', Buffer.from('data'), { filename: 'x.js', contentType: 'application/javascript' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('images are allowed');
    });

    test('rejects file exceeding 5 MB with 400', async () => {
      const bigBuf = Buffer.alloc(6 * 1024 * 1024, 0xFF);
      const res = await request(app)
        .post('/api/upload-bg')
        .attach('background', bigBuf, { filename: 'big.jpg', contentType: 'image/jpeg' });
      expect(res.status).toBe(400);
    });
  });

  // ── Error handler direct unit tests ─────────────────────────────────────
  describe('errorHandler', () => {
    test('returns 400 for LIMIT_FILE_SIZE', () => {
      const err = Object.assign(new Error('File too large'), { code: 'LIMIT_FILE_SIZE' });
      const res = makeMockRes();
      errorHandler(err, {}, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'File too large' });
    });

    test('returns 400 for INVALID_MIME', () => {
      const err = Object.assign(new Error('Bad mime'), { code: 'INVALID_MIME' });
      const res = makeMockRes();
      errorHandler(err, {}, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('returns 400 for MulterError instance', () => {
      const err = new multer.MulterError('LIMIT_UNEXPECTED_FILE');
      const res = makeMockRes();
      errorHandler(err, {}, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('returns 500 for generic unrecognised errors', () => {
      const res = makeMockRes();
      errorHandler(new Error('something else'), {}, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });
});

// ── Server module with uploads dir absent (creation branch) ───────────────────
describe('server (uploads dir absent)', () => {
  const tempDir = UPLOADS_DIR + '_tmp_test';

  beforeAll(() => {
    if (fs.existsSync(UPLOADS_DIR)) fs.renameSync(UPLOADS_DIR, tempDir);
    jest.resetModules();
    require('../server');
  });

  afterAll(() => {
    if (fs.existsSync(UPLOADS_DIR)) fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
    if (fs.existsSync(tempDir)) fs.renameSync(tempDir, UPLOADS_DIR);
    jest.resetModules();
  });

  test('creates uploads directory when it does not exist', () => {
    expect(fs.existsSync(UPLOADS_DIR)).toBe(true);
  });
});
