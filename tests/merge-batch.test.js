// scripts/merge-batch.js: nối đúng vào cuối, chỉ thêm dòng, chặn trùng id, không ghi gì khi lỗi.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mergeBatch, MergeError, addedLinesOnly } from '../scripts/merge-batch.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Bản sao thư mục data/ (index + clusters) trong thư mục tạm. */
function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gre-merge-'));
  fs.mkdirSync(path.join(dir, 'data/clusters'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'data/index.json'), path.join(dir, 'data/index.json'));
  fs.readdirSync(path.join(ROOT, 'data/clusters')).forEach((f) => fs.copyFileSync(path.join(ROOT, 'data/clusters', f), path.join(dir, 'data/clusters', f)));
  return dir;
}
const read = (dir, id) => fs.readFileSync(path.join(dir, 'data/clusters', id + '.json'), 'utf8');
const snapshot = (dir) => Object.fromEntries(fs.readdirSync(path.join(dir, 'data/clusters')).map((f) => [f, fs.readFileSync(path.join(dir, 'data/clusters', f), 'utf8')]));
const firstEx = (dir, id) => JSON.parse(read(dir, id)).exercises[0];
function writeBatch(dir, obj) {
  const p = path.join(dir, 'batch.json');
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
  return p;
}
const clone = (ex, id) => Object.assign(JSON.parse(JSON.stringify(ex)), { id, addedIn: 'batch-test' });

test('nối thêm vào cuối mảng exercises, câu cũ giữ nguyên thứ tự, file chỉ có dòng thêm', () => {
  const dir = sandbox();
  const before = snapshot(dir);
  const a = clone(firstEx(dir, 'praise-criticism'), 'zz901');
  const b = clone(firstEx(dir, 'praise-criticism'), 'zz902');
  const c = clone(firstEx(dir, 'harsh-mild'), 'zz903');
  const r = mergeBatch(writeBatch(dir, { 'praise-criticism': [a, b], 'harsh-mild': [c] }), { root: dir });
  assert.equal(r.totalAfter - r.totalBefore, 3);
  assert.deepEqual(r.rows.filter((x) => x.added).map((x) => [x.clusterId, x.added]), [['praise-criticism', 2], ['harsh-mild', 1]]);
  assert.equal(r.files.length, 2);
  const oldPc = JSON.parse(before['praise-criticism.json']);
  const newPc = JSON.parse(read(dir, 'praise-criticism'));
  assert.deepEqual(newPc.exercises.slice(0, oldPc.exercises.length), oldPc.exercises);
  assert.deepEqual(newPc.exercises.slice(-2).map((e) => e.id), ['zz901', 'zz902']);
  assert.deepEqual(Object.assign({}, newPc, { exercises: null }), Object.assign({}, oldPc, { exercises: null }));
  // chỉ thêm dòng: bản cũ là bản mới bỏ đi một khối dòng liền
  assert.ok(addedLinesOnly(before['praise-criticism.json'], read(dir, 'praise-criticism')) > 0);
  assert.ok(addedLinesOnly(before['harsh-mild.json'], read(dir, 'harsh-mild')) > 0);
  // file cụm khác không đổi
  Object.keys(before).filter((f) => !['praise-criticism.json', 'harsh-mild.json'].includes(f)).forEach((f) => assert.equal(fs.readFileSync(path.join(dir, 'data/clusters', f), 'utf8'), before[f], f));
  // định dạng: thụt 2 dấu cách, giống JSON.stringify(…, null, 2)
  const t = read(dir, 'praise-criticism');
  assert.equal(t, JSON.stringify(JSON.parse(t), null, 2) + (before['praise-criticism.json'].endsWith('\n') ? '\n' : ''));
});

test('chặn trùng id (với câu đã có ở cụm khác, hoặc trong chính file đợt): báo lỗi và không ghi gì', () => {
  const dir = sandbox();
  const before = snapshot(dir);
  const existing = firstEx(dir, 'harsh-mild');
  const dupOther = clone(firstEx(dir, 'praise-criticism'), existing.id); // id đã có ở cụm harsh-mild
  const ok = clone(firstEx(dir, 'praise-criticism'), 'zz911');
  const twice = clone(firstEx(dir, 'praise-criticism'), 'zz912');
  assert.throws(() => mergeBatch(writeBatch(dir, { 'praise-criticism': [ok, dupOther], 'clarity-obscurity': [twice, twice] }), { root: dir }), (e) => {
    assert.ok(e instanceof MergeError);
    assert.ok(e.errors.some((m) => m.includes(existing.id) && m.includes('harsh-mild')), e.message);
    assert.ok(e.errors.some((m) => m.includes('zz912') && /lặp trong file đợt/.test(m)), e.message);
    return true;
  });
  assert.deepEqual(snapshot(dir), before);
});

test('câu không hợp lệ hoặc cụm không tồn tại: báo lỗi, không ghi file nào (kể cả cụm hợp lệ)', () => {
  const dir = sandbox();
  const before = snapshot(dir);
  const good = clone(firstEx(dir, 'praise-criticism'), 'zz921');
  const bad = clone(firstEx(dir, 'harsh-mild'), 'zz922');
  bad.targets = ['khong-co-tu-nay'];
  const r = () => mergeBatch(writeBatch(dir, { 'praise-criticism': [good], 'harsh-mild': [bad], 'khong-co-cum': [clone(good, 'zz923')] }), { root: dir });
  assert.throws(r, (e) => {
    assert.ok(e.errors.some((m) => /khong-co-cum/.test(m) && /không tồn tại/.test(m)), e.message);
    assert.ok(e.errors.some((m) => /zz922/.test(m) && /khong-co-tu-nay/.test(m)), e.message);
    return true;
  });
  assert.deepEqual(snapshot(dir), before);
});

test('chạy lại cùng một đợt lần hai bị chặn vì trùng id; --dry-run (write: false) không ghi', () => {
  const dir = sandbox();
  const batch = writeBatch(dir, { 'harsh-mild': [clone(firstEx(dir, 'harsh-mild'), 'zz931')] });
  const before = snapshot(dir);
  const dry = mergeBatch(batch, { root: dir, write: false });
  assert.equal(dry.totalAfter - dry.totalBefore, 1);
  assert.deepEqual(snapshot(dir), before);
  mergeBatch(batch, { root: dir });
  const once = snapshot(dir);
  assert.throws(() => mergeBatch(batch, { root: dir }), MergeError);
  assert.deepEqual(snapshot(dir), once);
});

test('dòng lệnh: lỗi thì thoát mã 1 và in "Không ghi file nào"; dữ liệu thật của repo đã chứa đợt 02', () => {
  let out = '';
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/merge-batch.js'), path.join(ROOT, 'data/batches/batch-02.json'), '--dry-run'], { stdio: 'pipe' });
    assert.fail('phải báo lỗi trùng id');
  } catch (e) {
    out = String(e.stderr || '');
    assert.equal(e.status, 1);
  }
  assert.match(out, /Không ghi file nào/);
  assert.match(out, /ma101/);
});

test('addedLinesOnly: nhận ra dòng cũ bị sửa', () => {
  assert.equal(addedLinesOnly('a\nb\nc', 'a\nx\ny\nb\nc'), 2);
  assert.equal(addedLinesOnly('a\nb\nc', 'a\nb2\nc'), -1);
  assert.equal(addedLinesOnly('a\nb\nc', 'a\nc'), -1);
});
