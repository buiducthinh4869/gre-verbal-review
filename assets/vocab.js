/**
 * vocab.js: chỉ mục dữ liệu từ vựng, hướng nghĩa của nhóm, ánh xạ phương án GRE về id từ, chấm bài GRE.
 * Thuần JavaScript, test bằng node.
 */

export const CUSTOM_CLUSTER_ID = 'custom';
export const DIRECTIONS = ['positive', 'negative', 'neutral'];

/** Bỏ dấu (clichéd → cliched), chữ thường, gọn khoảng trắng. */
const lc = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Hướng nghĩa của nhóm theo trường "direction" trong dữ liệu: 'positive' | 'negative' | 'neutral' | '' (không rõ, vd Từ tự thêm). */
export function groupDirection(group) {
  return group && DIRECTIONS.includes(group.direction) ? group.direction : '';
}

/** Hai hướng nghĩa có hợp nhau không (neutral hợp với mọi hướng; không rõ hướng thì coi như không hợp). */
export function directionsMatch(a, b) {
  if (!a || !b) return false;
  return a === b || a === 'neutral' || b === 'neutral';
}

function wordForms(w) {
  const forms = [];
  const add = (f) => { f = lc(f); if (f && !forms.includes(f)) forms.push(f); };
  String(w.word || '').split('/').forEach((alt) => {
    const f = lc(alt).replace(/\s*\([^)]*\)\s*/g, ' ').trim(); // "obscure (v)" → "obscure"
    if (!f) return;
    add(f);
    const first = f.split(/\s+/)[0];
    if (first !== f) add(first);
  });
  const id = lc(w.id);
  add(id);
  if (id.includes('-')) {
    add(id.replace(/-/g, ' '));                       // shore-up → "shore up"
    const m = id.match(/^(.+)-(v|n|adj|adv)$/);       // obscure-v → "obscure"
    if (m) add(m[1]);
  }
  return forms;
}

/** Dựng chỉ mục từ {clusters:[...]} (dữ liệu JSON) và danh sách từ tự thêm của người dùng. */
export function buildIndex(vocab, customWords) {
  const clusters = (vocab.clusters || []).slice().sort((a, b) => a.order - b.order);
  const custom = {
    id: CUSTOM_CLUSTER_ID, title: 'Từ tự thêm', order: 9999, custom: true,
    description: 'Các từ bạn tự thêm.',
    groups: [{ id: 'custom', title: 'Từ tự thêm', scale: false, note: '' }],
    words: (customWords || []).map((w) => Object.assign({}, w, {
      group: 'custom', confusables: w.confusables || [], collocations: w.collocations || [], custom: true
    })),
    exercises: []
  };
  const all = clusters.concat([custom]);
  // exercises: bài đang dùng (bỏ bài bị ẩn); allExercises: kể cả bài ẩn (để quản trị viên hiện lại, xem kết quả cũ)
  const idx = { clusters: all, clusterById: {}, words: [], byId: {}, groupById: {}, exercises: [], allExercises: [], exById: {}, formMap: {}, reverseConf: {} };
  all.forEach((c) => {
    idx.clusterById[c.id] = c;
    (c.groups || []).forEach((g) => {
      idx.groupById[g.id] = { id: g.id, title: g.title, scale: !!g.scale, note: g.note || '', clusterId: c.id, direction: groupDirection(g) };
    });
    (c.words || []).forEach((w, i) => {
      const e = Object.assign({}, w, {
        clusterId: c.id,
        clusterOrder: c.custom ? -1 : c.order, // từ tự thêm được ưu tiên giới thiệu trước
        fileIndex: i,
        confusables: w.confusables || [],
        collocations: w.collocations || []
      });
      e.forms = wordForms(e);
      idx.words.push(e);
      idx.byId[e.id] = e;
    });
    (c.exercises || []).forEach((ex) => {
      const e = Object.assign({}, ex, { clusterId: c.id });
      idx.allExercises.push(e);
      if (!e.hidden) idx.exercises.push(e);
      idx.exById[e.id] = e;
    });
  });
  idx.words.forEach((w) => {
    w.forms.forEach((f) => { (idx.formMap[f] = idx.formMap[f] || []).push(w.id); });
    w.confusables.forEach((cid) => { (idx.reverseConf[cid] = idx.reverseConf[cid] || []).push(w.id); });
  });
  idx.allExercises.forEach((ex) => {
    ex.answerIds = exerciseAnswerIds(ex, idx);
    Object.assign(ex, exerciseVocab(ex, idx));
  });
  return idx;
}

