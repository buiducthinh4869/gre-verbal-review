// Trang Từ vựng, ba cấp điều hướng bằng hash (nút Quay lại của trình duyệt đi đúng giữa các cấp):
//   #vocab                         lưới thẻ cụm
//   #vocab/<cụm>                   lưới thẻ nhóm của cụm, nút "Xem tất cả từ của cụm" (#vocab/<cụm>/all)
//   #vocab/<cụm>/<nhóm>[/<từ>]     danh sách từ của nhóm (giao diện danh sách như cũ), mở sẵn chi tiết <từ>
// Ô tìm kiếm ở mọi cấp: có chữ thì thay lưới bằng kết quả phẳng trên toàn bộ các cụm, kèm nhãn Cụm › Nhóm.
import { App, S, esc, views, actions, word, statusTag, stars, render, syncHash, go } from '../state.js';
import { fold } from '../render.js';
import { LS } from '../api.js';
import { wordDetail } from './common.js';

const ALL = 'all';
const DIR = {
  positive: { sym: '+', label: 'Khen', title: 'Sắc thái tích cực (khen)' },
  negative: { sym: '−', label: 'Chê', title: 'Sắc thái tiêu cực (chê)' },
  neutral: { sym: '○', label: 'Trung tính', title: 'Sắc thái trung tính' }
};
const STATUS_OPTS = [['all', 'Mọi trạng thái'], ['new', 'Chưa học'], ['learning', 'Đang học'], ['known', 'Đã thuộc'], ['leech', 'Hay quên']];
const PRIO_OPTS = [['all', 'Mọi mức'], ['3', '★★★ phải thuộc'], ['2', '★★ nên biết'], ['1', '★ lướt qua']];

const pathKey = () => 'gre.vocabPath.' + (App.user ? App.user.userId : '');
function visibleClusters() { return App.idx.clusters.filter((c) => !c.custom || App.customWords.length); }
const clusterWords = (cid) => App.idx.words.filter((w) => w.clusterId === cid);
const groupWords = (gid) => App.idx.words.filter((w) => w.group === gid);
const groupsOf = (c) => (c.groups || []).filter((g) => App.idx.words.some((w) => w.group === g.id));

/* ---------------- Đường dẫn ⇄ trạng thái ---------------- */

function enter(sub) {
  const V = App.vocab;
  const [c, g, w] = sub || [];
  V.c = c && App.idx.clusterById[c] ? c : null;
  V.all = !!V.c && g === ALL;
  const grp = !V.all && g ? App.idx.groupById[g] : null;
  V.g = V.c && grp && grp.clusterId === V.c ? g : null;
  V.open = (V.g || V.all) && w && word(w) ? w : null;
  if (!V.c) V.open = null;
  V.q = '';
  LS.set(pathKey(), path().slice(0, 2));
}

function path() {
  const V = App.vocab;
  if (!V.c) return [];
  const p = [V.c];
  if (V.all) p.push(ALL); else if (V.g) p.push(V.g);
  if (p.length === 2 && V.open) p.push(V.open);
  return p;
}

