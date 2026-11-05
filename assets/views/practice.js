// Trang Luyện tập: chọn phạm vi (cụm, nhóm, chỉ ★★★) và dạng bài.
import { App, S, esc, views, actions, render, toast, setSetting, switchHtml } from '../state.js';
import { startSession } from './session.js';

function scopeWords() {
  const P = App.practice;
  return App.idx.words.filter((w) => (P.cluster === 'all' || w.clusterId === P.cluster) && (P.group === 'all' || w.group === P.group) && (!P.p3 || w.priority === 3));
}
function scopeExercises(words) {
  const ids = new Set(words.map((w) => w.id));
  return App.idx.exercises.filter((ex) => (ex.targets || []).some((t) => ids.has(t)));
}
function scopeScales() {
  const P = App.practice;
  return Object.values(App.idx.groupById).filter((g) => g.scale && (P.cluster === 'all' || g.clusterId === P.cluster) &&
    (P.group === 'all' || g.id === P.group) && App.idx.words.some((w) => w.group === g.id));
}

views.practice = {
  title: 'Luyện tập',
  render() {
    const P = App.practice;
    const clusters = App.idx.clusters.filter((c) => !c.custom || App.customWords.length);
    let groups = [];
    clusters.forEach((c) => { if (P.cluster === 'all' || P.cluster === c.id) groups = groups.concat(c.groups); });
    if (P.group !== 'all' && !groups.some((g) => g.id === P.group)) P.group = 'all';
    const words = scopeWords();
    const avail = { w2m: words.length, m2w: words.length, gre: scopeExercises(words).length, scale: scopeScales().length };
    if (!avail[P.mode]) P.mode = 'w2m';
    const modeOpt = (id, title, desc, n) => '<label class="mode"><input type="radio" name="pmode" value="' + id + '"' + (P.mode === id ? ' checked' : '') + (avail[id] ? '' : ' disabled') + '>' +
      '<span><b>' + title + '</b><span>' + desc + ' · ' + n + '</span></span></label>';
    let h = '<div class="page-head"><h1>Luyện tập</h1><p>Chọn phạm vi và dạng bài. Kết quả cũng được tính vào lịch ôn.</p></div><div class="form-grid">';
    h += '<div class="field"><label for="pcluster">Cụm</label><select class="input" id="pcluster"><option value="all">Tất cả các cụm</option>' +
      clusters.map((c) => '<option value="' + c.id + '"' + (P.cluster === c.id ? ' selected' : '') + '>' + esc(c.title) + '</option>').join('') + '</select></div>';
    h += '<div class="field"><label for="pgroup">Nhóm</label><select class="input" id="pgroup"><option value="all">Mọi nhóm</option>' +
      groups.map((g) => '<option value="' + g.id + '"' + (P.group === g.id ? ' selected' : '') + '>' + esc(g.title) + (g.scale ? ' (thang)' : '') + '</option>').join('') + '</select></div>';
    h += '<div class="switch-row"><div class="t"><b>Chỉ từ ưu tiên ★★★</b><span>Những từ phải thuộc</span></div>' + switchHtml('pp3', P.p3, 'Chỉ từ ưu tiên ba sao') + '</div>';
    h += '<div class="field"><span class="label">Dạng bài</span><div class="modes" role="radiogroup">' +
      modeOpt('w2m', 'Từ → Nghĩa', 'Tự nhớ nghĩa rồi tự chấm', avail.w2m + ' từ') +
      modeOpt('m2w', 'Nghĩa → Từ', 'Trắc nghiệm 4 phương án, bẫy sắc thái và mức độ', avail.m2w + ' từ') +
      modeOpt('gre', 'GRE chuẩn', 'Text Completion và Sentence Equivalence', avail.gre + ' câu') +
      modeOpt('scale', 'Xếp thang mức độ', 'Sắp từ nhẹ đến mạnh', avail.scale + ' thang') + '</div></div>';
    if (P.mode !== 'scale') {
      h += '<div class="field"><span class="label">Số câu</span><div class="seg" role="group">' + [['10', '10'], ['20', '20'], ['all', 'Tất cả']].map((x) =>
        '<button class="chip" data-act="p-count" data-id="' + x[0] + '" aria-pressed="' + (P.count === x[0]) + '">' + x[1] + '</button>').join('') + '</div></div>';
    }
    h += '<div class="switch-row"><div class="t"><b>Chế độ thi</b><span>Không gợi ý, không tự nghĩ trước, ~1 phút mỗi câu GRE, giải thích ở cuối</span></div>' + switchHtml('pexam', !!App.settings.examMode, 'Chế độ thi') + '</div>';
    h += '<button class="btn primary big" data-act="start-practice"' + (avail[P.mode] ? '' : ' disabled') + '>Bắt đầu luyện tập</button></div>';
    return h;
  }
};

function startPractice() {
  const P = App.practice;
  const n = P.count === 'all' ? 9999 : Number(P.count);
  let cards;
  if (P.mode === 'gre') cards = S.shuffle(scopeExercises(scopeWords())).slice(0, n).map((ex) => ({ type: 'gre', exId: ex.id }));
  else if (P.mode === 'scale') cards = S.shuffle(scopeScales()).map((g) => ({ type: 'scale', groupId: g.id }));
  else cards = S.shuffle(scopeWords()).slice(0, n).map((w) => ({ type: P.mode, wordId: w.id }));
  if (!cards.length) { toast('Phạm vi này chưa có bài.'); return; }
  startSession('practice', cards, { from: 'practice', title: 'Luyện tập' });
}

Object.assign(actions, {
  'p-count': (t) => { App.practice.count = t.dataset.id; render(); },
  'start-practice': () => startPractice()
});

document.addEventListener('change', (e) => {
  if (App.view !== 'practice') return;
  const t = e.target;
  if (t.id === 'pcluster') { App.practice.cluster = t.value; App.practice.group = 'all'; render(); }
  else if (t.id === 'pgroup') { App.practice.group = t.value; render(); }
  else if (t.id === 'pp3') { App.practice.p3 = t.checked; render(); }
  else if (t.id === 'pexam') setSetting('examMode', t.checked);
  else if (t.name === 'pmode') { App.practice.mode = t.value; render(); }
});