/* ---------------- Ánh xạ phương án GRE về id ---------------- */

/**
 * Dạng quá khứ / phân từ bất quy tắc → động từ gốc ("bore out" → bear out, "upheld" → uphold). Chỉ là ứng viên
 * thêm SAU dạng nguyên văn, nên một từ có sẵn trên web trùng chữ vẫn được ưu tiên. Bỏ các dạng dễ nhầm với từ
 * khác nghĩa (rose, fell, left, found, lay, saw, ground, wound, bit, lied).
 */
const IRREGULAR = (() => {
  const pairs = {
    bear: 'bore borne', uphold: 'upheld', hold: 'held', withhold: 'withheld', behold: 'beheld',
    withdraw: 'withdrew withdrawn', draw: 'drew drawn', overdraw: 'overdrew overdrawn',
    swing: 'swung', cling: 'clung', fling: 'flung', sling: 'slung', sting: 'stung', wring: 'wrung', spin: 'spun', stick: 'stuck',
    strike: 'struck stricken', strive: 'strove striven', drive: 'drove driven', ride: 'rode ridden', override: 'overrode overridden',
    write: 'wrote written', underwrite: 'underwrote underwritten', rise: 'risen', arise: 'arose arisen',
    take: 'took taken', undertake: 'undertook undertaken', overtake: 'overtook overtaken', mistake: 'mistook mistaken',
    forsake: 'forsook forsaken', shake: 'shook shaken', partake: 'partook partaken',
    break: 'broke broken', speak: 'spoke spoken', choose: 'chose chosen', freeze: 'froze frozen', steal: 'stole stolen',
    weave: 'wove woven', tread: 'trod trodden', forget: 'forgot forgotten', beget: 'begot begotten',
    give: 'gave given', forgive: 'forgave forgiven', forbid: 'forbade forbidden', bid: 'bade', hide: 'hid hidden',
    see: 'seen', foresee: 'foresaw foreseen', oversee: 'oversaw overseen', go: 'went gone', undergo: 'underwent undergone', forgo: 'forwent forgone',
    come: 'came', become: 'became', overcome: 'overcame',
    know: 'knew known', grow: 'grew grown', outgrow: 'outgrew outgrown', throw: 'threw thrown', overthrow: 'overthrew overthrown',
    blow: 'blew blown', fly: 'flew flown', show: 'shown', sow: 'sown', swell: 'swollen',
    swear: 'swore sworn', forswear: 'forswore forsworn', tear: 'tore torn', wear: 'wore worn',
    do: 'did done', undo: 'undid undone', outdo: 'outdid outdone', overdo: 'overdid overdone',
    lead: 'led', mislead: 'misled', flee: 'fled', breed: 'bred', feed: 'fed', speed: 'sped', bleed: 'bled',
    seek: 'sought', think: 'thought', bring: 'brought', buy: 'bought', fight: 'fought', teach: 'taught', catch: 'caught',
    keep: 'kept', sweep: 'swept', weep: 'wept', creep: 'crept', sleep: 'slept', leap: 'leapt',
    deal: 'dealt', mean: 'meant', feel: 'felt', lose: 'lost', send: 'sent', spend: 'spent', bend: 'bent', lend: 'lent',
    build: 'built', dwell: 'dwelt', spill: 'spilt', spoil: 'spoilt', sell: 'sold', tell: 'told', foretell: 'foretold',
    make: 'made', pay: 'paid', say: 'said', gainsay: 'gainsaid', inlay: 'inlaid', mislay: 'mislaid', sit: 'sat', meet: 'met',
    stand: 'stood', understand: 'understood', withstand: 'withstood', win: 'won', shine: 'shone', slide: 'slid',
    bite: 'bitten', fall: 'fallen', befall: 'befell befallen', eat: 'ate eaten', beat: 'beaten', sink: 'sank sunk', shrink: 'shrank shrunk',
    begin: 'began begun', drink: 'drank drunk', ring: 'rang rung', sing: 'sang sung', spring: 'sprang sprung', swim: 'swam swum',
    get: 'got gotten', beseech: 'besought', slay: 'slew slain', smite: 'smote smitten', strew: 'strewn', hew: 'hewn', mow: 'mown'
  };
  const map = {};
  Object.keys(pairs).forEach((base) => pairs[base].split(' ').forEach((f) => { map[f] = base; }));
  return map;
})();

