// Hiển thị dùng chung cho câu GRE (đợt bài tập 01): độ khó, kỹ năng, nhãn nhóm liên quan, khung "Các từ trong câu này",
// màn "Từ vựng cần biết cho bộ bài này", khung ôn nhanh một nhóm và khung chi tiết từ (mở trên trang đang làm, không rời phiên).
import { App, S, esc, actions, word, stateOf, posLabel, stars, setSetting, statusTag } from '../state.js';
import { DIFFICULTY, SKILLS, vocabNeeded } from '../bank.js';
import { openModal } from './content.js';
import { wordDetail } from './common.js';

const ROMAN = ['i', 'ii', 'iii'];
const MW = (w) => 'https://www.merriam-webster.com/dictionary/' + encodeURIComponent(String(w).trim().toLowerCase().replace(/^(a|an|the)\s+/, ''));

/** Độ khó trước khi làm: ba chấm tô theo mức kèm chữ. */
export function difficultyHtml(ex) {
  const d = ex && ex.difficulty;
  if (!DIFFICULTY[d]) return '';
  return '<span class="diff diff-' + d + '" title="Độ khó: ' + DIFFICULTY[d] + '"><span class="dots" aria-hidden="true">' +
    [1, 2, 3].map((k) => '<i class="' + (k <= d ? 'on' : '') + '"></i>').join('') + '</span><span>' + DIFFICULTY[d] + '</span></span>';
}

/** Nhãn kỹ năng (chỉ hiện SAU khi chấm, vì có thể gợi ý cách giải). */
export function skillsHtml(ex) {
  const list = ((ex && ex.skills) || []).filter((k) => SKILLS[k]);
  if (!list.length) return '';
  return '<div class="skills-line"><span class="muted small">Kỹ năng:</span> ' + list.map((k) => '<span class="skill" title="' + esc(SKILLS[k].desc) + '">' + esc(SKILLS[k].label) + '</span>').join('') + '</div>';
}

/** Dòng nhãn nhóm liên quan trên một câu (chỉ ở Luyện tập; không lộ tên từ). Nhóm thuộc cụm khác có ký hiệu ↗ kèm chữ "cụm khác". */
export function groupLabelsHtml(ex) {
  const gs = ((ex && ex.relatedGroups) || []).map((g) => App.idx.groupById[g]).filter(Boolean);
  if (!gs.length) return '';
  return '<div class="glabels" aria-label="Nhóm từ liên quan"><span class="muted small">Nhóm liên quan:</span>' + gs.map((g) => {
    const other = g.clusterId !== ex.clusterId;
    const ct = (App.idx.clusterById[g.clusterId] || {}).title || '';
    return '<span class="gchip' + (other ? ' other' : '') + '"' + (other ? ' title="Nhóm thuộc cụm ' + esc(ct) + '"' : '') + '>' +
      (other ? '<span aria-hidden="true">↗ </span>' : '') + esc(g.title) + (other ? ' <small>(cụm khác: ' + esc(ct) + ')</small>' : '') + '</span>';
  }).join('') + '</div>';
}

const STATUS_TEXT = { new: ['Chưa học', 'st-new'], learning: ['Đang học', 'st-learning'], leech: ['Đang học', 'st-learning'], known: ['Đã thuộc', 'st-known'] };
function statusPill(id) {
  const st = S.statusOf(stateOf(id));
  const [t, cls] = STATUS_TEXT[st] || STATUS_TEXT.new;
  return '<span class="wstat ' + cls + '">' + t + '</span>';
}

/**
 * Khung "Các từ trong câu này": mỗi phương án một dòng (từ, nghĩa, nhóm, trạng thái học); bấm từ mở chi tiết.
 * Từ ngoài web: "Chưa có trên web" kèm link Merriam-Webster. opts.collapsed: dùng <details> (màn kết quả có nhiều câu).
 */
export function wordsInQuestionHtml(ex, opts = {}) {
  if (!ex) return '';
  const answers = new Set(ex.type === 'se' ? ex.answers : ex.blanks.map((b) => b.answer));
  const groups = ex.type === 'se' ? [ex.options] : ex.blanks.map((b) => b.options);
  const map = ex.optionMap || {};
  const row = (o) => {
    const id = map[o];
    const w = id && word(id);
    const ans = answers.has(o) ? '<span class="wq-ans" title="Đáp án">✓</span>' : '<span class="wq-ans"></span>';
    if (!w) {
      return '<li class="wq-row outside">' + ans + '<span class="wq-word">' + esc(o) + '</span><span class="wq-mean muted">Chưa có trên web · <a href="' + MW(o) +
        '" target="_blank" rel="noopener">Merriam-Webster ↗</a></span></li>';
    }
    const g = App.idx.groupById[w.group];
    const same = w.word.toLowerCase() === String(o).toLowerCase();
    return '<li class="wq-row">' + ans + '<button class="wq-word linkish" data-act="gv-word" data-id="' + esc(w.id) + '">' + esc(o) + (same ? '' : ' <small class="muted">(' + esc(w.word) + ')</small>') + '</button>' +
      '<span class="wq-mean">' + esc(w.meaning) + '<span class="wq-meta">' + (g ? '<span class="muted">' + esc(g.title) + '</span>' : '') + statusPill(w.id) + '</span></span></li>';
  };
  const body = groups.map((opts2, b) => (groups.length > 1 ? '<li class="wq-blank">Chỗ trống (' + ROMAN[b] + ')</li>' : '') + opts2.map(row).join('')).join('');
  const list = '<ul class="wq-list">' + body + '</ul>';
  if (opts.collapsed) return '<details class="wq"><summary>Các từ trong câu này</summary>' + list + '</details>';
  return '<section class="wq" aria-label="Các từ trong câu này"><h3 class="wq-h">Các từ trong câu này</h3>' + list + '</section>';
}

