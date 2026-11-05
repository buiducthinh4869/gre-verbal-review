// Trang Luyện tập: chọn phạm vi (nhiều cụm, một nhóm, chỉ ★★★, chỉ sổ từ hay quên) và dạng bài.
import { App, S, esc, views, actions, render, toast, setSetting, switchHtml } from '../state.js';
import { startSession } from './session.js';

const visibleClusters = () => App.idx.clusters.filter((c) => !c.custom || App.customWords.length);
/** Cụm đang chọn (mảng rỗng = tất cả các cụm). */
const inClusters = (cid) => !App.practice.clusters.length || App.practice.clusters.includes(cid);

export function scopeWords(P = App.practice) {
  return App.idx.words.filter((w) => (!P.clusters.length || P.clusters.includes(w.clusterId)) && (P.group === 'all' || w.group === P.group) &&
    (!P.p3 || w.priority === 3) && (!P.leech || S.isLeech(App.progress[w.id])));
}
/** Dạng GRE chuẩn: bài có ít nhất một từ trong targets thuộc phạm vi đã chọn. */
function scopeExercises(words) {
  const ids = new Set(words.map((w) => w.id));
  return App.idx.exercises.filter((ex) => (ex.targets || []).some((t) => ids.has(t)));
}
function scopeScales() {
  const P = App.practice;
  const ids = new Set(scopeWords().map((w) => w.group));
  return Object.values(App.idx.groupById).filter((g) => g.scale && inClusters(g.clusterId) &&
    (P.group === 'all' || g.id === P.group) && ids.has(g.id) && App.idx.words.some((w) => w.group === g.id));
}