function stemCandidates(w) {
  const out = [w];
  const add = (x) => { if (x && x.length >= 3 && !out.includes(x)) out.push(x); };
  if (IRREGULAR[w]) out.push(IRREGULAR[w]);                        // bore → bear, upheld → uphold
  let m;
  if ((m = w.match(/^(.*)ied$/))) add(m[1] + 'y');
  if ((m = w.match(/^(.*)ying$/))) add(m[1] + 'ie');                // belying → belie
  if ((m = w.match(/^(.*)ing$/))) {
    add(m[1]); add(m[1] + 'e');
    if (/(.)\1$/.test(m[1])) add(m[1].slice(0, -1));
  }
  if ((m = w.match(/^(.*)ed$/))) {
    add(m[1]); add(m[1] + 'e');
    if (/(.)\1$/.test(m[1])) add(m[1].slice(0, -1));
  }
  if ((m = w.match(/^(.*)d$/))) add(m[1]);
  if ((m = w.match(/^(.*)ies$/))) add(m[1] + 'y');
  if ((m = w.match(/^(.*)es$/))) add(m[1]);
  if ((m = w.match(/^(.*)s$/))) add(m[1]);
  // trạng từ: frugally → frugal, hastily → hasty, cryptically → cryptic, ably → able
  if ((m = w.match(/^(.*)ily$/))) add(m[1] + 'y');
  if ((m = w.match(/^(.*ic)ally$/))) add(m[1]);
  if ((m = w.match(/^(.*)bly$/))) add(m[1] + 'ble');
  if ((m = w.match(/^(.*)ly$/))) add(m[1]);
  // danh từ: obstinacy → obstinate, lucidity → lucid, perspicuity → perspicuous, terseness → terse
  if ((m = w.match(/^(.*)acy$/))) add(m[1] + 'ate');
  if ((m = w.match(/^(.*)ity$/))) { add(m[1]); add(m[1] + 'e'); add(m[1] + 'ous'); add(m[1] + 'al'); }
  if ((m = w.match(/^(.*)iness$/))) add(m[1] + 'y');
  if ((m = w.match(/^(.*)ness$/))) add(m[1]);
  // tính từ đuôi -ural: conjectural → conjecture
  if ((m = w.match(/^(.*ur)al$/))) add(m[1] + 'e');
  // danh từ chỉ người → tính từ: iconoclast → iconoclastic
  if (/(ast|ist)$/.test(w)) add(w + 'ic');
  // từ có dạng gốc là số nhiều: plaudit → plaudits
  if (!/s$/.test(w)) add(w + 's');
  return out;
}

/**
 * Ánh xạ một phương án ("lauded", "scoffed at", "frugally", "obstinacy", "gloss over", "shore up",
 * "a backhanded compliment") về id từ: khớp chính xác, bỏ mạo từ đầu, bỏ tiền tố self- (sau khi đã thử nguyên
 * dạng: "self-effacing" là một từ, "self-deprecating" → deprecate), bỏ đuôi chia / đuôi
 * trạng từ / đuôi danh từ, thử cả cụm có giới từ lẫn từ đầu của cụm. Gom mọi id ứng viên rồi LUÔN ưu tiên id
 * nằm trong targets của bài; không có thì lấy ứng viên khớp sớm nhất. Không khớp gì thì trả về null.
 */
export function mapOptionToId(option, idx, targets) {
  const full = lc(option).replace(/^(a|an|the)\s+/, '');
  const base = full.replace(/^self-/, '');
  if (!base) return null;
  const tokens = base.split(/\s+/);
  const tries = [];
  const push = (t) => { if (t && !tries.includes(t)) tries.push(t); };
  if (full !== base) stemCandidates(full).forEach(push);
  stemCandidates(tokens[0]).forEach((st) => { if (tokens.length > 1) push([st].concat(tokens.slice(1)).join(' ')); });
  stemCandidates(base).forEach(push);
  if (tokens.length > 1) {
    push(tokens.join('-'));                                  // "avant garde" → avant-garde
    stemCandidates(tokens[0]).forEach(push);                 // "gloss over" → gloss
  }
  targets = targets || [];
  const cands = [];
  tries.forEach((t) => (idx.formMap[t] || []).forEach((id) => { if (!cands.includes(id)) cands.push(id); }));
  if (!cands.length) return null;
  return cands.find((id) => targets.includes(id)) || cands[0];
}

