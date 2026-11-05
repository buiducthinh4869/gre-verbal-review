#!/usr/bin/env node
/**
 * dev-server.js: chạy thử web trên máy, KHÔNG đụng tới Google Sheet thật.
 *   npm run dev            → http://localhost:8787
 *
 * - Phục vụ các file tĩnh của repo (giống GitHub Pages).
 * - POST /api chạy đúng mã apps-script/*.js trong giả lập Apps Script (tests/gas_mock.cjs),
 *   với một Sheet giả lập trong bộ nhớ, dựng từ dữ liệu mẫu có cấu trúc giống bản cũ rồi chạy migrate.
 * - Tài khoản thử cục bộ: user01 … user10, mật khẩu thử "thu-user01" … (chỉ có ở máy chủ thử này).
 *   user02 … user10 bị khóa như thật; mở bằng user01 ở trang Quản lý.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { makeEnv, loadServer, Sheet } = require(path.join(ROOT, 'tests', 'gas_mock.cjs'));
const PORT = Number(process.env.PORT || 8787);

// Dữ liệu mẫu (cấu trúc giống Sheet bản cũ: chưa có userId)
const SAMPLE = {
  progress: [
    ['wordId', 'box', 'dueDate', 'lapses', 'correctStreak', 'totalReviews', 'lastResult', 'lastReviewed', 'confusedWith', 'updatedAt', 'lastMoved'],
    ['laud', '1', '2026-11-04', '0', '0', '1', 'hard', '2026-11-03T12:27:16.623Z', '', '2026-11-03T12:27:16.623Z', '2026-11-03'],
    ['extol', '3', '2026-11-04', '1', '1', '4', 'good', '2026-10-28T12:00:00.000Z', 'tout', '2026-10-28T12:00:00.000Z', '2026-10-28'],
    ['lionize', '2', '2026-11-04', '2', '0', '5', 'again', '2026-11-01T12:50:28.362Z', 'venerate', '2026-11-01T12:50:28.362Z', '2026-11-01'],
    ['tout', '4', '2026-11-20', '0', '3', '6', 'good', '2026-11-01T12:00:00.000Z', '', '2026-11-01T12:00:00.000Z', '2026-11-01'],
  ],
  log: [['timestamp', 'wordId', 'mode', 'result', 'exerciseId', 'chosen', 'device', 'eventId']],
  custom_words: [['id', 'word', 'pos', 'priority', 'meaning', 'nuance', 'example', 'collocations', 'root', 'createdAt', 'updatedAt']],
  settings: [['key', 'value'], ['examMode', 'false'], ['_daily', '{"2026-11-03":{"r":6,"n":4}}']],
};

const env = makeEnv();
Object.entries(SAMPLE).forEach(([name, rows]) => env.store.sheets.push(new Sheet(name, rows.map((r) => r.slice()))));
loadServer(env);
const c = env.ctx;
const report = c.migrate_(env.ss);
c.createAccounts_(env.ss);
const ut = c.table_(env.ss, 'users');
ut.rows.forEach((r, i) => { c.setPasswordRow_(ut, i, 'thu-' + c.cell_(ut, r, 'username'), true); });
c.writeRows_(ut, ut.rows.map((r, i) => i));
console.log('Sheet giả lập: migrate', JSON.stringify(report.after));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const BLOCK = /^\/(apps-script|tests|scripts|backups|node_modules|\.git)(\/|$)|initial-passwords|\.admin-key|\.clasp|\.deployment/;

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api') {
    if (req.method !== 'POST') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(c.doGet().getContent()); return; }
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const out = c.doPost({ postData: { contents: body } }).getContent();
      setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(out); }, 250); // mô phỏng độ trễ mạng
    });
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  if (BLOCK.test(p)) { res.writeHead(404); res.end('Not found'); return; }
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Chạy thử: http://localhost:${PORT}  (tài khoản thử: user01 / thu-user01, ...)`));
