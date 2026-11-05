#!/usr/bin/env node
/**
 * admin-cli.js: lệnh quản trị qua API thật, dùng khóa quản trị (không cần mở Chrome).
 *
 *   node scripts/admin-cli.js init-key          tạo khóa mới: .admin-key (máy này) + apps-script/AdminKey.js (bản băm), cả hai đã gitignore
 *   node scripts/admin-cli.js status            các tab, cột, số dòng (chỉ đọc)
 *   node scripts/admin-cli.js migrate           chuyển dữ liệu cũ sang u01 (chạy lại an toàn)
 *   node scripts/admin-cli.js verify <csv-dir>  so sánh Sheet với bản sao lưu CSV (số dòng, 10 dòng progress ngẫu nhiên)
 *   node scripts/admin-cli.js create-accounts   tạo 10 tài khoản, in mật khẩu ban đầu MỘT lần và ghi initial-passwords.txt
 *   node scripts/admin-cli.js ensure-mocks      tạo tab mocks (thi thử) nếu chưa có; không đụng tab nào khác
 *   node scripts/admin-cli.js ensure-content    tạo 3 tab content_overrides, content_history, suggestions nếu chưa có (ở cuối)
 *   node scripts/admin-cli.js counts            số dòng dữ liệu từng tab (đối chiếu trước / sau khi triển khai)
 *
 * URL API lấy từ .deployment-id. Khóa quản trị không bao giờ được commit.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY_FILE = path.join(ROOT, '.admin-key');
const HASH_FILE = path.join(ROOT, 'apps-script', 'AdminKey.js');

export function apiUrl() {
  const id = fs.readFileSync(path.join(ROOT, '.deployment-id'), 'utf8').trim();
  return `https://script.google.com/macros/s/${id}/exec`;
}

export async function post(body) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(apiUrl(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
      const text = await res.text();
      try { return JSON.parse(text); } catch (e) { throw new Error('Phản hồi không phải JSON (HTTP ' + res.status + '): ' + text.slice(0, 200)); }
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

export async function cli(action, payload) {
  const adminKey = fs.readFileSync(KEY_FILE, 'utf8').trim();
  const r = await post({ action: 'cli.' + action, adminKey, payload: payload || {} });
  if (!r.ok) throw new Error(`${action}: ${r.error.code} - ${r.error.message}`);
  return r.data;
}

function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

async function verify(dir) {
  if (!dir) throw new Error('Cần đường dẫn thư mục CSV sao lưu, vd backups/2026-11-04');
  let ok = true;
  for (const tab of ['progress', 'log', 'custom_words', 'settings']) {
    const csv = parseCsv(fs.readFileSync(path.join(ROOT, dir, tab + '.csv'), 'utf8'));
    const head = csv[0], body = csv.slice(1);
    const live = (await cli('dump', { tab })).values;
    const lh = live[0].map(String);
    const lbody = live.slice(1).filter((r) => r.some((c) => c !== ''));
    const sameCount = lbody.length === body.length;
    let mismatch = 0;
    body.forEach((r, i) => {
      head.forEach((h, j) => {
        const k = lh.indexOf(h);
        if (k < 0 || !lbody[i] || String(lbody[i][k]) !== r[j]) mismatch++;
      });
    });
    const uid = lh.indexOf('userId');
    const owners = uid < 0 ? '(chưa có cột)' : [...new Set(lbody.map((r) => r[uid]))].join(',');
    console.log(`${tab.padEnd(13)} sao lưu ${String(body.length).padStart(3)} dòng | Sheet ${String(lbody.length).padStart(3)} dòng | ô cũ khác: ${mismatch} | userId: ${owners || '(trống)'}`);
    if (!sameCount || mismatch || (lbody.length && owners !== 'u01')) ok = false;
    if (tab === 'progress' && body.length) {
      const pick = [...body.keys()].sort(() => Math.random() - 0.5).slice(0, 10);
      const same = pick.filter((i) => head.every((h, j) => String(lbody[i][lh.indexOf(h)]) === body[i][j])).length;
      console.log(`  so sánh ${pick.length} dòng progress ngẫu nhiên: ${same}/${pick.length} giống hệt bản sao lưu`);
      if (same !== pick.length) ok = false;
    }
  }
  console.log(ok ? '✓ Khớp hoàn toàn với bản sao lưu.' : '✗ CÓ KHÁC BIỆT, dừng lại kiểm tra.');
  if (!ok) process.exit(1);
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'init-key') {
    if (fs.existsSync(KEY_FILE)) { console.log('Đã có .admin-key, giữ nguyên.'); return; }
    const key = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(key).digest('base64');
    fs.writeFileSync(KEY_FILE, key + '\n');
    fs.writeFileSync(HASH_FILE, '// FILE SINH TỰ ĐỘNG bởi scripts/admin-cli.js init-key. KHÔNG COMMIT (đã gitignore).\nvar ADMIN_KEY_HASH = ' + JSON.stringify(hash) + ';\n');
    console.log('✓ Đã tạo .admin-key và apps-script/AdminKey.js');
  } else if (cmd === 'status') {
    const s = await cli('status');
    console.log(`Sheet ${s.sheetId} · cấu trúc v${s.schema || '1 (chưa chuyển)'} · ${s.now}`);
    s.tabs.forEach((t) => console.log(`  ${t.name.padEnd(13)} ${String(t.dataRows).padStart(4)} dòng | ${t.headers.join(', ')}`));
  } else if (cmd === 'ensure-mocks') {
    console.log(JSON.stringify(await cli('ensureMocks')));
  } else if (cmd === 'ensure-content') {
    console.log(JSON.stringify(await cli('ensureContent')));
  } else if (cmd === 'counts') {
    const s = await cli('status');
    console.log(JSON.stringify(Object.fromEntries(s.tabs.map((t) => [t.name, t.dataRows]))));
  } else if (cmd === 'migrate') {
    console.log(JSON.stringify(await cli('migrate'), null, 2));
  } else if (cmd === 'verify') {
    await verify(arg);
  } else if (cmd === 'create-accounts') {
    const r = await cli('createAccounts');
    if (!r.created.length) { console.log(`Không tạo thêm tài khoản nào (đã có ${r.total}).`); return; }
    const lines = r.created.map((c) => `${c.username}\t${c.password}\t(${c.userId}${c.userId === 'u01' ? ', quản lý, đang dùng' : ', đang khóa'})`);
    const text = '# Mật khẩu ban đầu (chỉ dùng một lần; đăng nhập xong phải đặt mật khẩu mới).\n# LƯU LẠI Ở NƠI AN TOÀN RỒI XÓA FILE NÀY. Không commit (đã gitignore).\n' + lines.join('\n') + '\n';
    const file = path.join(ROOT, 'initial-passwords.txt');
    fs.writeFileSync(file, text);
    console.log(text);
    console.log('✓ Đã ghi ' + file);
  } else {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(2, 14).join('\n'));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
}
