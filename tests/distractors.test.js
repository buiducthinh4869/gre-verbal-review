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

test('nhóm thang: không lấy từ cùng mức (castigate không có berate, chastise; excoriate không có lambaste)', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const d = Srs.pickDistractors(idx.byId.castigate, idx, 3, seq(seed));
    assert.ok(!d.includes('berate') && !d.includes('chastise'), `seed ${seed}: ${d}`);
    const e = Srs.pickDistractors(idx.byId.excoriate, idx, 3, seq(seed));
    assert.ok(!e.includes('lambaste'), `seed ${seed}: ${e}`);
  }
});

test('mọi từ: không phương án nhiễu nào quá gần nghĩa đáp án (tooClose), đủ 3 phương án', () => {
  idx.words.forEach((w) => {
    for (let seed = 1; seed <= 5; seed++) {
      const d = Srs.pickDistractors(w, idx, 3, seq(seed));
      assert.equal(d.length, 3, w.id);
      d.forEach((id) => assert.ok(!Srs.tooClose(w, idx.byId[id]), `${w.id} lấy ${id}`));
    }
  });
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

test('confusable cùng mức trong cùng nhóm không được làm nhiễu; revere không có venerate', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const r = Srs.pickDistractors(idx.byId.revere, idx, 3, seq(seed));
    assert.ok(!r.includes('venerate'), `seed ${seed}: ${r}`);
  }
  assert.ok(Srs.tooClose(idx.byId.excoriate, idx.byId.lambaste));
  assert.ok(!Srs.tooClose(idx.byId.laud, idx.byId.commend)); // cùng thang, cách 2 mức
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