/**
 * Màn "Từ vựng cần biết cho bộ bài này". exercises: các câu của bộ bài.
 * opts: {title, intro, startAct, startLabel, backAct, backLabel, note}
 */
export function vocabIntroHtml(exercises, opts = {}) {
  const v = vocabNeeded(exercises, App.idx, App.progress);
  let h = '<div class="page-head"><h1>' + esc(opts.title || 'Từ vựng cần biết cho bộ bài này') + '</h1><p>' +
    (opts.intro || (exercises.length + ' câu. Các nhóm từ dưới đây xuất hiện trong phương án của các câu; ôn nhanh nhóm bạn còn yếu trước khi làm.')) + '</p></div>';
  if (opts.note) h += '<div class="notice">' + opts.note + '</div>';
  // nút bắt đầu ở đầu trang: danh sách nhóm có thể dài, không bắt cuộn hết mới bắt đầu được
  h += '<div class="vn-top"><button class="btn primary" data-act="' + opts.startAct + '">' + esc(opts.startLabel || 'Bắt đầu') + '</button>' +
    '<span class="muted small">' + v.groups.length + ' nhóm' + (v.outside.length ? ' · ' + v.outside.length + ' từ ngoài web' : '') + '</span></div>';
  if (v.groups.length) {
    h += '<ul class="vn-list">' + v.groups.map((g) => {
      const pct = g.total ? Math.round(100 * g.learned / g.total) : 0;
      return '<li class="vn-item"><div class="vn-main"><b>' + esc(g.title) + '</b><span class="muted small">' + esc(g.clusterTitle) + '</span></div>' +
        '<div class="vn-stats"><span><b>' + g.nEx + '</b> câu dùng tới</span><span>Đã học <b>' + g.learned + '</b>/' + g.total + ' từ</span>' +
        '<span class="vn-bar" aria-hidden="true"><span style="width:' + pct + '%"></span></span></div>' +
        '<button class="btn small-btn" data-act="gv-group" data-id="' + esc(g.id) + '">Ôn nhanh nhóm này</button></li>';
    }).join('') + '</ul>';
  } else {
    h += '<p class="muted">Các câu này không dùng nhóm từ nào trên web.</p>';
  }
  if (v.outside.length) {
    h += '<h2 class="section">Từ ngoài web (' + v.outside.length + ')</h2><p class="muted small" style="margin-top:0">Các phương án này chưa có trên web; tra nhanh trên Merriam-Webster nếu chưa chắc nghĩa.</p>' +
      '<p class="vn-outside">' + v.outside.map((w) => '<a href="' + MW(w) + '" target="_blank" rel="noopener">' + esc(w) + '</a>').join('') + '</p>';
  }
  h += '<div class="form-grid" style="margin-top:18px"><label class="check-row"><input type="checkbox" id="gv-skip"' + (App.settings.skipVocabIntro ? ' checked' : '') + '><span>Không hiện lại màn này <span class="muted small">(bật lại trong Cài đặt)</span></span></label>' +
    '<button class="btn primary big" data-act="' + opts.startAct + '">' + esc(opts.startLabel || 'Bắt đầu') + ' <kbd>Enter</kbd></button>' +
    (opts.backAct ? '<button class="btn big" data-act="' + opts.backAct + '">' + esc(opts.backLabel || 'Quay lại') + '</button>' : '') + '</div>';
  return h;
}

/** Khung ôn nhanh một nhóm: danh sách từ (nghĩa, sắc thái ngắn, trạng thái của tôi). Đóng lại thì về đúng màn đang xem. */
function openGroup(gid) {
  const g = App.idx.groupById[gid];
  if (!g) return;
  const ws = App.idx.words.filter((w) => w.group === gid).sort((a, b) => (a.level || 0) - (b.level || 0) || a.fileIndex - b.fileIndex);
  const ct = (App.idx.clusterById[g.clusterId] || {}).title || '';
  openModal(g.title + ' · ' + ct, () => (g.note ? '<p class="muted small" style="margin-top:0">' + esc(g.note) + '</p>' : '') +
    '<ul class="gq-list">' + ws.map((w) => '<li><div class="gq-head"><button class="linkish w-word" data-act="gv-word" data-id="' + esc(w.id) + '">' + esc(w.word) + '</button>' +
      '<span class="pos">' + esc(posLabel(w.pos)) + '</span>' + stars(w.priority) + (g.scale && w.level ? '<span class="muted small">mức ' + w.level + '/4</span>' : '') + statusPill(w.id) + '</div>' +
      '<div>' + esc(w.meaning) + '</div>' + (w.nuance ? '<div class="muted small">' + esc(w.nuance) + '</div>' : '') + '</li>').join('') + '</ul>');
}

/** Chi tiết một từ trong khung (không rời phiên ôn / bài đang làm). */
function openWord(id) {
  const w = word(id);
  if (!w) return;
  const g = App.idx.groupById[w.group];
  openModal(w.word, () => '<div class="word-sub" style="margin-bottom:8px"><span class="pos">' + esc(posLabel(w.pos)) + '</span>' + stars(w.priority) + statusTag(w.id) +
    (g ? '<span class="muted small">' + esc(g.title) + ' · ' + esc((App.idx.clusterById[g.clusterId] || {}).title || '') + '</span>' : '') + '</div>' +
    '<div class="meaning-big" style="font-size:18px">' + esc(w.meaning) + '</div>' + wordDetail(w, false));
}

Object.assign(actions, {
  'gv-group': (t) => openGroup(t.dataset.id),
  'gv-word': (t) => openWord(t.dataset.id)
});

document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'gv-skip') setSetting('skipVocabIntro', e.target.checked);
});