export function exerciseAnswerIds(ex, idx) {
  const answers = ex.type === 'se' ? ex.answers : (ex.blanks || []).map((b) => b.answer);
  const ids = [];
  answers.forEach((a) => {
    const id = mapOptionToId(a, idx, ex.targets);
    if (id && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

/** Mọi phương án của một câu (TC: theo từng chỗ trống; SE: 6 phương án), giữ thứ tự trong dữ liệu. */
export function exerciseOptions(ex) {
  return ex.type === 'se' ? (ex.options || []).slice() : (ex.blanks || []).flatMap((b) => b.options || []);
}

/**
 * Từ vựng của một câu: ánh xạ MỌI phương án (không chỉ đáp án) về id từ.
 *  - optionMap: {phương án: id | null}
 *  - optionWordIds: các id ánh xạ được (không trùng, theo thứ tự phương án)
 *  - outsideWords: phương án không ánh xạ được (từ chưa có trên web)
 *  - relatedGroups: nhóm (group) của các từ đó, theo thứ tự gặp; cụm của nhóm xem ở idx.groupById[g].clusterId
 */
export function exerciseVocab(ex, idx) {
  const optionMap = {}, optionWordIds = [], outsideWords = [], relatedGroups = [];
  exerciseOptions(ex).forEach((o) => {
    if (o in optionMap) return;
    const id = mapOptionToId(o, idx, ex.targets);
    optionMap[o] = id;
    if (!id) { if (!outsideWords.includes(o)) outsideWords.push(o); return; }
    if (!optionWordIds.includes(id)) optionWordIds.push(id);
    const g = idx.byId[id] && idx.byId[id].group;
    if (g && idx.groupById[g] && !relatedGroups.includes(g)) relatedGroups.push(g);
  });
  return { optionMap, optionWordIds, outsideWords, relatedGroups };
}

/**
 * Id các từ đáp án mà người làm bị sai: TC: đáp án của những chỗ trống chọn sai (hoặc bỏ trống);
 * SE: đáp án không được chọn. Câu đúng hoàn toàn thì rỗng.
 */
export function wrongAnswerIds(ex, choice, idx) {
  const missed = ex.type === 'se'
    ? (ex.answers || []).filter((a) => !(choice || []).includes(a))
    : (ex.blanks || []).filter((b, i) => !choice || choice[i] !== b.answer).map((b) => b.answer);
  const out = [];
  missed.forEach((a) => { const id = mapOptionToId(a, idx, ex.targets); if (id && !out.includes(id)) out.push(id); });
  return out;
}

/**
 * Chấm bài GRE. choice: TC -> mảng chuỗi theo từng chỗ trống; SE -> mảng 2 chuỗi đã chọn.
 * Trả về {correct, answerIds, otherTargetIds, confusions: [{wordId, confusedWith}]}.
 */
export function gradeExercise(ex, choice, idx) {
  let correct;
  const confusions = [];
  const pushConf = (rightOpt, wrongOpt) => {
    const r = mapOptionToId(rightOpt, idx, ex.targets);
    const w = mapOptionToId(wrongOpt, idx, ex.targets);
    if (r && w && r !== w) confusions.push({ wordId: r, confusedWith: w });
  };
  if (ex.type === 'se') {
    const chosen = choice || [];
    correct = chosen.length === 2 && ex.answers.every((a) => chosen.includes(a));
    if (!correct) {
      const missed = ex.answers.filter((a) => !chosen.includes(a));
      const wrong = chosen.filter((c) => !ex.answers.includes(c));
      missed.forEach((m) => wrong.forEach((w) => pushConf(m, w)));
    }
  } else {
    correct = ex.blanks.every((b, i) => choice && choice[i] === b.answer);
    ex.blanks.forEach((b, i) => { if (choice && choice[i] && choice[i] !== b.answer) pushConf(b.answer, choice[i]); });
  }
  const answerIds = ex.answerIds || exerciseAnswerIds(ex, idx);
  const otherTargetIds = (ex.targets || []).filter((t) => !answerIds.includes(t) && idx.byId[t]);
  return { correct, answerIds, otherTargetIds, confusions };
}

/** Bài GRE cho một từ: ưu tiên bài mà từ là đáp án, rồi bài có từ trong targets; mỗi loại chọn bài làm ít gần đây nhất. skip: Set id bài không được chọn (vd đang giữ cho đề thi thử). */
export function pickExerciseForWord(wordId, idx, exLast, skip) {
  exLast = exLast || {};
  const ok = (e) => !skip || !skip.has(e.id);
  const byOldest = (a, b) => {
    const ta = exLast[a.id] || '', tb = exLast[b.id] || '';
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  };
  const asAnswer = idx.exercises.filter((e) => ok(e) && e.answerIds.includes(wordId)).sort(byOldest);
  if (asAnswer.length) return asAnswer[0];
  const asTarget = idx.exercises.filter((e) => ok(e) && (e.targets || []).includes(wordId)).sort(byOldest);
  return asTarget[0] || null;
}
