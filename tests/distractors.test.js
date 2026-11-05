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

test('phương án nhiễu cùng hướng nghĩa (theo direction của nhóm), không trùng, không cùng dòng từ', () => {
  const dir = (w) => Srs.groupDirection(idx.groupById[w.group]);
  idx.words.forEach((w) => {
    for (let seed = 1; seed <= 5; seed++) {
      const d = Srs.pickDistractors(w, idx, 3, seq(seed));
      assert.equal(d.length, 3, w.id);
      assert.equal(new Set(d).size, 3, w.id);
      d.forEach((id) => {
        const c = idx.byId[id];
        assert.notEqual(c.meaning, w.meaning, `${w.id} vs ${id}`);
        const conf = w.confusables.includes(id) || c.confusables.includes(w.id);
        if (!conf) assert.ok(Srs.directionsMatch(dir(w), dir(c)), `${w.id} (${dir(w)}) lấy từ khác hướng: ${id} (${dir(c)})`);
        if (!conf) {
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

test('parsimonious: ưu tiên frugal, miserly (confusables, cùng nhóm); revere không có venerate', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const d = Srs.pickDistractors(idx.byId.parsimonious, idx, 3, seq(seed));
    const pref = idx.byId.parsimonious.confusables.concat(idx.reverseConf.parsimonious || []);
    assert.ok(d.includes('frugal') && d.includes('miserly'), `seed ${seed}: ${d}`);
    assert.ok(d.every((id) => pref.includes(id) || idx.byId[id].group === idx.byId.parsimonious.group), `seed ${seed}: ${d}`);
    const r = Srs.pickDistractors(idx.byId.revere, idx, 3, seq(seed));
    assert.ok(!r.includes('venerate'), `seed ${seed}: ${r}`);
  }
});

test('neutral hợp với mọi hướng; nhóm không rõ hướng không khớp', () => {
  assert.ok(Srs.directionsMatch('positive', 'neutral') && Srs.directionsMatch('neutral', 'negative'));
  assert.ok(!Srs.directionsMatch('positive', 'negative'));
  assert.ok(!Srs.directionsMatch('', 'positive'));
  assert.equal(Srs.groupDirection({ id: 'praise-verbs' }), '', 'không còn đoán theo tên nhóm');
});

test('mọi nhóm trong dữ liệu có direction hợp lệ', () => {
  Object.values(idx.groupById).filter((g) => g.clusterId !== 'custom').forEach((g) => {
    assert.ok(['positive', 'negative', 'neutral'].includes(g.direction), g.id);
  });
});
