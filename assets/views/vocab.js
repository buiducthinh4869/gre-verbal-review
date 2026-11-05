// Trang Từ vựng: chọn cụm, nhóm (thang nhẹ → mạnh), lọc, tìm kiếm bỏ dấu, chi tiết từng từ.
import { App, S, esc, views, actions, word, statusTag, stars, render } from '../state.js';
import { fold } from '../render.js';
import { wordDetail } from './common.js';

function visibleClusters() { return App.idx.clusters.filter((c) => !c.custom || App.customWords.length); }

views.vocab = {
  title: 'Từ vựng',
  render() {
    const V = App.vocab;
    const clusters = visibleClusters();
    if (!V.cluster || !App.idx.clusterById[V.cluster]) V.cluster = clusters[0].id;
    const c = App.idx.clusterById[V.cluster];
    let h = '<div class="page-head"><h1>Từ vựng</h1><p>' + esc(c.description || '') + '</p></div><div class="toolbar">';
    if (clusters.length > 1) {
      h += '<div class="seg" role="group" aria-label="Chọn cụm">' + clusters.map((x) =>
        '<button class="chip" data-act="v-cluster" data-id="' + x.id + '" aria-pressed="' + (x.id === V.cluster) + '">' + esc(x.title) + '</button>').join('') + '</div>';
    }
    h += '<div class="search"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="m20 20-4.5-4.5M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"/></svg>' +
      '<input class="input" id="vq" type="search" placeholder="Tìm từ hoặc nghĩa tiếng Việt" value="' + esc(V.q) + '" aria-label="Tìm kiếm"></div>';
    h += '<div class="seg" role="group" aria-label="Lọc theo ưu tiên">' + [['all', 'Mọi mức'], ['3', '★★★ phải thuộc'], ['2', '★★ nên biết'], ['1', '★ lướt qua']].map((p) =>
      '<button class="chip" data-act="v-prio" data-id="' + p[0] + '" aria-pressed="' + (V.prio === p[0]) + '">' + p[1] + '</button>').join('') + '</div>';
    h += '<div class="filters"><select class="input" id="vgroup" aria-label="Lọc theo nhóm"><option value="all">Mọi nhóm</option>' +
      c.groups.map((g) => '<option value="' + g.id + '"' + (V.group === g.id ? ' selected' : '') + '>' + esc(g.title) + '</option>').join('') +
      '</select><select class="input" id="vstatus" aria-label="Lọc theo trạng thái">' +
      [['all', 'Mọi trạng thái'], ['new', 'Chưa học'], ['learning', 'Đang học'], ['known', 'Đã thuộc'], ['leech', 'Hay quên']].map((s) =>
        '<option value="' + s[0] + '"' + (V.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>').join('') + '</select></div></div>';
    return h + '<div id="vlist">' + vocabList() + '</div>';
  }
};

function matches(w) {
  const V = App.vocab;
  if (V.prio !== 'all' && String(w.priority) !== V.prio) return false;
  if (V.group !== 'all' && w.group !== V.group) return false;
  if (V.status !== 'all' && S.statusOf(App.progress[w.id]) !== V.status) return false;
  const q = fold(V.q.trim());
  if (q && !fold(w.word).includes(q) && !fold(w.meaning).includes(q)) return false;
  return true;
}

function vocabList() {
  const c = App.idx.clusterById[App.vocab.cluster];
  const all = App.idx.words.filter((w) => w.clusterId === c.id);
  const words = all.filter(matches);
  let h = '<div class="count-line">' + (words.length === all.length ? all.length + ' từ' : words.length + ' / ' + all.length + ' từ khớp bộ lọc') + '</div>';
  if (!words.length) return h + '<div class="empty">Không có từ nào khớp. Thử bỏ bớt bộ lọc.</div>';
  c.groups.forEach((g) => {
    const gw = words.filter((w) => w.group === g.id);
    if (!gw.length) return;
    h += '<section class="group"><div class="group-head"><h3>' + esc(g.title) + '</h3>' + (g.scale ? '<span class="scale-tag">Thang nhẹ → mạnh</span>' : '') + '</div>';
    if (g.note) h += '<p class="group-note">' + esc(g.note) + '</p>';
    if (g.scale) {
      const levels = [...new Set(gw.map((w) => w.level))].sort();
      h += '<div class="ladder">' + levels.map((lv) => {
        let meter = '';
        for (let k = 1; k <= 4; k++) meter += '<i' + (k <= lv ? ' class="on"' : '') + '></i>';
        return '<div class="rung"><div class="rung-label">Mức ' + lv + '<span class="rung-meter" aria-hidden="true">' + meter + '</span></div><div class="rung-words">' +
          gw.filter((w) => w.level === lv).map(wordRow).join('') + '</div></div>';
      }).join('') + '</div>';
    } else {
      h += gw.map(wordRow).join('');
    }
    h += '</section>';
  });
  return h;
}

function wordRow(w) {
  const open = App.vocab.open === w.id;
  return '<button class="wrow" id="w-' + w.id + '" data-act="v-open" data-id="' + w.id + '" aria-expanded="' + open + '">' +
    '<span class="w-main"><span class="w-word">' + esc(w.word) + '</span><span class="pos">' + esc(w.pos) + '</span></span>' +
    '<span class="w-side">' + statusTag(w.id) + stars(w.priority) + '</span>' +
    '<span class="w-meaning">' + esc(w.meaning) + '</span></button>' +
    (open ? '<div class="wdetail">' + wordDetail(w, true) + '</div>' : '');
}

const relist = () => { document.getElementById('vlist').innerHTML = vocabList(); };

Object.assign(actions, {
  'v-cluster': (t) => { App.vocab.cluster = t.dataset.id; App.vocab.group = 'all'; App.vocab.open = null; render(); },
  'v-prio': (t) => { App.vocab.prio = t.dataset.id; render(); },
  'v-open': (t) => { App.vocab.open = App.vocab.open === t.dataset.id ? null : t.dataset.id; relist(); },
  'v-jump': (t) => {
    const w = word(t.dataset.id);
    if (!w) return;
    App.vocab = { cluster: w.clusterId, q: '', prio: 'all', group: 'all', status: 'all', open: w.id };
    render();
    const el = document.getElementById('w-' + w.id);
    if (el) { el.scrollIntoView({ block: 'center' }); el.focus({ preventScroll: true }); }
  }
});

document.addEventListener('change', (e) => {
  if (App.view !== 'vocab') return;
  if (e.target.id === 'vgroup') { App.vocab.group = e.target.value; relist(); }
  if (e.target.id === 'vstatus') { App.vocab.status = e.target.value; relist(); }
});
document.addEventListener('input', (e) => {
  if (App.view === 'vocab' && e.target.id === 'vq') { App.vocab.q = e.target.value; App.vocab.open = null; relist(); }
});
