#!/usr/bin/env node
/**
 * apply-overrides.js: đưa các bản sửa nội dung (file xuất từ trang Quản lý → "Xuất các bản sửa") vào dữ liệu gốc.
 *
 *   node scripts/apply-overrides.js overrides-YYYY-MM-DD.json            ghi vào data/clusters/*.json
 *   node scripts/apply-overrides.js overrides-YYYY-MM-DD.json --dry-run  chỉ in ra sẽ đổi gì, không ghi
 *
 * - Chỉ đổi đúng trường được phép sửa (assets/validate.js EDITABLE) của đúng từ / câu; không đổi id, nhóm, cụm.
 * - Giữ nguyên định dạng file (JSON thụt 2 dấu cách, như cũ).
 * - Sau khi ghi, chạy scripts/check-data.js; nếu dữ liệu không hợp lệ thì TRẢ LẠI nguyên các file cũ và báo lỗi.
 * - Không đụng Google Sheet. Sau khi commit + push và GitHub Pages cập nhật, bấm "Đánh dấu đã đưa vào dữ liệu gốc"
 *   ở trang Quản lý để tắt các bản sửa tương ứng (xem UPDATE.md).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EDITABLE, FIELD_LABEL, validateWord, validateExercise } from '../assets/validate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('Cách dùng: node scripts/apply-overrides.js <overrides-YYYY-MM-DD.json> [--dry-run]');
  process.exit(1);
}

const exp = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8').replace(/^﻿/, ''));
const list = Array.isArray(exp) ? exp : exp.overrides;
if (!Array.isArray(list)) { console.error('✗ File không đúng định dạng (cần mảng "overrides").'); process.exit(1); }

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/index.json'), 'utf8'));
const files = index.clusters.map((id) => {
  const p = path.join(ROOT, 'data/clusters', id + '.json');
  const text = fs.readFileSync(p, 'utf8');
  return { id, p, text, data: JSON.parse(text.replace(/^﻿/, '')), changed: false };
});
const allIds = new Set(files.flatMap((f) => f.data.words.map((w) => w.id)));
const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);

const applied = [], unchanged = [], problems = [];
list.forEach((o) => {
  const t = o.targetType, id = o.targetId, f = o.field;
  const where = `${t} ${id} · ${FIELD_LABEL[f] || f}`;
  if (!EDITABLE[t] || !EDITABLE[t].includes(f)) { problems.push(where + ': trường không được phép sửa, bỏ qua'); return; }
  let owner = null, item = null;
  for (const c of files) {
    const it = (t === 'word' ? c.data.words : c.data.exercises).find((x) => x.id === id);
    if (it) { owner = c; item = it; break; }
  }
  if (!item) { problems.push(where + ': không tìm thấy trong dữ liệu, bỏ qua'); return; }
  const cur = f === 'hidden' ? !!item.hidden : item[f];
  if (same(cur, o.value) || (f === 'level' && o.value == null && item.level == null)) { unchanged.push(where); return; }
  if ((f === 'hidden' && !o.value) || (f === 'level' && o.value == null)) delete item[f];
  else item[f] = JSON.parse(JSON.stringify(o.value));
  owner.changed = true;
  applied.push(`${where}  (${owner.id}.json)`);
});

// kiểm tra từng mục bị đổi trước khi ghi
files.filter((c) => c.changed).forEach((c) => {
  c.data.words.forEach((w) => {
    const g = c.data.groups.find((x) => x.id === w.group);
    validateWord(w, { hasWord: (x) => allIds.has(x), isScale: !!(g && g.scale) }).forEach((m) => problems.push(`LỖI ${c.id}.json ${w.id}: ${m}`));
  });
  c.data.exercises.forEach((ex) => validateExercise(ex, { hasWord: (x) => allIds.has(x) }).forEach((m) => problems.push(`LỖI ${c.id}.json ${ex.id}: ${m}`)));
});

console.log(`Bản sửa trong file: ${list.length}`);
applied.forEach((x) => console.log('  ✓ ' + x));
if (unchanged.length) console.log(`Đã giống dữ liệu gốc (không cần đổi): ${unchanged.length}`);
problems.forEach((x) => console.log('  ! ' + x));
const hardErrors = problems.filter((x) => x.startsWith('LỖI'));
if (hardErrors.length) { console.error(`\n✗ Có ${hardErrors.length} lỗi hợp lệ: KHÔNG ghi file nào.`); process.exit(1); }
if (dry) { console.log('\n(--dry-run: không ghi file nào)'); process.exit(0); }
if (!applied.length) { console.log('\nKhông có gì để ghi.'); process.exit(0); }

const changed = files.filter((c) => c.changed);
changed.forEach((c) => {
  const nl = c.text.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(c.p, JSON.stringify(c.data, null, 2) + nl);
});
try {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/check-data.js')], { stdio: 'pipe' });
} catch (e) {
  changed.forEach((c) => fs.writeFileSync(c.p, c.text));
  console.error('\n✗ npm run check báo lỗi sau khi ghi; đã trả lại nguyên các file cũ.\n' + String(e.stdout || '') + String(e.stderr || ''));
  process.exit(1);
}
console.log(`\n✓ Đã ghi ${applied.length} bản sửa vào ${changed.length} file: ${changed.map((c) => c.id + '.json').join(', ')}. npm run check vẫn qua.`);
console.log('Tiếp theo: commit, push; khi GitHub Pages đã cập nhật, bấm "Đánh dấu đã đưa vào dữ liệu gốc" ở trang Quản lý.');
