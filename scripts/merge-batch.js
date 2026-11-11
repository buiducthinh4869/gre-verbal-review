#!/usr/bin/env node
/**
 * merge-batch.js: nối một đợt bài tập (câu GRE mới) vào cuối các file cụm, không sửa câu nào có sẵn.
 *
 *   node scripts/merge-batch.js data/batches/batch-02.json            nối và ghi
 *   node scripts/merge-batch.js data/batches/batch-02.json --dry-run  chỉ kiểm tra và in bảng tóm tắt
 *
 * File đợt có dạng { "<clusterId>": [ ...câu hỏi ] }.
 * - Mỗi câu được NỐI vào cuối mảng `exercises` của data/clusters/<clusterId>.json; không sửa, không sắp xếp lại,
 *   không xóa câu nào có sẵn.
 * - Dừng và báo lỗi, KHÔNG ghi file nào, nếu: cụm không tồn tại; id câu mới trùng với câu đã có ở bất kỳ cụm nào
 *   (hoặc trùng nhau trong chính file đợt); câu không hợp lệ theo assets/validate.js; file cụm không ở định dạng chuẩn
 *   (JSON thụt 2 dấu cách) nên không thể chỉ thêm dòng.
 * - Giữ định dạng (thụt 2 dấu cách, UTF-8, giữ nguyên ký tự xuống dòng cuối file): `git diff` chỉ có dòng thêm.
 * - In bảng tóm tắt: số câu thêm cho từng cụm, tổng số câu trước và sau.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateExercise } from '../assets/validate.js';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export class MergeError extends Error {
  constructor(errors) { super(errors.join('\n')); this.errors = errors; }
}

const readText = (p) => fs.readFileSync(p, 'utf8');
const stripBom = (t) => t.replace(/^\uFEFF/, '');
const lines = (t) => t.split('\n');

/** Định dạng JSON như các file dữ liệu: thụt 2 dấu cách, giữ BOM / xuống dòng cuối file / CRLF như bản cũ. */
function formatLike(oldText, data) {
  const bom = oldText.startsWith('\uFEFF') ? '\uFEFF' : '';
  const crlf = /\r\n/.test(oldText);
  const body = stripBom(oldText).replace(/\r\n/g, '\n');
  let out = JSON.stringify(data, null, 2) + (body.endsWith('\n') ? '\n' : '');
  if (crlf) out = out.replace(/\n/g, '\r\n');
  return bom + out;
}

