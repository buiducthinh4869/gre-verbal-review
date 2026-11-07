#!/usr/bin/env node
/**
 * check-data.js: kiểm tra schema mọi file trong data/ (npm run check).
 * Dừng với mã lỗi 1 và danh sách lỗi rõ ràng nếu dữ liệu sai. KHÔNG sửa dữ liệu.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWord, validateExercise, validateMock } from '../assets/validate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const CLUSTER_DIR = path.join(DATA_DIR, 'clusters');
const MOCK_DIR = path.join(DATA_DIR, 'mocks');
function readJson(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${path.relative(ROOT, file)}: JSON không hợp lệ (${e.message})`);
  }
}

function validate(index, clusters) {
  const errors = [];
  const err = (where, msg) => errors.push(`  - [${where}] ${msg}`);
  const wordOwner = new Map();
  const exOwner = new Map();

  const listed = new Set(index.clusters);
  const files = fs.readdirSync(CLUSTER_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  files.forEach((f) => { if (!listed.has(f)) err('index.json', `File data/clusters/${f}.json chưa có trong data/index.json`); });

  clusters.forEach((c) => {
    const where = c.__file;
    if (c.schemaVersion !== 1) err(where, `schemaVersion phải là 1 (đang là ${c.schemaVersion})`);
    ['id', 'title'].forEach((k) => { if (!c[k] || typeof c[k] !== 'string') err(where, `thiếu "${k}"`); });
    if (c.id && c.__file !== `${c.id}.json`) err(where, `id cụm "${c.id}" không khớp tên file`);
    if (c.id === 'custom') err(where, 'id cụm "custom" được dành cho Từ tự thêm');
    if (typeof c.order !== 'number') err(where, 'thiếu "order" (số)');
    if (!Array.isArray(c.groups) || !c.groups.length) err(where, 'thiếu "groups"');
    if (!Array.isArray(c.words) || !c.words.length) err(where, 'thiếu "words"');
    if (!Array.isArray(c.exercises)) err(where, 'thiếu "exercises" (có thể là mảng rỗng)');
  });
  if (errors.length) return errors;

  const groupIds = new Map();
  const DIRECTIONS = ['positive', 'negative', 'neutral'];
  clusters.forEach((c) => c.groups.forEach((g) => {
    if (groupIds.has(g.id)) err(c.__file, `trùng id nhóm "${g.id}" (đã có ở ${groupIds.get(g.id)})`);
    groupIds.set(g.id, c.__file);
    if (!g.title) err(`${c.__file} nhóm ${g.id}`, 'thiếu "title"');
    if (!DIRECTIONS.includes(g.direction)) err(`${c.__file} nhóm ${g.id}`, `"direction" phải là positive, negative hoặc neutral (đang là ${JSON.stringify(g.direction)})`);
  }));

  clusters.forEach((c) => {
    const where = c.__file;
    const localGroups = new Set(c.groups.map((g) => g.id));
    c.words.forEach((w, i) => {
      const at = `${where} words[${i}] ${w.id || ''}`.trim();
      ['id', 'word', 'pos', 'group', 'meaning'].forEach((k) => {
        if (!w[k] || typeof w[k] !== 'string') err(at, `thiếu trường "${k}"`);
      });
      if (w.id) {
        if (wordOwner.has(w.id)) err(at, `trùng id từ "${w.id}" (đã có ở ${wordOwner.get(w.id)})`);
        wordOwner.set(w.id, where);
      }
      if (w.group && !localGroups.has(w.group)) err(at, `group "${w.group}" không tồn tại trong cụm`);
      const g = c.groups.find((x) => x.id === w.group);
      if (w.collocations != null && !Array.isArray(w.collocations)) err(at, '"collocations" phải là mảng');
      if (w.confusables != null && !Array.isArray(w.confusables)) err(at, '"confusables" phải là mảng');
      w.__scale = !!(g && g.scale);
    });
  });

  // quy tắc của từng từ (assets/validate.js); confusables được trỏ sang cụm khác, miễn là tồn tại
  const hasWord = (id) => wordOwner.has(id);
  clusters.forEach((c) => c.words.forEach((w, i) => {
    const at = `${c.__file} words[${i}] ${w.id || ''}`.trim();
    validateWord(w, { hasWord, isScale: w.__scale }).forEach((m) => err(at, m));
    delete w.__scale;
  }));

  clusters.forEach((c) => c.exercises.forEach((ex, i) => {
    const at = `${c.__file} exercises[${i}] ${ex.id || ''}`.trim();
    if (!ex.id) err(at, 'thiếu "id"');
    else {
      if (exOwner.has(ex.id)) err(at, `trùng id bài "${ex.id}" (đã có ở ${exOwner.get(ex.id)})`);
      exOwner.set(ex.id, c.__file);
    }
    validateExercise(ex, { hasWord }).forEach((m) => err(at, m));
  }));

  return errors;
}

/**
 * Đề thi thử cố định: data/mocks/index.json {"mocks": [id, ...]} và data/mocks/<id>.json.
 * Mọi đề trong index phải có file (và ngược lại); quy tắc từng đề ở assets/validate.js (validateMock).
 * Trả về {errors, mocks}. Chưa có thư mục data/mocks thì bỏ qua.
 */
