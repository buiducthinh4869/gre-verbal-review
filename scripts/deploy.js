#!/usr/bin/env node
/**
 * deploy.js: build → clasp push -f → clasp deploy -i <ID cố định>.
 * ID deployment lưu trong .deployment-id nên URL /exec không đổi giữa các lần triển khai.
 * Nếu chưa có .deployment-id (lần đầu), tạo deployment mới và ghi ID vào file.
 *   npm run deploy -- "ghi chú phiên bản"
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ID_FILE = path.join(ROOT, '.deployment-id');
const CLASP = process.platform === 'win32' ? 'clasp.cmd' : 'clasp';

function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const viaShell = process.platform === 'win32' && cmd === CLASP; // clasp.cmd cần shell trên Windows
  const spawnOpts = { cwd: ROOT, encoding: 'utf8', stdio: opts.capture ? ['inherit', 'pipe', 'pipe'] : 'inherit' };
  const r = viaShell
    ? spawnSync([cmd].concat(args).join(' '), Object.assign({ shell: true }, spawnOpts))
    : spawnSync(cmd, args, spawnOpts);
  if (opts.capture) {
    process.stdout.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
  }
  if (r.status !== 0) {
    console.error(`✗ Lệnh thất bại: ${cmd} ${args.join(' ')}`);
    process.exit(r.status || 1);
  }
  return r;
}

const stamp = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
const note = (process.argv[2] || 'Cập nhật').replace(/"/g, "'") + ` (${stamp} giờ VN)`;

run(process.execPath, [path.join(__dirname, 'build.js')]);
run(CLASP, ['push', '-f']);

let id = fs.existsSync(ID_FILE) ? fs.readFileSync(ID_FILE, 'utf8').trim() : '';
if (id) {
  run(CLASP, ['deploy', '-i', id, '-d', `"${note}"`]);
} else {
  const r = run(CLASP, ['deploy', '-d', `"${note}"`], { capture: true });
  const m = `${r.stdout}\n${r.stderr}`.match(/(AKfy[\w-]{20,})/);
  if (!m) {
    console.error('✗ Không đọc được deployment ID từ kết quả clasp deploy. Ghi ID vào .deployment-id bằng tay.');
    process.exit(1);
  }
  id = m[1];
  fs.writeFileSync(ID_FILE, id + '\n');
  console.log(`✓ Đã lưu deployment ID vào .deployment-id`);
}
console.log(`\n✓ Đã triển khai. URL web app (không đổi):\n  https://script.google.com/macros/s/${id}/exec\n`);
