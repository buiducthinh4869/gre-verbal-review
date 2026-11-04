#!/usr/bin/env node
/**
 * build.js
 * 1. Đọc data/index.json và data/clusters/*.json, kiểm tra schema.
 * 2. Gộp thành src/Data.js (const VOCAB_DATA = {...};).
 * 3. Bọc src/Srs.js thành src/srs.html để client dùng chung đúng một bản logic.
 * Dừng với mã lỗi 1 và danh sách lỗi rõ ràng nếu dữ liệu sai.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const CLUSTER_DIR = path.join(DATA_DIR, 'clusters');
const SRC = path.join(ROOT, 'src');

function readJson(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${path.relative(ROOT, file)}: JSON không hợp lệ (${e.message})`);
  }
}

function placeholders(sentence) {
  const found = new Set();
  const re = /\{(\d+)\}/g;
  let m;
  while ((m = re.exec(sentence))) found.add(Number(m[1]));
  return [...found].sort((a, b) => a - b);
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
  clusters.forEach((c) => c.groups.forEach((g) => {
    if (groupIds.has(g.id)) err(c.__file, `trùng id nhóm "${g.id}" (đã có ở ${groupIds.get(g.id)})`);
    groupIds.set(g.id, c.__file);
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
      if (![1, 2, 3].includes(w.priority)) err(at, `priority phải là 1, 2 hoặc 3 (đang là ${w.priority})`);
      const g = c.groups.find((x) => x.id === w.group);
      if (w.level != null && (!Number.isInteger(w.level) || w.level < 1 || w.level > 4)) err(at, `level phải là số nguyên 1–4`);
      if (g && g.scale && w.level == null) err(at, `nhóm "${g.id}" là thang (scale) nhưng từ thiếu "level"`);
      if (w.collocations != null && !Array.isArray(w.collocations)) err(at, '"collocations" phải là mảng');
      if (w.confusables != null && !Array.isArray(w.confusables)) err(at, '"confusables" phải là mảng');
    });
  });

  // confusables trỏ tới id có thật (xét toàn bộ dữ liệu)
  clusters.forEach((c) => c.words.forEach((w) => (w.confusables || []).forEach((id) => {
    if (!wordOwner.has(id)) err(`${c.__file} ${w.id}`, `confusables trỏ tới id không có: "${id}"`);
    if (id === w.id) err(`${c.__file} ${w.id}`, 'confusables trỏ về chính nó');
  })));

  clusters.forEach((c) => c.exercises.forEach((ex, i) => {
    const at = `${c.__file} exercises[${i}] ${ex.id || ''}`.trim();
    if (!ex.id) err(at, 'thiếu "id"');
    else {
      if (exOwner.has(ex.id)) err(at, `trùng id bài "${ex.id}" (đã có ở ${exOwner.get(ex.id)})`);
      exOwner.set(ex.id, c.__file);
    }
    if (!ex.sentence) err(at, 'thiếu "sentence"');
    if (!Array.isArray(ex.targets) || !ex.targets.length) err(at, 'thiếu "targets"');
    (ex.targets || []).forEach((t) => { if (!wordOwner.has(t)) err(at, `targets trỏ tới id không có: "${t}"`); });
    const ph = placeholders(ex.sentence || '');

    const checkOptions = (opts, label) => {
      const seen = new Set();
      opts.forEach((o) => {
        const k = String(o).trim().toLowerCase();
        if (!k) err(at, `${label}: có phương án rỗng`);
        if (seen.has(k)) err(at, `${label}: phương án bị trùng "${o}"`);
        seen.add(k);
      });
    };

    if (ex.type === 'tc') {
      if (!Array.isArray(ex.blanks) || !ex.blanks.length) { err(at, 'TC thiếu "blanks"'); return; }
      if (ph.length !== ex.blanks.length) err(at, `câu có ${ph.length} chỗ {n} nhưng có ${ex.blanks.length} blanks`);
      ph.forEach((n, k) => { if (n !== k) err(at, `chỗ trống phải đánh số liên tục từ {0} (thấy {${n}})`); });
      const want = ex.blanks.length === 1 ? 5 : 3;
      ex.blanks.forEach((b, k) => {
        const label = `blank ${k}`;
        if (!Array.isArray(b.options)) { err(at, `${label}: thiếu options`); return; }
        if (b.options.length !== want) err(at, `${label}: cần ${want} phương án (TC ${ex.blanks.length} chỗ trống), đang có ${b.options.length}`);
        checkOptions(b.options, label);
        if (!b.options.includes(b.answer)) err(at, `${label}: answer "${b.answer}" không nằm trong options`);
      });
    } else if (ex.type === 'se') {
      if (ph.length !== 1 || ph[0] !== 0) err(at, 'câu SE phải có đúng một chỗ {0}');
      if (!Array.isArray(ex.options) || ex.options.length !== 6) err(at, `SE phải có đúng 6 phương án (đang có ${(ex.options || []).length})`);
      if (!Array.isArray(ex.answers) || ex.answers.length !== 2) err(at, `SE phải có đúng 2 đáp án (đang có ${(ex.answers || []).length})`);
      else {
        if (ex.answers[0] === ex.answers[1]) err(at, 'hai đáp án SE trùng nhau');
        ex.answers.forEach((a) => { if (!(ex.options || []).includes(a)) err(at, `đáp án "${a}" không nằm trong options`); });
      }
      if (Array.isArray(ex.options)) checkOptions(ex.options, 'options');
    } else {
      err(at, `type phải là "tc" hoặc "se" (đang là "${ex.type}")`);
    }
  }));

  return errors;
}

function main() {
  const index = readJson(path.join(DATA_DIR, 'index.json'));
  if (!Array.isArray(index.clusters)) throw new Error('data/index.json phải có mảng "clusters"');
  const clusters = index.clusters.map((id) => {
    const file = path.join(CLUSTER_DIR, `${id}.json`);
    if (!fs.existsSync(file)) throw new Error(`data/index.json liệt kê "${id}" nhưng không có file data/clusters/${id}.json`);
    const c = readJson(file);
    c.__file = `${id}.json`;
    return c;
  });

  const errors = validate(index, clusters);
  if (errors.length) {
    console.error(`\n✗ Dữ liệu có ${errors.length} lỗi:\n${errors.join('\n')}\n`);
    console.error('Không sinh src/Data.js. Sửa dữ liệu rồi chạy lại npm run build.');
    process.exit(1);
  }

  const out = {
    builtAt: new Date().toISOString(),
    clusters: clusters.map((c) => {
      const copy = Object.assign({}, c);
      delete copy.__file;
      return copy;
    }),
  };
  const header = '// FILE SINH TỰ ĐỘNG bởi scripts/build.js từ data/. KHÔNG SỬA TAY.\n';
  fs.writeFileSync(path.join(SRC, 'Data.js'), `${header}const VOCAB_DATA = ${JSON.stringify(out)};\n`, 'utf8');

  const srs = fs.readFileSync(path.join(SRC, 'Srs.js'), 'utf8');
  if (/<\/script/i.test(srs)) throw new Error('src/Srs.js không được chứa chuỗi </script');
  fs.writeFileSync(path.join(SRC, 'srs.html'),
    `<!-- FILE SINH TỰ ĐỘNG bởi scripts/build.js từ src/Srs.js. KHÔNG SỬA TAY. -->\n<script>\n${srs}\n</script>\n`, 'utf8');

  const nWords = clusters.reduce((s, c) => s + c.words.length, 0);
  const nEx = clusters.reduce((s, c) => s + c.exercises.length, 0);
  console.log(`✓ Build xong: ${clusters.length} cụm, ${nWords} từ, ${nEx} bài GRE → src/Data.js, src/srs.html`);
  clusters.forEach((c) => console.log(`  · ${c.title} (${c.id}): ${c.words.length} từ, ${c.exercises.length} bài`));
}

try {
  main();
} catch (e) {
  console.error(`\n✗ ${e.message}\n`);
  process.exit(1);
}
