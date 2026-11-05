/**
 * Admin.js: các action quản trị (chỉ role = admin, kiểm tra ở server trong route_),
 * và các lệnh dòng lệnh cli.* dùng khóa quản trị (scripts/admin-cli.js).
 *
 * Khóa quản trị: bản băm nằm trong AdminKey.js (KHÔNG có trong git, chỉ được clasp đẩy lên Apps Script).
 * Không có AdminKey.js thì mọi lệnh cli.* bị tắt.
 */

function adminFindUser_(ut, userId) {
  var i = findUserIndex_(ut, 'userId', String(userId || ''));
  if (i < 0) fail_('bad_request', 'Không tìm thấy tài khoản.');
  return i;
}

function adminListUsers_(ss) {
  var ut = table_(ss, 'users');
  var stats = progressStats_(ss);
  var users = ut.rows.filter(function (r) { return !isBlankRow_(r); }).map(function (r) {
    var u = userFromRow_(ut, r);
    var s = stats[u.userId] || { learned: 0, due: 0, leech: 0 };
    return {
      userId: u.userId, username: u.username, displayName: u.displayName, role: u.role, active: u.active,
      mustChangePassword: u.mustChangePassword, lastLoginAt: u.lastLoginAt, learned: s.learned, due: s.due, leech: s.leech
    };
  });
  users.sort(function (a, b) { return a.userId < b.userId ? -1 : 1; });
  return { users: users };
}

function adminSetActive_(ss, ctx, p) {
  var ut = table_(ss, 'users');
  var i = adminFindUser_(ut, p.userId);
  var target = userFromRow_(ut, ut.rows[i]);
  var active = p.active === true || p.active === 'true';
  if (target.userId === ctx.user.userId && !active) fail_('forbidden', 'Không thể tự khóa tài khoản của chính mình.');
  ut.rows[i] = mergeRow_(ut, ut.rows[i], { active: active ? 'TRUE' : 'FALSE' });
  writeRows_(ut, [i]);
  if (!active) deleteUserSessions_(ss, target.userId);
  return { userId: target.userId, active: active };
}

function adminResetPassword_(ss, ctx, p) {
  var ut = table_(ss, 'users');
  var i = adminFindUser_(ut, p.userId);
  var target = userFromRow_(ut, ut.rows[i]);
  if (target.userId === ctx.user.userId) fail_('forbidden', 'Đổi mật khẩu của chính bạn ở trang Tài khoản.');
  var pw = generatePassword_();
  setPasswordRow_(ut, i, pw, true);
  writeRows_(ut, [i]);
  deleteUserSessions_(ss, target.userId);
  return { userId: target.userId, username: target.username, password: pw };
}

function adminRenameUser_(ss, ctx, p) {
  var ut = table_(ss, 'users');
  var i = adminFindUser_(ut, p.userId);
  var name = validUsername_(p.username);
  var j = findUserIndex_(ut, 'username', name);
  if (j >= 0 && j !== i) fail_('conflict', 'Tên đăng nhập "' + name + '" đã có người dùng.');
  ut.rows[i] = mergeRow_(ut, ut.rows[i], { username: name });
  writeRows_(ut, [i]);
  return { userId: cell_(ut, ut.rows[i], 'userId'), username: name };
}

/* ---------------- Lệnh dòng lệnh (khóa quản trị) ---------------- */

function cliRoute_(action, body) {
  if (typeof ADMIN_KEY_HASH === 'undefined' || !ADMIN_KEY_HASH) fail_('forbidden', 'Lệnh quản trị dòng lệnh đang tắt.');
  if (!body.adminKey || hashToken_(body.adminKey) !== ADMIN_KEY_HASH) fail_('forbidden', 'Sai khóa quản trị.');
  var p = body.payload && typeof body.payload === 'object' ? body.payload : {};
  switch (action) {
    case 'cli.status': return cliStatus_();
    case 'cli.dump': return cliDump_(p.tab);
    case 'cli.migrate': return withLock_(function () { return migrate_(openSs_()); });
    case 'cli.createAccounts': return withLock_(function () { return createAccounts_(openSs_()); });
    case 'cli.setUser': return withLock_(function () { return cliSetUser_(openSs_(), p); });
    case 'cli.purgeTestUser': return withLock_(function () { return cliPurgeTestUser_(openSs_(), p); });
  }
  fail_('bad_request', 'Lệnh không hợp lệ.');
}

