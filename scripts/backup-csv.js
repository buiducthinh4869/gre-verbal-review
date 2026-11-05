#!/usr/bin/env node
/**
 * backup-csv.js: xuất các tab tiến độ (progress, log, custom_words, settings, và mocks nếu có) ra CSV trong
 * backups/YYYY-MM-DD/ (thư mục gitignore) và in số dòng dữ liệu từng tab. CHỈ ĐỌC Sheet (cli.status, cli.dump).
 *   node scripts/backup-csv.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli } from './admin-cli.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const day = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const dir = path.join(ROOT, 'backups', day);
fs.mkdirSync(dir, { recursive: true });

const csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const status = await cli('status');
const counts = Object.fromEntries(status.tabs.map((t) => [t.name, t.dataRows]));
for (const tab of ['progress', 'log', 'custom_words', 'settings', 'mocks']) {
  if (!(tab in counts)) continue;
  const { values } = await cli('dump', { tab });
  fs.writeFileSync(path.join(dir, tab + '.csv'), '﻿' + values.map((r) => r.map(csvCell).join(',')).join('\n') + '\n');
}
fs.writeFileSync(path.join(dir, 'counts.json'), JSON.stringify({ at: status.now, counts }, null, 2) + '\n');
console.log('Sheet lúc ' + status.now);
Object.entries(counts).forEach(([k, v]) => console.log('  ' + k.padEnd(13) + String(v).padStart(5) + ' dòng'));
console.log('✓ Đã ghi CSV vào ' + path.relative(ROOT, dir));
