// Test sinh phương án nhiễu (assets/distractors.js). Bắt buộc theo đặc tả: laud lấy commend, tout trước; venerate không có revere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Srs, idx, vocab, seq } from './fixture.js';

/* ---------------- Phương án nhiễu ---------------- */

test('laud: phương án nhiễu lấy commend và tout trước', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const d = Srs.pickDistractors(idx.byId.laud, idx, 3, seq(seed));
    assert.equal(d.length, 3);
    assert.deepEqual(d.slice(0, 2), ['commend', 'tout']);
    assert.ok(!d.includes('laud'));
  }
});

test('venerate: không bao giờ có revere (nghĩa giống hệt)', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const d = Srs.pickDistractors(idx.byId.venerate, idx, 3, seq(seed));
    assert.ok(!d.includes('revere'), `seed ${seed}: ${d}`);
    assert.equal(d[0], 'lionize');
    assert.equal(new Set(d).size, 3);
  }
});

test('phương án nhiễu cùng hướng nghĩa, không trùng, không cùng dòng từ', () => {
  const praise = new Set(['praise-verbs', 'praise-special', 'praise-nouns', 'praise-adj', 'lukewarm', 'excess', 'flattery']);
  idx.words.forEach((w) => {
    for (let seed = 1; seed <= 5; seed++) {
      const d = Srs.pickDistractors(w, idx, 3, seq(seed));
      assert.equal(d.length, 3, w.id);
      assert.equal(new Set(d).size, 3, w.id);
      d.forEach((id) => {
        const c = idx.byId[id];
        assert.notEqual(c.meaning, w.meaning, `${w.id} vs ${id}`);
        assert.equal(praise.has(c.group), praise.has(w.group), `${w.id} lấy từ khác hướng: ${id}`);
        if (!w.confusables.includes(id) && !c.confusables.includes(w.id)) {
          assert.ok(!Srs.sameFamily(w, c), `${w.id} cùng dòng từ với ${id}`);
        }
      });
    }
  });
});

test('nhóm thang: ưu tiên level gần nhất', () => {
  // castigate (reprove, level 4): confusable censure; rồi cùng nhóm level 4 (berate, chastise)
  for (let seed = 1; seed <= 20; seed++) {
    const d = Srs.pickDistractors(idx.byId.castigate, idx, 3, seq(seed));
    assert.equal(d[0], 'censure');
    assert.deepEqual(d.slice(1).sort(), ['berate', 'chastise']);
  }
});

test('laud không lấy laudable/laudatory làm phương án nhiễu (cùng dòng từ)', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const d = Srs.pickDistractors(idx.byId.laud, idx, 3, seq(seed));
    assert.ok(!d.includes('laudable') && !d.includes('laudatory'));
  }
});


test('mọi từ đều có đủ 3 phương án nhiễu khác nhau, không trùng nghĩa với từ đúng', () => {
  idx.words.forEach((w) => {
    const d = Srs.pickDistractors(w, idx, 3, seq(7));
    assert.equal(new Set([w.id, ...d]).size, 4, w.id);
  });
});
