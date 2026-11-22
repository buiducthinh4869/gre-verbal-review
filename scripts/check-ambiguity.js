#!/usr/bin/env node
/**
 * check-ambiguity.js: tìm câu có thể có hơn một đáp án hợp lệ (node scripts/check-ambiguity.js).
 *  - Nghĩa → Từ: với mọi từ, sinh phương án nhiễu nhiều lần; báo nếu có nhiễu quá gần nghĩa đáp án (tooClose).
 *  - TC: phương án sai cùng chỗ trống mà quá gần nghĩa đáp án của chỗ đó.
 *  - SE: phương án ngoài cặp đáp án mà quá gần nghĩa một trong hai đáp án (có thể thành cặp thứ hai).
 * Chỉ báo, không sửa. Câu bị báo cần đọc lại bằng mắt: ngữ cảnh câu có thể đã loại phương án đó (vd cặp trái nghĩa
 * cùng nhóm như mutable / immutable). Dòng đã đọc và xác nhận chỉ một đáp án đúng ghi ở scripts/ambiguity-reviewed.txt
 * (đọc lại ngày 22/11/2026) và không bị báo nữa.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, mapOptionToId } from '../assets/vocab.js';
import { pickDistractors, tooClose } from '../assets/distractors.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/index.json'), 'utf8'));
const clusters = index.clusters.map((id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/clusters', id + '.json'), 'utf8')));
const idx = buildIndex({ clusters }, []);
const W = (id) => idx.byId[id];
let seed = 7;
const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

const flags = [];
idx.words.forEach((w) => {
  for (let k = 0; k < 10; k++) {
    pickDistractors(w, idx, 3, rng).forEach((id) => { if (tooClose(w, W(id))) flags.push(`m2w ${w.id}: nhiễu ${id} quá gần`); });
  }
});
let nEx = 0;
clusters.forEach((c) => (c.exercises || []).forEach((ex) => {
  nEx++;
  const map = (o) => mapOptionToId(o, idx, ex.targets);
  if (ex.type === 'tc') {
    ex.blanks.forEach((b, i) => {
      const a = map(b.answer);
      if (!a) return;
      b.options.filter((o) => o !== b.answer).forEach((o) => {
        const id = map(o);
        if (id && id !== a && tooClose(W(a), W(id), true)) flags.push(`${ex.id} (TC chỗ ${i + 1}): đáp án ${b.answer} ~ ${o}`);
      });
    });
  } else {
    const as = ex.answers.map(map).filter(Boolean);
    ex.options.filter((o) => !ex.answers.includes(o)).forEach((o) => {
      const id = map(o);
      as.forEach((a) => { if (id && id !== a && tooClose(W(a), W(id), true)) flags.push(`${ex.id} (SE): đáp án ${W(a).word} ~ ${o}`); });
    });
  }
}));
const reviewed = new Set(fs.readFileSync(path.join(ROOT, 'scripts/ambiguity-reviewed.txt'), 'utf8').split('\n').map((x) => x.trim()).filter(Boolean));
const fresh = flags.filter((f) => !reviewed.has(f));
console.log(`${idx.words.length} từ, ${nEx} câu TC/SE. Bị báo: ${flags.length} (đã đọc lại: ${flags.length - fresh.length}, mới: ${fresh.length})`);
fresh.forEach((f) => console.log('  ' + f));
process.exitCode = fresh.length ? 1 : 0;
