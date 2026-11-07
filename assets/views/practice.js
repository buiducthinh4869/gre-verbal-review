// Trang Luyện tập: chọn phạm vi (nhiều cụm, một nhóm, chỉ ★★★, chỉ sổ từ hay quên) và dạng bài.
// Dạng GRE chuẩn có thêm bộ lọc dạng câu, độ khó, kỹ năng, chỉ câu mới, "có dùng nhóm…", và bảng Ngân hàng câu hỏi.
import { App, S, esc, views, actions, render, toast, setSetting, switchHtml, heldIds, practiceExercises } from '../state.js';
import { KINDS, KIND_SHORT, DIFFICULTY, SKILLS, filterExercises, bankTable } from '../bank.js';
import { startSession } from './session.js';

const visibleClusters = () => App.idx.clusters.filter((c) => !c.custom || App.customWords.length);
/** Cụm đang chọn (mảng rỗng = tất cả các cụm). */
const inClusters = (cid) => !App.practice.clusters.length || App.practice.clusters.includes(cid);

export function scopeWords(P = App.practice) {
  return App.idx.words.filter((w) => (!P.clusters.length || P.clusters.includes(w.clusterId)) && (P.group === 'all' || w.group === P.group) &&
    (!P.p3 || w.priority === 3) && (!P.leech || S.isLeech(App.progress[w.id])));
}
/** Dạng GRE chuẩn: bài có ít nhất một từ trong targets thuộc phạm vi đã chọn (bỏ câu đang giữ cho đề thi thử chưa làm). */
function scopeExercises(words) {
  const ids = new Set(words.map((w) => w.id));
  return practiceExercises().filter((ex) => (ex.targets || []).some((t) => ids.has(t)));
}
/** Câu GRE thỏa mọi điều kiện (phạm vi + bộ lọc phân loại). */
export function filteredExercises() {
  const P = App.practice;
  return filterExercises(scopeExercises(scopeWords()), { kinds: P.kinds, diffs: P.diffs, skills: P.skills, onlyNew: P.onlyNew, group: P.useGroup });
}
function scopeScales() {
  const P = App.practice;
  const ids = new Set(scopeWords().map((w) => w.group));
  return Object.values(App.idx.groupById).filter((g) => g.scale && inClusters(g.clusterId) &&
    (P.group === 'all' || g.id === P.group) && ids.has(g.id) && App.idx.words.some((w) => w.group === g.id));
}

const chip = (act, id, on, label, extra) => '<button class="chip" data-act="' + act + '" data-id="' + esc(String(id)) + '" aria-pressed="' + !!on + '"' + (extra || '') + '>' + label + '</button>';

function greFilters(P) {
  const groups = [];
  App.idx.clusters.filter((c) => !c.custom).forEach((c) => c.groups.forEach((g) => groups.push({ id: g.id, title: g.title, cluster: c.title })));
  let h = '<fieldset class="gre-filters"><legend>Lọc câu GRE</legend>';
  h += '<div class="field"><span class="label" id="pk-l">Dạng câu</span><div class="chips-wrap" role="group" aria-labelledby="pk-l">' +
    chip('p-kind', 'all', !P.kinds.length, 'Tất cả') + KINDS.map((k) => chip('p-kind', k, P.kinds.includes(k), KIND_SHORT[k])).join('') + '</div></div>';
  h += '<div class="field"><span class="label" id="pd-l">Độ khó</span><div class="chips-wrap" role="group" aria-labelledby="pd-l">' +
    chip('p-diff', 'all', !P.diffs.length, 'Tất cả') + [1, 2, 3].map((d) => chip('p-diff', d, P.diffs.includes(d), '<span class="diff diff-' + d + '"><span class="dots" aria-hidden="true">' +
      [1, 2, 3].map((k) => '<i class="' + (k <= d ? 'on' : '') + '"></i>').join('') + '</span>' + DIFFICULTY[d] + '</span>')).join('') + '</div></div>';
  h += '<div class="field"><span class="label" id="ps-l">Kỹ năng <span class="muted small">(chọn nhiều; câu có ít nhất một kỹ năng đã chọn)</span></span><div class="chips-wrap" role="group" aria-labelledby="ps-l">' +
    chip('p-skill', 'all', !P.skills.length, 'Tất cả') + Object.keys(SKILLS).map((k) => chip('p-skill', k, P.skills.includes(k), esc(SKILLS[k].label), ' title="' + esc(SKILLS[k].desc) + '"')).join('') + '</div></div>';
  h += '<div class="field"><label for="pusegroup">Có dùng nhóm…</label><select class="input" id="pusegroup"><option value="all">Bất kỳ nhóm nào</option>' +
    groups.map((g) => '<option value="' + g.id + '"' + (P.useGroup === g.id ? ' selected' : '') + '>' + esc(g.cluster) + ' › ' + esc(g.title) + '</option>').join('') + '</select>' +
    '<div class="help">Câu có phương án (đáp án hoặc phương án nhiễu) thuộc nhóm này.</div></div>';
  h += '<div class="switch-row"><div class="t"><b>Chỉ câu mới</b><span>Câu thêm trong các đợt bài tập (không phải bộ câu gốc)</span></div>' + switchHtml('pnew', P.onlyNew, 'Chỉ câu mới') + '</div>';
  return h + '</fieldset>';
}

