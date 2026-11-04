#!/usr/bin/env node
/**
 * preview.js: dựng preview/index.html để xem giao diện cục bộ, không cần Apps Script.
 * google.script.run được giả lập (lưu trong bộ nhớ trang). Chỉ dùng khi phát triển.
 *   node scripts/preview.js  → mở preview/index.html qua một web server tĩnh bất kỳ.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')], { stdio: 'inherit' });

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(SRC, 'Data.js'), 'utf8') + ';this.VOCAB_DATA=VOCAB_DATA;', ctx);
const now = Date.now();
const vn = new Date(now + 7 * 3600e3).toISOString().slice(0, 10);
const boot = {
  vocab: ctx.VOCAB_DATA,
  state: { progress: {}, customWords: [], settings: {}, daily: {}, exLast: {}, nowMs: now, today: vn, sheetUrl: 'https://docs.google.com/' },
  admin: false,
};
const mock = `<script>
window.google = { script: { run: (function () {
  function runner(ok, fail) {
    var api = {
      withSuccessHandler: function (f) { return runner(f, fail); },
      withFailureHandler: function (f) { return runner(ok, f); },
      saveEvents: function (evs) { setTimeout(function () { window.__saved = (window.__saved || []).concat(evs); ok && ok({ ok: true, states: {}, nowMs: Date.now() }); }, 300); },
      getState: function () { setTimeout(function () { ok && ok(null); }, 300); },
      resetAllProgress: function () { setTimeout(function () { ok && ok({ progress: {}, customWords: [] }); }, 300); }
    };
    return api;
  }
  return runner(null, null);
})() } };
</script>`;
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
html = html.replace(/<\?!= include\('(\w+)'\) \?>/g, (_, n) => fs.readFileSync(path.join(SRC, n + '.html'), 'utf8'));
html = html.replace('<?!= boot ?>', JSON.stringify(boot).replace(/</g, '\u003c'));
html = html.replace('<script>window.BOOT', mock + '\n<script>window.BOOT');
fs.mkdirSync(path.join(ROOT, 'preview'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'preview', 'index.html'), html);
console.log('✓ preview/index.html');