views.vocab = {
  title: 'Từ vựng',
  enter,
  path,
  restore() { enter(LS.get(pathKey(), [])); },
  wide() { return !App.vocab.g && !App.vocab.all && !App.vocab.q; },
  render() {
    const V = App.vocab;
    let h = head();
    h += '<div class="toolbar"><div class="search"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="m20 20-4.5-4.5M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"/></svg>' +
      '<input class="input" id="vq" type="search" placeholder="Tìm từ hoặc nghĩa (mọi cụm)" value="' + esc(V.q) + '" aria-label="Tìm kiếm trên mọi cụm" autocomplete="off"></div>';
    h += '<div class="filters"><select class="input" id="vprio" aria-label="Lọc theo mức ưu tiên">' +
      PRIO_OPTS.map((p) => '<option value="' + p[0] + '"' + (V.prio === p[0] ? ' selected' : '') + '>' + p[1] + '</option>').join('') + '</select>' +
      '<select class="input" id="vstatus" aria-label="Lọc theo trạng thái">' +
      STATUS_OPTS.map((s) => '<option value="' + s[0] + '"' + (V.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>').join('') + '</select></div></div>';
    return h + '<div id="vlist">' + body() + '</div>';
  },
  after() {
    const V = App.vocab;
    if (V.open && !V.q) {
      const el = document.getElementById('w-' + V.open);
      if (el) setTimeout(() => { el.scrollIntoView({ block: 'center' }); el.focus({ preventScroll: true }); }, 0);
    }
  }
};

/* ---------------- Đầu trang: tiêu đề hoặc thanh đường dẫn ---------------- */

function crumbs() {
  const V = App.vocab;
  const c = V.c && App.idx.clusterById[V.c];
  const items = [['#vocab', 'Từ vựng']];
  if (c) items.push(['#vocab/' + c.id, c.title]);
  if (c && V.g) items.push(['', App.idx.groupById[V.g].title]);
  else if (c && V.all) items.push(['', 'Tất cả từ']);
  return '<nav class="crumbs" aria-label="Đường dẫn"><ol>' + items.map((it, k) => {
    const last = k === items.length - 1;
    return '<li>' + (last ? '<span aria-current="page">' + esc(it[1]) + '</span>' : '<a href="' + it[0] + '">' + esc(it[1]) + '</a>') + '</li>';
  }).join('') + '</ol></nav>';
}

function head() {
  const V = App.vocab;
  if (!V.c) {
    const cs = visibleClusters();
    const nW = cs.reduce((n, c) => n + clusterWords(c.id).length, 0);
    return '<div class="page-head"><h1>Từ vựng</h1><p>' + cs.filter((c) => !c.custom).length + ' cụm chủ đề · ' + nW + ' từ. Chọn một cụm để xem các nhóm.</p></div>';
  }
  const c = App.idx.clusterById[V.c];
  if (V.g) {
    const g = App.idx.groupById[V.g];
    return crumbs() + '<div class="page-head"><h1>' + esc(g.title) + '</h1>' +
      '<div class="group-meta">' + dirBadge(g.direction) + (g.scale ? '<span class="scale-tag">Thang nhẹ → mạnh</span>' : '') +
      '<span class="muted small">' + groupWords(g.id).length + ' từ</span></div>' +
      (g.note ? '<p class="group-lead">' + esc(g.note) + '</p>' : '') + '</div>';
  }
  if (V.all) return crumbs() + '<div class="page-head"><h1>' + esc(c.title) + ': tất cả từ</h1><p>' + esc(c.description || '') + '</p></div>';
  return crumbs() + '<div class="page-head"><h1>' + esc(c.title) + '</h1><p>' + esc(c.description || '') + '</p></div>';
}

function dirBadge(d) {
  const x = DIR[d];
  if (!x) return '';
  return '<span class="dir dir-' + d + '" title="' + x.title + '"><b aria-hidden="true">' + x.sym + '</b>' + x.label + '</span>';
}

/* ---------------- Lọc ---------------- */

const filtersOn = () => App.vocab.prio !== 'all' || App.vocab.status !== 'all';
function passFilters(w) {
  const V = App.vocab;
  if (V.prio !== 'all' && String(w.priority) !== V.prio) return false;
  if (V.status !== 'all' && S.statusOf(App.progress[w.id]) !== V.status) return false;
  return true;
}
function matchesQuery(w, q) {
  return fold(w.word).includes(q) || fold(w.meaning).includes(q) || fold(w.id).includes(q);
}

/* ---------------- Thân trang theo cấp ---------------- */

function body() {
  const V = App.vocab;
  if (V.q.trim()) return searchResults();
  if (!V.c) return clusterCards();
  if (V.g) return groupList();
  if (V.all) return clusterList();
  return groupCards();
}

/** Thanh tiến độ nhỏ: đã thuộc / đang học / chưa học (của người đang đăng nhập). */
function miniProgress(words) {
  const n = { known: 0, learning: 0, new: 0, leech: 0 };
  words.forEach((w) => { n[S.statusOf(App.progress[w.id])]++; });
  const learning = n.learning + n.leech;
  const tot = words.length || 1;
  const seg = (k, v) => (v ? '<span class="mp-' + k + '" style="width:' + (100 * v / tot) + '%"></span>' : '');
  return {
    n,
    html: '<div class="mini-bar" role="img" aria-label="' + n.known + ' đã thuộc, ' + learning + ' đang học, ' + n.new + ' chưa học">' +
      seg('known', n.known) + seg('learning', learning) + '</div>' +
      '<div class="mini-legend"><span><i class="mp-known"></i>' + n.known + ' thuộc</span><span><i class="mp-learning"></i>' + learning + ' đang học</span><span><i class="mp-new"></i>' + n.new + ' chưa học</span></div>'
  };
}

function filterLine(words) {
  if (!filtersOn()) return { dim: false, html: '' };
  const k = words.filter(passFilters).length;
  return { dim: k === 0, html: '<div class="card-match">' + (k ? k + ' từ khớp bộ lọc' : 'Không có từ khớp bộ lọc') + '</div>' };
}

function clusterCards() {
  const cs = visibleClusters();
  return '<div class="cards">' + cs.map((c) => {
    const ws = clusterWords(c.id);
    const mp = miniProgress(ws);
    const fl = filterLine(ws);
    const nG = groupsOf(c).length;
    return '<a class="tcard' + (fl.dim ? ' dim' : '') + '" href="#vocab/' + encodeURIComponent(c.id) + '">' +
      '<span class="tc-top"><span class="tc-title">' + esc(c.title) + '</span><span class="tc-count">' + ws.length + ' từ</span></span>' +
      '<span class="tc-desc" title="' + esc(c.description || '') + '">' + esc(c.description || '') + '</span>' +
      '<span class="tc-meta"><span>' + nG + ' nhóm</span>' + (mp.n.leech ? '<span class="tag leech">! ' + mp.n.leech + ' hay quên</span>' : '') + '</span>' +
      mp.html + fl.html + '</a>';
  }).join('') + '</div>';
}

function groupCards() {
  const c = App.idx.clusterById[App.vocab.c];
  const all = clusterWords(c.id);
  let h = '<div class="row group-cards-head"><span class="muted small">' + groupsOf(c).length + ' nhóm · ' + all.length + ' từ</span><span class="spacer"></span>' +
    '<a class="btn" href="#vocab/' + encodeURIComponent(c.id) + '/all">Xem tất cả từ của cụm</a></div>';
  h += '<div class="cards">' + groupsOf(c).map((g0) => {
    const g = App.idx.groupById[g0.id];
    const ws = groupWords(g.id);
    const p3 = ws.filter((w) => w.priority === 3);
    const sample = p3.concat(ws.filter((w) => w.priority !== 3)).slice(0, p3.length >= 4 ? 4 : 3);
    const mp = miniProgress(ws);
    const fl = filterLine(ws);
    return '<a class="tcard' + (fl.dim ? ' dim' : '') + '" href="#vocab/' + encodeURIComponent(c.id) + '/' + encodeURIComponent(g.id) + '">' +
      '<span class="tc-top"><span class="tc-title">' + esc(g.title) + '</span>' + dirBadge(g.direction) + '</span>' +
      '<span class="tc-meta"><span>' + ws.length + ' từ</span><span>' + p3.length + ' từ ★★★</span>' + (g.scale ? '<span class="scale-tag">Thang nhẹ → mạnh</span>' : '') +
      (mp.n.leech ? '<span class="tag leech">! ' + mp.n.leech + ' hay quên</span>' : '') + '</span>' +
      '<span class="tc-sample">' + sample.map((w) => '<span>' + esc(w.word.split('/')[0].trim()) + '</span>').join('') + '</span>' +
      (g.note ? '<span class="tc-note" title="' + esc(g.note) + '">' + esc(g.note) + '</span>' : '') +
      mp.html + fl.html + '</a>';
  }).join('') + '</div>';
  return h;
}

/** Danh sách từ của một nhóm (giữ nguyên giao diện danh sách cũ; thang thì chia theo mức). */
function groupSection(g, gw, withHead) {
  let h = '<section class="group">';
  if (withHead) {
    h += '<div class="group-head"><h3>' + esc(g.title) + '</h3>' + (g.scale ? '<span class="scale-tag">Thang nhẹ → mạnh</span>' : '') +
      '<a class="group-link" href="#vocab/' + encodeURIComponent(g.clusterId) + '/' + encodeURIComponent(g.id) + '">Mở nhóm</a></div>';
    if (g.note) h += '<p class="group-note">' + esc(g.note) + '</p>';
  }
  if (g.scale) {
    const levels = [...new Set(gw.map((w) => w.level))].sort();
    h += '<div class="ladder">' + levels.map((lv) => {
      let meter = '';
      for (let k = 1; k <= 4; k++) meter += '<i' + (k <= lv ? ' class="on"' : '') + '></i>';
      return '<div class="rung"><div class="rung-label">Mức ' + lv + '<span class="rung-meter" aria-hidden="true">' + meter + '</span></div><div class="rung-words">' +
        gw.filter((w) => w.level === lv).map((w) => wordRow(w)).join('') + '</div></div>';
    }).join('') + '</div>';
  } else {
    h += gw.map((w) => wordRow(w)).join('');
  }
  return h + '</section>';
}

function countLine(n, total) {
  return '<div class="count-line">' + (n === total ? total + ' từ' : n + ' / ' + total + ' từ khớp bộ lọc') + '</div>';
}
const emptyFilter = '<div class="empty">Không có từ nào khớp. Thử bỏ bớt bộ lọc.</div>';

function groupList() {
  const V = App.vocab;
  const g = App.idx.groupById[V.g];
  const all = groupWords(g.id);
  const ws = all.filter(passFilters);
  let h = countLine(ws.length, all.length);
  h += ws.length ? groupSection(g, ws, false) : emptyFilter;
  // nhóm trước / nhóm sau trong cùng cụm
  const gs = groupsOf(App.idx.clusterById[V.c]);
  const i = gs.findIndex((x) => x.id === g.id);
  const link = (x, dir) => (x ? '<a class="pager-link ' + dir + '" href="#vocab/' + encodeURIComponent(V.c) + '/' + encodeURIComponent(x.id) + '"><small>' +
    (dir === 'prev' ? '← Nhóm trước' : 'Nhóm sau →') + '</small><span>' + esc(x.title) + '</span></a>' : '<span></span>');
  h += '<nav class="pager" aria-label="Chuyển nhóm">' + link(gs[i - 1], 'prev') + link(gs[i + 1], 'next') + '</nav>';
  return h;
}

function clusterList() {
  const c = App.idx.clusterById[App.vocab.c];
  const all = clusterWords(c.id);
  const ws = all.filter(passFilters);
  let h = countLine(ws.length, all.length);
  if (!ws.length) return h + emptyFilter;
  groupsOf(c).forEach((g0) => {
    const g = App.idx.groupById[g0.id];
    const gw = ws.filter((w) => w.group === g.id);
    if (gw.length) h += groupSection(g, gw, true);
  });
  return h;
}

function searchResults() {
  const q = fold(App.vocab.q.trim());
  const hits = App.idx.words.filter((w) => matchesQuery(w, q));
  const ws = hits.filter(passFilters);
  let h = '<div class="count-line">' + (ws.length ? ws.length + ' kết quả trên mọi cụm' : 'Không có kết quả') +
    (filtersOn() && hits.length !== ws.length ? ' (' + (hits.length - ws.length) + ' kết quả bị bộ lọc ẩn)' : '') + '</div>';
  if (!ws.length) return h + '<div class="empty">Không tìm thấy từ nào. Thử từ khác, hoặc bỏ dấu.</div>';
  return h + '<div class="search-results">' + ws.map((w) => wordRow(w, true)).join('') + '</div>';
}

/** Một dòng từ (giữ nguyên giao diện cũ). where = true: kèm nhãn Cụm › Nhóm (kết quả tìm kiếm). */
function wordRow(w, where) {
  const open = App.vocab.open === w.id;
  let label = '';
  if (where) {
    const c = App.idx.clusterById[w.clusterId], g = App.idx.groupById[w.group];
    label = '<span class="w-where">' + esc(c.title) + ' › ' + esc(g ? g.title : '') + '</span>';
  }
  return '<button class="wrow" id="w-' + w.id + '" data-act="v-open" data-id="' + w.id + '" aria-expanded="' + open + '">' +
    '<span class="w-main"><span class="w-word">' + esc(w.word) + '</span><span class="pos">' + esc(w.pos) + '</span></span>' +
    '<span class="w-side">' + statusTag(w.id) + stars(w.priority) + '</span>' +
    '<span class="w-meaning">' + esc(w.meaning) + '</span>' + label + '</button>' +
    (open ? '<div class="wdetail">' + wordDetail(w, true) +
      (where ? '<p class="small" style="margin:10px 0 0"><button class="linkish" data-act="v-jump" data-id="' + w.id + '">Mở trong nhóm “' + esc(App.idx.groupById[w.group].title) + '”</button></p>' : '') +
      '</div>' : '');
}

const relist = () => { document.getElementById('vlist').innerHTML = body(); };

/** Mở từ ở đúng nhóm chứa nó (dùng cho từ dễ nhầm ở cụm khác, kết quả tìm kiếm, kết quả thi thử). */
export function openWord(id) {
  const w = word(id);
  if (!w) return;
  App.vocab.q = '';
  go('vocab', [w.clusterId, w.group, w.id]);
}

Object.assign(actions, {
  'v-open': (t) => {
    const V = App.vocab;
    V.open = V.open === t.dataset.id ? null : t.dataset.id;
    relist();
    if (!V.q) syncHash(true);
    const el = document.getElementById('w-' + t.dataset.id);
    if (el) el.focus({ preventScroll: true });
  },
  'v-jump': (t) => openWord(t.dataset.id)
});

document.addEventListener('change', (e) => {
  if (App.view !== 'vocab') return;
  if (e.target.id === 'vprio') { App.vocab.prio = e.target.value; relist(); }
  if (e.target.id === 'vstatus') { App.vocab.status = e.target.value; relist(); }
});
document.addEventListener('input', (e) => {
  if (App.view !== 'vocab' || e.target.id !== 'vq') return;
  App.vocab.q = e.target.value;
  if (App.vocab.q.trim()) App.vocab.open = null;
  // khổ trang rộng (lưới thẻ) ↔ khổ danh sách
  document.getElementById('view').classList.toggle('wide', views.vocab.wide());
  relist();
});
