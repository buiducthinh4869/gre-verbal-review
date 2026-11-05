#!/usr/bin/env node
/**
 * deploy-api.js: clasp push → clasp deploy -i <ID cố định trong .deployment-id> (URL API không đổi).
 * Chưa có .deployment-id (lần đầu): tạo deployment mới và ghi ID vào file.
 *   npm run deploy-api -- "ghi chú phiên bản"
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ID_FILE = path.join(ROOT, '.deployment-id');
const WIN = process.platform === 'win32';
const CLASP = WIN ? 'clasp.cmd' : 'clasp';

function clasp(args, capture) {
  console.log('$ clasp ' + args.join(' '));
  const opts = { cwd: ROOT, encoding: 'utf8', stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit' };
  // clasp.cmd cần shell trên Windows; ghép thành một chuỗi lệnh để tránh cảnh báo DEP0190
  const r = WIN ? spawnSync([CLASP].concat(args).join(' '), Object.assign({ shell: true }, opts)) : spawnSync(CLASP, args, opts);
  if (capture) { process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || ''); }
  if (r.status !== 0) { console.error('✗ Lệnh thất bại: clasp ' + args.join(' ')); process.exit(r.status || 1); }
  return r;
}

if (!fs.existsSync(path.join(ROOT, 'apps-script', 'AdminKey.js'))) {
  console.log('Lưu ý: chưa có apps-script/AdminKey.js, lệnh quản trị dòng lệnh (scripts/admin-cli.js) sẽ bị tắt trên API.');
}

const stamp = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
const note = ((process.argv[2] || 'API').replace(/"/g, "'") + ` (${stamp} giờ VN)`);

clasp(['push', '-f']);
let id = fs.existsSync(ID_FILE) ? fs.readFileSync(ID_FILE, 'utf8').trim() : '';
if (id) {
  clasp(['deploy', '-i', id, '-d', `"${note}"`]);
} else {
  const r = clasp(['deploy', '-d', `"${note}"`], true);
  const m = `${r.stdout}\n${r.stderr}`.match(/(AKfy[\w-]{20,})/);
  if (!m) { console.error('✗ Không đọc được deployment ID. Ghi ID vào .deployment-id bằng tay.'); process.exit(1); }
  id = m[1];
  fs.writeFileSync(ID_FILE, id + '\n');
  console.log('✓ Đã lưu deployment ID mới vào .deployment-id');
}
console.log(`\n✓ API đã triển khai. URL (không đổi giữa các lần triển khai):\n  https://script.google.com/macros/s/${id}/exec\n`);