/** Bản mới có phải chỉ là bản cũ thêm dòng (một khối liền) không. Trả về số dòng thêm, hoặc -1 nếu có dòng cũ bị đổi / xóa. */
export function addedLinesOnly(oldText, newText) {
  const a = lines(oldText), b = lines(newText);
  if (b.length < a.length) return -1;
  let p = 0;
  while (p < a.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  return p + s === a.length ? b.length - a.length : -1;
}

/**
 * Kiểm tra và (nếu write) nối một đợt. Trả về {rows: [{clusterId, before, added, after}], totalBefore, totalAfter, files: [đường dẫn đã ghi]}.
 * Lỗi: ném MergeError (không ghi gì).
 */
export function mergeBatch(batchFile, opts = {}) {
  const root = opts.root || DEFAULT_ROOT;
  const write = opts.write !== false;
  const errors = [];
  let batch;
  try { batch = JSON.parse(stripBom(readText(path.resolve(root, batchFile)))); } catch (e) { throw new MergeError([`Không đọc được file đợt ${batchFile}: ${e.message}`]); }
  if (!batch || typeof batch !== 'object' || Array.isArray(batch)) throw new MergeError(['File đợt phải là đối tượng { "<clusterId>": [ ...câu hỏi ] }']);

  const index = JSON.parse(stripBom(readText(path.join(root, 'data/index.json'))));
  const clusters = index.clusters.map((id) => {
    const p = path.join(root, 'data/clusters', id + '.json');
    const text = readText(p);
    return { id, p, text, data: JSON.parse(stripBom(text)) };
  });
  const byId = Object.fromEntries(clusters.map((c) => [c.id, c]));
  const wordIds = new Set(clusters.flatMap((c) => c.data.words.map((w) => w.id)));
  const exOwner = new Map();
  clusters.forEach((c) => c.data.exercises.forEach((ex) => exOwner.set(ex.id, c.id)));
  const hasWord = (id) => wordIds.has(id);

  const newIds = new Map();
  Object.keys(batch).forEach((cid) => {
    const list = batch[cid];
    if (!byId[cid]) { errors.push(`Cụm "${cid}" không tồn tại (không có trong data/index.json)`); return; }
    if (!Array.isArray(list)) { errors.push(`Cụm "${cid}": giá trị phải là mảng câu hỏi`); return; }
    list.forEach((ex, i) => {
      const at = `${cid}[${i}] ${ex && ex.id ? ex.id : ''}`.trim();
      if (!ex || typeof ex.id !== 'string' || !ex.id) { errors.push(`${at}: thiếu "id"`); return; }
      if (exOwner.has(ex.id)) errors.push(`${at}: id "${ex.id}" trùng với câu đã có trong cụm ${exOwner.get(ex.id)}`);
      if (newIds.has(ex.id)) errors.push(`${at}: id "${ex.id}" bị lặp trong file đợt (đã có ở ${newIds.get(ex.id)})`);
      newIds.set(ex.id, cid);
      validateExercise(ex, { hasWord }).forEach((m) => errors.push(`${at}: ${m}`));
    });
  });

  const rows = [];
  const pending = [];
  clusters.forEach((c) => {
    const add = Array.isArray(batch[c.id]) ? batch[c.id] : [];
    const before = c.data.exercises.length;
    rows.push({ clusterId: c.id, before, added: add.length, after: before + add.length });
    if (!add.length) return;
    if (formatLike(c.text, c.data) !== c.text) {
      errors.push(`data/clusters/${c.id}.json không ở định dạng chuẩn (JSON thụt 2 dấu cách); nối thêm sẽ đổi cả các dòng cũ`);
      return;
    }
    const next = Object.assign({}, c.data, { exercises: c.data.exercises.concat(add) });
    const newText = formatLike(c.text, next);
    if (addedLinesOnly(c.text, newText) < 0) {
      errors.push(`data/clusters/${c.id}.json: không nối được mà chỉ thêm dòng (mảng exercises đang rỗng?)`);
      return;
    }
    pending.push({ p: c.p, oldText: c.text, newText });
  });
  if (errors.length) throw new MergeError(errors);

  const written = [];
  if (write) {
    try {
      pending.forEach((f) => {
        const tmp = f.p + '.tmp-merge';
        fs.writeFileSync(tmp, f.newText, 'utf8');
        fs.renameSync(tmp, f.p);
        written.push(f);
      });
    } catch (e) {
      written.forEach((f) => fs.writeFileSync(f.p, f.oldText, 'utf8')); // ghi dở: trả lại các file đã ghi
      throw new MergeError([`Lỗi khi ghi file (đã trả lại các file cũ): ${e.message}`]);
    }
  }
  const totalBefore = rows.reduce((s, r) => s + r.before, 0);
  const totalAfter = rows.reduce((s, r) => s + r.after, 0);
  return { rows, totalBefore, totalAfter, files: written.map((f) => f.p) };
}

export function summaryTable(r) {
  const w = Math.max(4, ...r.rows.map((x) => x.clusterId.length));
  const line = (a, b, c, d) => '  ' + String(a).padEnd(w) + String(b).padStart(8) + String(c).padStart(8) + String(d).padStart(8);
  const out = [line('Cụm', 'Trước', 'Thêm', 'Sau')];
  r.rows.forEach((x) => out.push(line(x.clusterId, x.before, x.added ? '+' + x.added : '0', x.after)));
  out.push(line('Tổng', r.totalBefore, '+' + (r.totalAfter - r.totalBefore), r.totalAfter));
  return out.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Cách dùng: node scripts/merge-batch.js data/batches/<tên>.json [--dry-run]');
    process.exit(1);
  }
  try {
    const r = mergeBatch(path.resolve(file), { write: !dry });
    console.log(summaryTable(r));
    if (dry) console.log('\n(--dry-run: không ghi file nào)');
    else console.log(`\n✓ Đã nối ${r.totalAfter - r.totalBefore} câu vào ${r.files.length} file cụm. Tiếp theo: git diff --stat, npm run check, npm test.`);
  } catch (e) {
    if (!(e instanceof MergeError)) throw e;
    console.error(`\n✗ Không ghi file nào. ${e.errors.length} lỗi:\n` + e.errors.map((x) => '  - ' + x).join('\n') + '\n');
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