function bankHtml() {
  const b = bankTable(App.idx);
  const cell = (n) => '<td class="num' + (n ? '' : ' zero') + '">' + n + '</td>';
  return '<details class="bank"' + (App.practice.bankOpen ? ' open' : '') + ' id="pbank"><summary>Ngân hàng câu hỏi: <b>' + b.total.total + ' câu</b></summary>' +
    '<div class="table-wrap"><table class="mock-table bank-table"><thead><tr><th>Cụm</th><th>TC1</th><th>TC2</th><th>TC3</th><th>SE</th><th>Tổng</th></tr></thead><tbody>' +
    b.rows.map((r) => '<tr' + (r.total < 10 ? ' class="few"' : '') + '><td>' + esc(r.title) + '</td>' + cell(r.tc1) + cell(r.tc2) + cell(r.tc3) + cell(r.se) + '<td class="num"><b>' + r.total + '</b></td></tr>').join('') +
    '<tr class="total"><td>Tổng</td>' + cell(b.total.tc1) + cell(b.total.tc2) + cell(b.total.tc3) + cell(b.total.se) + '<td class="num">' + b.total.total + '</td></tr></tbody></table></div>' +
    '<p class="muted small">TC1/TC2/TC3: Text Completion 1, 2, 3 chỗ trống; SE: Sentence Equivalence. Cụm in nghiêng có dưới 10 câu.</p></details>';
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
    const greScope = scopeExercises(words).length;
    const greN = filteredExercises().length;
    const avail = { w2m: words.length, m2w: words.length, gre: greN, scale: scopeScales().length };
    if (!avail[P.mode] && !(P.mode === 'gre' && greScope)) P.mode = ['w2m', 'gre', 'scale'].find((m) => avail[m]) || 'w2m';
    const modeOpt = (id, title, desc, n) => '<label class="mode"><input type="radio" name="pmode" value="' + id + '"' + (P.mode === id ? ' checked' : '') + (avail[id] || (id === 'gre' && greScope) ? '' : ' disabled') + '>' +
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
    h += '<p class="scope-line">Phạm vi hiện có <b>' + words.length + ' từ</b> và <b>' + greScope + ' câu GRE</b>.</p>';
    h += '<div class="field"><span class="label">Dạng bài</span><div class="modes" role="radiogroup">' +
      modeOpt('w2m', 'Từ → Nghĩa', 'Tự nhớ nghĩa rồi tự chấm', avail.w2m + ' từ') +
      modeOpt('m2w', 'Nghĩa → Từ', 'Trắc nghiệm 4 phương án, bẫy sắc thái và mức độ', avail.m2w + ' từ') +
      modeOpt('gre', 'GRE chuẩn', 'Text Completion và Sentence Equivalence có từ trong phạm vi', greScope + ' câu') +
      modeOpt('scale', 'Xếp thang mức độ', 'Sắp từ nhẹ đến mạnh', avail.scale + ' thang') + '</div></div>';
    if (P.mode === 'gre') {
      h += greFilters(P);
      h += '<p class="scope-line match-line" role="status"><b>' + greN + ' câu</b> thỏa điều kiện' + (greN < greScope ? ' (trên ' + greScope + ' câu trong phạm vi)' : '') + '.</p>';
    }
    if (P.mode !== 'scale') {
      h += '<div class="field"><span class="label">Số câu</span><div class="seg" role="group">' + [['10', '10'], ['20', '20'], ['all', 'Tất cả']].map((x) =>
        '<button class="chip" data-act="p-count" data-id="' + x[0] + '" aria-pressed="' + (P.count === x[0]) + '">' + x[1] + '</button>').join('') + '</div></div>';
    }
    h += '<div class="switch-row"><div class="t"><b>Chế độ thi</b><span>Không gợi ý, không tự nghĩ trước, ~1 phút mỗi câu GRE, giải thích ở cuối</span></div>' + switchHtml('pexam', !!App.settings.examMode, 'Chế độ thi') + '</div>';
    h += '<button class="btn primary big" data-act="start-practice"' + (avail[P.mode] ? '' : ' disabled') + '>Bắt đầu luyện tập</button>';
    if (!words.length) h += '<p class="muted small" style="margin:0">Phạm vi này chưa có từ nào. Bỏ bớt điều kiện để luyện tập.</p>';
    else if (P.mode === 'gre' && !greN) h += '<p class="muted small" style="margin:0">Không có câu nào thỏa mọi điều kiện. Bỏ bớt bộ lọc để luyện tập.</p>';
    const nHeld = heldIds().size;
    if (nHeld) h += '<p class="muted small held-note">' + nHeld + ' câu đang được giữ cho đề thi thử bạn chưa làm. Làm xong đề ở mục <a href="#mock">Thi thử</a> thì các câu này quay lại luyện tập.</p>';
    h += bankHtml();
    return h + '</div>';
  }
};

