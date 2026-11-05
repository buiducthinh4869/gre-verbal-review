// Thêm từ: form theo schema words; lưu vào custom_words của chính người dùng.
import { App, esc, views, actions, render, toast, posLabel, statusTag, now, nowIso, evId, pushEvent, upsertCustomLocal, rebuildIndex } from '../state.js';

views.add = {
  title: 'Thêm từ',
  render() {
    const editing = App.editId ? App.customWords.find((w) => w.id === App.editId) : null;
    const w = editing || { word: '', pos: 'v', priority: 2, meaning: '', nuance: '', example: '', collocations: [], root: '' };
    let h = '<div class="page-head"><h1>' + (editing ? 'Sửa từ' : 'Thêm từ') + '</h1><p>Từ tự thêm nằm trong cụm “Từ tự thêm” và được đưa vào lịch ôn như các từ khác.</p></div>';
    h += '<form id="addForm" class="form-grid" autocomplete="off">';
    h += '<div class="two"><div class="field"><label for="f-word">Từ *</label><input class="input" id="f-word" required maxlength="120" value="' + esc(w.word) + '" placeholder="vd: panegyric"></div>' +
      '<div class="field"><label for="f-pos">Loại từ</label><select class="input" id="f-pos">' +
      ['v', 'n', 'adj', 'adv', 'v/n'].map((p) => '<option value="' + p + '"' + (w.pos === p ? ' selected' : '') + '>' + p + ' · ' + posLabel(p) + '</option>').join('') + '</select></div></div>';
    h += '<div class="field"><label for="f-meaning">Nghĩa *</label><input class="input" id="f-meaning" required maxlength="500" value="' + esc(w.meaning) + '" placeholder="Nghĩa tiếng Việt ngắn gọn"></div>';
    h += '<div class="field"><label for="f-nuance">Sắc thái</label><textarea class="input" id="f-nuance" maxlength="1000" placeholder="Khen hay chê, mạnh hay nhẹ, dùng trong hoàn cảnh nào">' + esc(w.nuance) + '</textarea></div>';
    h += '<div class="field"><label for="f-example">Ví dụ</label><textarea class="input" id="f-example" maxlength="1000" placeholder="The speech was a *panegyric* **to** the founder.">' + esc(w.example) + '</textarea>' +
      '<div class="help">Đặt từ đang học trong *dấu sao*, collocation trong **hai dấu sao**.</div></div>';
    h += '<div class="field"><label for="f-coll">Collocation</label><textarea class="input" id="f-coll" maxlength="1000" placeholder="Mỗi dòng một collocation">' + esc((w.collocations || []).join('\n')) + '</textarea></div>';
    h += '<div class="two"><div class="field"><span class="label">Mức ưu tiên</span><div class="seg" role="radiogroup">' + [3, 2, 1].map((p) =>
      '<button type="button" class="chip" data-act="f-prio" data-id="' + p + '" aria-pressed="' + (Number(w.priority) === p) + '">' + '★★★'.slice(0, p) + '</button>').join('') + '</div></div>' +
      '<div class="field"><label for="f-root">Gốc từ (tùy chọn)</label><input class="input" id="f-root" maxlength="200" value="' + esc(w.root) + '"></div></div>';
    h += '<input type="hidden" id="f-priority" value="' + (w.priority || 2) + '">';
    h += '<div class="row"><button class="btn primary" type="submit" style="flex:1">' + (editing ? 'Lưu thay đổi' : 'Thêm từ') + '</button>' +
      (editing ? '<button class="btn" type="button" data-act="f-cancel">Hủy</button>' : '') + '</div></form>';
    h += '<h2 class="section">Từ đã thêm (' + App.customWords.length + ')</h2>';
    if (!App.customWords.length) h += '<div class="empty">Chưa có từ nào.</div>';
    else h += '<div class="custom-list">' + App.customWords.slice().reverse().map((x) =>
      '<div class="wrow"><span class="w-main"><span class="w-word">' + esc(x.word) + '</span><span class="pos">' + esc(x.pos) + '</span></span>' +
      '<span class="w-side">' + statusTag(x.id) + '<span class="custom-actions"><button class="btn quiet" data-act="c-edit" data-id="' + x.id + '">Sửa</button>' +
      '<button class="btn quiet" style="color:var(--bad)" data-act="c-del" data-id="' + x.id + '">Xóa</button></span></span>' +
      '<span class="w-meaning">' + esc(x.meaning) + '</span></div>').join('') + '</div>';
    return h;
  }
};

function submitCustom() {
  const get = (id) => document.getElementById(id).value.trim();
  const wordText = get('f-word'), meaning = get('f-meaning');
  if (!wordText || !meaning) { toast('Cần điền Từ và Nghĩa.'); return; }
  const ts = nowIso();
  const old = App.editId ? App.customWords.find((w) => w.id === App.editId) : null;
  const w = {
    id: old ? old.id : 'c-' + now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
    word: wordText, pos: get('f-pos'), priority: Number(get('f-priority')) || 2, meaning,
    nuance: get('f-nuance'), example: get('f-example'),
    collocations: get('f-coll').split('\n').map((x) => x.trim()).filter(Boolean),
    root: get('f-root'), createdAt: old ? old.createdAt : ts, updatedAt: ts
  };
  upsertCustomLocal(w);
  rebuildIndex();
  pushEvent({ id: evId(), type: 'custom_upsert', ts, word: w });
  App.editId = null;
  toast(old ? 'Đã lưu “' + w.word + '”.' : 'Đã thêm “' + w.word + '”.');
  render();
}

Object.assign(actions, {
  'f-prio': (t) => {
    document.getElementById('f-priority').value = t.dataset.id;
    document.querySelectorAll('[data-act="f-prio"]').forEach((b) => b.setAttribute('aria-pressed', b === t ? 'true' : 'false'));
  },
  'f-cancel': () => { App.editId = null; render(); },
  'c-edit': (t) => { App.editId = t.dataset.id; render(); window.scrollTo(0, 0); },
  'c-del': (t) => {
    if (t.dataset.armed !== '1') {
      t.dataset.armed = '1';
      t.textContent = 'Bấm lần nữa để xóa';
      setTimeout(() => { if (t.isConnected) { t.dataset.armed = ''; t.textContent = 'Xóa'; } }, 3500);
      return;
    }
    const id = t.dataset.id;
    const w = App.customWords.find((x) => x.id === id);
    App.customWords = App.customWords.filter((x) => x.id !== id);
    rebuildIndex();
    pushEvent({ id: evId(), type: 'custom_delete', ts: nowIso(), wordId: id });
    if (App.editId === id) App.editId = null;
    toast('Đã xóa “' + (w ? w.word : id) + '”.');
    render();
  }
});

document.addEventListener('submit', (e) => {
  if (e.target.id === 'addForm') { e.preventDefault(); submitCustom(); }
});