export function validateMocks(clusters) {
  const errors = [];
  const mocks = [];
  if (!fs.existsSync(MOCK_DIR)) return { errors, mocks };
  const err = (where, msg) => errors.push(`  - [mocks/${where}] ${msg}`);
  const idxFile = path.join(MOCK_DIR, 'index.json');
  if (!fs.existsSync(idxFile)) { err('index.json', 'thiếu data/mocks/index.json'); return { errors, mocks }; }
  let index;
  try { index = readJson(idxFile); } catch (e) { err('index.json', e.message); return { errors, mocks }; }
  if (!index || !Array.isArray(index.mocks)) { err('index.json', 'phải có mảng "mocks"'); return { errors, mocks }; }
  index.mocks.forEach((id, i) => { if (index.mocks.indexOf(id) !== i) err('index.json', `đề "${id}" bị liệt kê hai lần`); });
  const files = fs.readdirSync(MOCK_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => f.replace(/\.json$/, ''));
  files.forEach((f) => { if (!index.mocks.includes(f)) err('index.json', `File data/mocks/${f}.json chưa có trong data/mocks/index.json`); });
  const exIds = new Set(), clusterIds = new Set();
  clusters.forEach((c) => { clusterIds.add(c.id); c.exercises.forEach((ex) => exIds.add(ex.id)); });
  index.mocks.forEach((id) => {
    const file = path.join(MOCK_DIR, `${id}.json`);
    if (!fs.existsSync(file)) { err('index.json', `liệt kê đề "${id}" nhưng không có file data/mocks/${id}.json`); return; }
    let m;
    try { m = readJson(file); } catch (e) { err(`${id}.json`, e.message); return; }
    validateMock(m, { file: `${id}.json`, hasExercise: (x) => exIds.has(x), hasCluster: (x) => clusterIds.has(x) }).forEach((msg) => err(`${id}.json`, msg));
    mocks.push(m);
  });
  return { errors, mocks };
}

export function loadAll() {
  const index = readJson(path.join(DATA_DIR, 'index.json'));
  if (!Array.isArray(index.clusters)) throw new Error('data/index.json phải có mảng "clusters"');
  const clusters = index.clusters.map((id) => {
    const file = path.join(CLUSTER_DIR, `${id}.json`);
    if (!fs.existsSync(file)) throw new Error(`data/index.json liệt kê "${id}" nhưng không có file data/clusters/${id}.json`);
    const c = readJson(file);
    c.__file = `${id}.json`;
    return c;
  });
  return { index, clusters };
}

function main() {
  const { index, clusters } = loadAll();
  const dup = index.clusters.filter((id, i) => index.clusters.indexOf(id) !== i);
  const errors = validate(index, clusters);
  dup.forEach((id) => errors.push(`  - [index.json] cụm "${id}" bị liệt kê hai lần`));
  const mk = errors.length ? { errors: [], mocks: [] } : validateMocks(clusters);
  mk.errors.forEach((e) => errors.push(e));
  if (errors.length) {
    console.error(`\n✗ Dữ liệu có ${errors.length} lỗi:\n${errors.join('\n')}\n`);
    process.exit(1);
  }
  const nWords = clusters.reduce((s, c) => s + c.words.length, 0);
  const nEx = clusters.reduce((s, c) => s + c.exercises.length, 0);
  console.log(`✓ Dữ liệu hợp lệ: ${clusters.length} cụm, ${nWords} từ, ${nEx} bài GRE`);
  clusters.forEach((c) => console.log(`  · ${c.title} (${c.id}): ${c.words.length} từ, ${c.exercises.length} bài`));
  const kinds = { tc1: 0, tc2: 0, tc3: 0, se: 0 }, diff = { 1: 0, 2: 0, 3: 0, '-': 0 };
  clusters.forEach((c) => c.exercises.forEach((ex) => {
    kinds[ex.type === 'se' ? 'se' : 'tc' + ex.blanks.length]++;
    diff[ex.difficulty || '-']++;
  }));
  console.log(`  Dạng câu: ${kinds.tc1} TC một chỗ trống, ${kinds.tc2} TC hai chỗ trống, ${kinds.tc3} TC ba chỗ trống, ${kinds.se} SE`);
  console.log(`  Độ khó: ${diff[1]} dễ, ${diff[2]} vừa, ${diff[3]} khó` + (diff['-'] ? `, ${diff['-']} chưa phân loại` : ''));
  mk.mocks.forEach((m) => console.log(`  Đề cố định ${m.id} "${m.title}": ` + m.sections.map((s) => `${s.title} ${s.items.length} câu / ${s.minutes} phút`).join(', ')));
}

try {
  main();
} catch (e) {
  console.error(`\n✗ ${e.message}\n`);
  process.exit(1);
}