function startPractice() {
  const P = App.practice;
  const n = P.count === 'all' ? 9999 : Number(P.count);
  let cards;
  if (P.mode === 'gre') cards = S.shuffle(filteredExercises()).slice(0, n).map((ex) => ({ type: 'gre', exId: ex.id }));
  else if (P.mode === 'scale') cards = S.shuffle(scopeScales()).map((g) => ({ type: 'scale', groupId: g.id }));
  else cards = S.shuffle(scopeWords()).slice(0, n).map((w) => ({ type: P.mode, wordId: w.id }));
  if (!cards.length) { toast('Phạm vi này chưa có bài.'); return; }
  startSession('practice', cards, { from: 'practice', title: 'Luyện tập' });
}

/** Bật / tắt một giá trị trong bộ lọc nhiều lựa chọn ('all' = bỏ lọc). */
function toggleIn(key, id, all) {
  const P = App.practice;
  if (id === 'all') P[key] = [];
  else if (P[key].includes(id)) P[key] = P[key].filter((x) => x !== id);
  else P[key] = P[key].concat([id]);
  if (all && P[key].length === all) P[key] = [];
}
function renderKeep(sel) {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
  const b = document.querySelector(sel);
  if (b) b.focus({ preventScroll: true });
}

Object.assign(actions, {
  'p-count': (t) => { App.practice.count = t.dataset.id; renderKeep('[data-act="p-count"][data-id="' + t.dataset.id + '"]'); },
  'p-cluster': (t) => {
    toggleIn('clusters', t.dataset.id, visibleClusters().length);
    renderKeep('[data-act="p-cluster"][data-id="' + t.dataset.id + '"]');
  },
  'p-kind': (t) => { toggleIn('kinds', t.dataset.id, KINDS.length); renderKeep('[data-act="p-kind"][data-id="' + t.dataset.id + '"]'); },
  'p-diff': (t) => { toggleIn('diffs', t.dataset.id === 'all' ? 'all' : Number(t.dataset.id), 3); renderKeep('[data-act="p-diff"][data-id="' + t.dataset.id + '"]'); },
  'p-skill': (t) => { toggleIn('skills', t.dataset.id, Object.keys(SKILLS).length); renderKeep('[data-act="p-skill"][data-id="' + t.dataset.id + '"]'); },
  'start-practice': () => startPractice()
});

document.addEventListener('change', (e) => {
  if (App.view !== 'practice') return;
  const t = e.target;
  if (t.id === 'pgroup') { App.practice.group = t.value; render(); }
  else if (t.id === 'pusegroup') { App.practice.useGroup = t.value; renderKeep('#pusegroup'); }
  else if (t.id === 'pp3') { App.practice.p3 = t.checked; render(); }
  else if (t.id === 'pleech') { App.practice.leech = t.checked; render(); }
  else if (t.id === 'pnew') { App.practice.onlyNew = t.checked; renderKeep('#pnew'); }
  else if (t.id === 'pexam') setSetting('examMode', t.checked);
  else if (t.name === 'pmode') { App.practice.mode = t.value; render(); }
});
document.addEventListener('toggle', (e) => { if (e.target && e.target.id === 'pbank') App.practice.bankOpen = e.target.open; }, true);