views.practice = {
  title: 'Luyện tập',
  render() {
    const P = App.practice;
    const clusters = visibleClusters();
    P.clusters = P.clusters.filter((id) => clusters.some((c) => c.id === id));
    let groups = [];
    clusters.forEach((c) => { if (inClusters(c.id)) groups = groups.concat(c.groups.map((g) => Object.assign({ clusterTitle: c.title }, g))); });
    if (P.group !== 'all' && !groups.some((g) => g.id === P.group)) P.group = 'all';
    const words = scopeWords();
    const avail = { w2m: words.length, m2w: words.length, gre: scopeExercises(words).length, scale: scopeScales().length };
    if (!avail[P.mode]) P.mode = ['w2m', 'gre', 'scale'].find((m) => avail[m]) || 'w2m';
    const modeOpt = (id, title, desc, n) => '<label class="mode"><input type="radio" name="pmode" value="' + id + '"' + (P.mode === id ? ' checked' : '') + (avail[id] ? '' : ' disabled') + '>' +
      '<span><b>' + title + '</b><span>' + desc + ' · ' + n + '</span></span></label>';
    let h = '<div class="page-head"><h1>Luyện tập</h1><p>Chọn phạm vi và dạng bài. Kết quả cũng được tính vào lịch ôn.</p></div><div class="form-grid">';
    h += '<div class="field"><span class="label" id="pcl-label">Cụm <span class="muted small">(chọn được nhiều cụm)</span></span><div class="chips-wrap" role="group" aria-labelledby="pcl-label">' +
      '<button class="chip" data-act="p-cluster" data-id="all" aria-pressed="' + !P.clusters.length + '">Tất cả</button>' +
      clusters.map((c) => '<button class="chip" data-act="p-cluster" data-id="' + c.id + '" aria-pressed="' + P.clusters.includes(c.id) + '">' + esc(c.title) + '</button>').join('') + '</div></div>';
    const multi = P.clusters.length !== 1;
    h += '<div class="field"><label for="pgroup">Nhóm</label><select class="input" id="pgroup"><option value="all">Mọi nhóm trong phạm vi</option>' +
      groups.map((g) => '<option value="' + g.id + '"' + (P.group === g.id ? ' selected' : '') + '>' + (multi ? esc(g.clusterTitle) + ' › ' : '') + esc(g.title) + (g.scale ? ' (thang)' : '') + '</option>').join('') + '</select></div>';
    const nLeech = App.idx.words.filter((w) => S.isLeech(App.progress[w.id])).length;
    h += '<div><div class="switch-row"><div class="t"><b>Chỉ từ ưu tiên ★★★</b><span>Những từ phải thuộc</span></div>' + switchHtml('pp3', P.p3, 'Chỉ từ ưu tiên ba sao') + '</div>' +
      '<div class="switch-row"><div class="t"><b>Chỉ sổ từ hay quên</b><span>' + (nLeech ? nLeech + ' từ trong sổ' : 'Sổ đang trống') + '</span></div>' + switchHtml('pleech', P.leech, 'Chỉ từ trong sổ từ hay quên') + '</div></div>';
    h += '<p class="scope-line">Phạm vi hiện có <b>' + words.length + ' từ</b> và <b>' + avail.gre + ' câu GRE</b>.</p>';
    h += '<div class="field"><span class="label">Dạng bài</span><div class="modes" role="radiogroup">' +
      modeOpt('w2m', 'Từ → Nghĩa', 'Tự nhớ nghĩa rồi tự chấm', avail.w2m + ' từ') +
      modeOpt('m2w', 'Nghĩa → Từ', 'Trắc nghiệm 4 phương án, bẫy sắc thái và mức độ', avail.m2w + ' từ') +
      modeOpt('gre', 'GRE chuẩn', 'Text Completion và Sentence Equivalence có từ trong phạm vi', avail.gre + ' câu') +
      modeOpt('scale', 'Xếp thang mức độ', 'Sắp từ nhẹ đến mạnh', avail.scale + ' thang') + '</div></div>';
    if (P.mode !== 'scale') {
      h += '<div class="field"><span class="label">Số câu</span><div class="seg" role="group">' + [['10', '10'], ['20', '20'], ['all', 'Tất cả']].map((x) =>
        '<button class="chip" data-act="p-count" data-id="' + x[0] + '" aria-pressed="' + (P.count === x[0]) + '">' + x[1] + '</button>').join('') + '</div></div>';
    }
    h += '<div class="switch-row"><div class="t"><b>Chế độ thi</b><span>Không gợi ý, không tự nghĩ trước, ~1 phút mỗi câu GRE, giải thích ở cuối</span></div>' + switchHtml('pexam', !!App.settings.examMode, 'Chế độ thi') + '</div>';
    h += '<button class="btn primary big" data-act="start-practice"' + (avail[P.mode] ? '' : ' disabled') + '>Bắt đầu luyện tập</button>';
    if (!words.length) h += '<p class="muted small" style="margin:0">Phạm vi này chưa có từ nào. Bỏ bớt điều kiện để luyện tập.</p>';
    return h + '</div>';
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
  'p-cluster': (t) => {
    const P = App.practice, id = t.dataset.id;
    if (id === 'all') P.clusters = [];
    else if (P.clusters.includes(id)) P.clusters = P.clusters.filter((x) => x !== id);
    else P.clusters = P.clusters.concat([id]);
    if (P.clusters.length === visibleClusters().length) P.clusters = [];
    render();
    const b = document.querySelector('[data-act="p-cluster"][data-id="' + id + '"]');
    if (b) b.focus();
  },
  'start-practice': () => startPractice()
});

document.addEventListener('change', (e) => {
  if (App.view !== 'practice') return;
  const t = e.target;
  if (t.id === 'pgroup') { App.practice.group = t.value; render(); }
  else if (t.id === 'pp3') { App.practice.p3 = t.checked; render(); }
  else if (t.id === 'pleech') { App.practice.leech = t.checked; render(); }
  else if (t.id === 'pexam') setSetting('examMode', t.checked);
  else if (t.name === 'pmode') { App.practice.mode = t.value; render(); }
});
