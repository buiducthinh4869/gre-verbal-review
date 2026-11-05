/**
 * Migrate.js: chuyển dữ liệu bản cũ (một người dùng, không có cột userId) sang bản nhiều tài khoản.
 *
 * Chạy lại bao nhiêu lần cũng an toàn:
 *  - Tab cũ chưa có cột userId: chèn MỘT cột userId vào đầu (mọi cột, dòng khác giữ nguyên, chỉ dịch sang phải).
 *  - Điền 'u01' cho các dòng có dữ liệu mà ô userId còn trống. Không ghi đè userId đã có.
 *  - Tạo tab còn thiếu (users, sessions) và thêm cột còn thiếu vào CUỐI hàng tiêu đề.
 *  - Không xóa, không clear(), không đổi tên, không sắp xếp lại tab hay dòng nào.
 * Trả về số dòng dữ liệu từng tab trước và sau để đối chiếu.
 */

var LEGACY_OWNER = 'u01';

function countDataRows_(sh) {
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  var values = sh.getRange(2, 1, lastRow - 1, Math.max(sh.getLastColumn(), 1)).getDisplayValues();
  return values.filter(function (r) { return !isBlankRow_(r); }).length;
}

function migrate_(ss) {
  var report = { before: {}, after: {}, insertedUserId: [], filled: {}, createdTabs: [], addedColumns: {} };
  if (ss.getSpreadsheetTimeZone() !== TZ) ss.setSpreadsheetTimeZone(TZ);

  USER_TABS.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    report.before[name] = countDataRows_(sh);
    var lastCol = Math.max(sh.getLastColumn(), 1);
    var headers = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(String);
    var ui = headers.indexOf('userId');
    if (ui < 0) {
      sh.insertColumnBefore(1);
      sh.getRange(1, 1, sh.getMaxRows(), 1).setNumberFormat('@');
      sh.getRange(1, 1).setValue('userId').setFontWeight('bold');
      report.insertedUserId.push(name);
      ui = 0;
    }
    var lastRow = sh.getLastRow();
    var filled = 0;
    if (lastRow >= 2) {
      var width = Math.max(sh.getLastColumn(), 1);
      var values = sh.getRange(2, 1, lastRow - 1, width).getDisplayValues();
      var colVals = values.map(function (r) {
        var other = r.filter(function (v, j) { return j !== ui && String(v) !== ''; }).length > 0;
        if (String(r[ui]) === '' && other) { filled++; return [LEGACY_OWNER]; }
        return [r[ui]];
      });
      if (filled) sh.getRange(2, ui + 1, colVals.length, 1).setNumberFormat('@').setValues(colVals);
    }
    report.filled[name] = filled;
  });

  ensureSchema_(ss, report);
  USER_TABS.forEach(function (name) { report.after[name] = countDataRows_(ss.getSheetByName(name)); });
  report.after.users = countDataRows_(ss.getSheetByName('users'));
  report.after.sessions = countDataRows_(ss.getSheetByName('sessions'));
  PropertiesService.getScriptProperties().setProperty('SCHEMA', SCHEMA_VERSION);
  report.schema = SCHEMA_VERSION;
  return report;
}

/** Tạo tab còn thiếu; thêm cột còn thiếu vào cuối hàng tiêu đề. Không đụng dữ liệu có sẵn. */
function ensureSchema_(ss, report) {
  Object.keys(TABS).forEach(function (name) {
    var want = TABS[name];
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      if (sh.getMaxColumns() < want.length) sh.insertColumnsAfter(sh.getMaxColumns(), want.length - sh.getMaxColumns());
      sh.getRange(1, 1, sh.getMaxRows(), want.length).setNumberFormat('@');
      sh.getRange(1, 1, 1, want.length).setValues([want]).setFontWeight('bold');
      sh.setFrozenRows(1);
      report.createdTabs.push(name);
      return;
    }
    var lastCol = Math.max(sh.getLastColumn(), 1);
    var current = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(String);
    if (name !== 'users' && name !== 'sessions' && current.indexOf('userId') < 0) {
      fail_('server_error', 'Tab ' + name + ' chưa có cột userId; không tự thêm vào cuối. Chạy lại migrate.');
    }
    var missing = want.filter(function (h) { return current.indexOf(h) < 0; });
    if (missing.length) {
      var start = current.filter(String).length ? lastCol + 1 : 1;
      if (start + missing.length - 1 > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), start + missing.length - 1 - sh.getMaxColumns());
      sh.getRange(1, start, sh.getMaxRows(), missing.length).setNumberFormat('@');
      sh.getRange(1, start, 1, missing.length).setValues([missing]).setFontWeight('bold');
      report.addedColumns[name] = missing;
    }
    if (sh.getFrozenRows() < 1) sh.setFrozenRows(1);
  });
}

/**
 * Tạo 10 tài khoản u01…u10 nếu chưa có (idempotent). user01 là admin và đang dùng; user02…user10 bị khóa.
 * Mật khẩu ngẫu nhiên chỉ trả về MỘT lần cho người chạy lệnh (scripts/admin-cli.js ghi vào initial-passwords.txt).
 */
function createAccounts_(ss) {
  if (!schemaReady_()) fail_('not_ready', 'Chạy migrate trước.');
  var ut = table_(ss, 'users');
  var now = vnStamp_(Date.now());
  var created = [];
  for (var n = 1; n <= 10; n++) {
    var id = 'u' + (n < 10 ? '0' : '') + n;
    if (findUserIndex_(ut, 'userId', id) >= 0) continue;
    var username = 'user' + (n < 10 ? '0' : '') + n;
    if (findUserIndex_(ut, 'username', username) >= 0) username = username + '-' + id;
    var pw = generatePassword_();
    var salt = newSalt_();
    appendObjs_(ut, [{
      userId: id, username: username, displayName: username, passwordHash: hashPassword_(pw, salt), salt: salt,
      role: n === 1 ? 'admin' : 'user', active: n === 1 ? 'TRUE' : 'FALSE', mustChangePassword: 'TRUE',
      createdAt: now, lastLoginAt: ''
    }]);
    created.push({ userId: id, username: username, password: pw });
  }
  return { created: created, total: ut.rows.filter(function (r) { return !isBlankRow_(r); }).length };
}