/** Hiện trạng: các tab, tiêu đề, số dòng dữ liệu; phiên bản cấu trúc. Chỉ đọc. */
function cliStatus_() {
  var ss = openSs_();
  var tabs = ss.getSheets().map(function (sh) {
    var lastRow = sh.getLastRow(), lastCol = Math.max(sh.getLastColumn(), 1);
    var values = sh.getRange(1, 1, Math.max(lastRow, 1), lastCol).getDisplayValues();
    return { name: sh.getName(), headers: values[0], dataRows: values.slice(1).filter(function (r) { return !isBlankRow_(r); }).length };
  });
  return { sheetId: ss.getId(), sheetUrl: ss.getUrl(), schema: PropertiesService.getScriptProperties().getProperty('SCHEMA') || '', tabs: tabs, now: vnStamp_(Date.now()) };
}

/** Đọc nguyên một tab (để so sánh với bản sao lưu). Không đọc được users/sessions. Chỉ đọc. */
function cliDump_(tab) {
  if (USER_TABS.indexOf(tab) < 0) fail_('bad_request', 'Chỉ đọc được: ' + USER_TABS.join(', '));
  var sh = openSs_().getSheetByName(tab);
  if (!sh) fail_('bad_request', 'Không có tab ' + tab);
  var lastRow = sh.getLastRow(), lastCol = Math.max(sh.getLastColumn(), 1);
  return { tab: tab, values: sh.getRange(1, 1, Math.max(lastRow, 1), lastCol).getDisplayValues() };
}

/**
 * Dùng cho kiểm thử: đặt trạng thái một tài khoản (không bao giờ là u01).
 * p: {userId, active?, role?, username?, displayName?, resetPassword?}
 */
function cliSetUser_(ss, p) {
  if (!p.userId || p.userId === 'u01') fail_('forbidden', 'Không sửa tài khoản u01 bằng lệnh này.');
  var ut = table_(ss, 'users');
  var i = adminFindUser_(ut, p.userId);
  var patch = {};
  if (p.active != null) patch.active = p.active ? 'TRUE' : 'FALSE';
  if (p.role != null) patch.role = p.role === 'admin' ? 'admin' : 'user';
  if (p.username != null) patch.username = validUsername_(p.username);
  if (p.displayName != null) patch.displayName = validDisplayName_(p.displayName);
  ut.rows[i] = mergeRow_(ut, ut.rows[i], patch);
  var out = { userId: p.userId };
  if (p.resetPassword) {
    out.password = generatePassword_();
    setPasswordRow_(ut, i, out.password, true);
    deleteUserSessions_(ss, p.userId);
  }
  writeRows_(ut, [i]);
  return out;
}

/** Xóa dữ liệu thử của một tài khoản thử (KHÔNG BAO GIỜ u01). Xóa dòng progress/log/custom_words/settings và phiên. */
function cliPurgeTestUser_(ss, p) {
  if (!p.userId || p.userId === 'u01' || !/^u\d{2}$/.test(p.userId)) fail_('forbidden', 'Không xóa dữ liệu của tài khoản này.');
  var removed = {};
  USER_TABS.forEach(function (name) {
    var t = table_(ss, name);
    var rows = userRows_(t, p.userId).map(function (i) { return i + 2; }).sort(function (a, b) { return b - a; });
    rows.forEach(function (r) { t.sh.deleteRow(r); });
    removed[name] = rows.length;
  });
  removed.sessions = deleteUserSessions_(ss, p.userId);
  return { userId: p.userId, removed: removed };
}
