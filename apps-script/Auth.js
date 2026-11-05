/**
 * Auth.js: băm mật khẩu, phiên đăng nhập, giới hạn đăng nhập sai.
 *
 *  - passwordHash = SHA-256 lặp 1000 lần trên (salt + password); salt 16 byte ngẫu nhiên (base64).
 *  - Token = ghép 2 UUID; Sheet chỉ lưu bản băm SHA-256 của token. Hạn 180 ngày kể từ lần dùng gần nhất.
 *  - Sai mật khẩu 5 lần trong 15 phút với cùng tên đăng nhập: khóa đăng nhập tên đó 15 phút (CacheService).
 */

var HASH_ROUNDS = 1000;
var SESSION_DAYS = 180;
var SEEN_REFRESH_MS = 6 * 3600 * 1000; // chỉ cập nhật lastSeenAt khi đã cũ hơn 6 giờ
var FAIL_LIMIT = 5;
var FAIL_WINDOW_S = 15 * 60;
var PASS_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // bỏ 0/o, 1/l/i
var USERNAME_RE = /^[a-z0-9._-]{3,20}$/;

/* ---------------- Mã hóa ---------------- */

function sha256_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
}

function hashPassword_(password, salt) {
  var d = sha256_(salt + password);
  for (var i = 1; i < HASH_ROUNDS; i++) d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, d);
  return Utilities.base64Encode(d);
}

function hashToken_(token) {
  return Utilities.base64Encode(sha256_(String(token)));
}

/** n byte ngẫu nhiên (0–255), lấy từ SHA-256 của UUID ngẫu nhiên. */
function randomBytes_(n) {
  var out = [];
  while (out.length < n) {
    sha256_(Utilities.getUuid() + ':' + Date.now() + ':' + Math.random()).forEach(function (b) { out.push((b + 256) % 256); });
  }
  return out.slice(0, n);
}

function newSalt_() {
  return Utilities.base64Encode(randomBytes_(16).map(function (b) { return b > 127 ? b - 256 : b; }));
}

/** Mật khẩu dễ đọc dạng k7m-q2x-9pf. */
function generatePassword_() {
  var chars = [];
  var lim = 256 - (256 % PASS_ALPHABET.length);
  while (chars.length < 9) {
    randomBytes_(16).forEach(function (b) {
      if (chars.length < 9 && b < lim) chars.push(PASS_ALPHABET.charAt(b % PASS_ALPHABET.length));
    });
  }
  return chars.slice(0, 3).join('') + '-' + chars.slice(3, 6).join('') + '-' + chars.slice(6, 9).join('');
}

function newToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

/* ---------------- Người dùng ---------------- */

function boolCell_(v) { return String(v).toUpperCase() === 'TRUE'; }

function userFromRow_(t, row) {
  return {
    userId: cell_(t, row, 'userId'),
    username: cell_(t, row, 'username'),
    displayName: cell_(t, row, 'displayName'),
    role: cell_(t, row, 'role') === 'admin' ? 'admin' : 'user',
    active: boolCell_(cell_(t, row, 'active')),
    mustChangePassword: boolCell_(cell_(t, row, 'mustChangePassword')),
    lastLoginAt: cell_(t, row, 'lastLoginAt')
  };
}

function publicUser_(u) {
  return { userId: u.userId, username: u.username, displayName: u.displayName || u.username, role: u.role, mustChangePassword: u.mustChangePassword };
}

function findUserIndex_(t, field, value) {
  for (var i = 0; i < t.rows.length; i++) if (cell_(t, t.rows[i], field) === value && value !== '') return i;
  return -1;
}

function validUsername_(name) {
  name = String(name || '').trim().toLowerCase();
  if (!USERNAME_RE.test(name)) fail_('bad_request', 'Tên đăng nhập cần 3–20 ký tự, chỉ gồm chữ thường a–z, số và . _ -');
  return name;
}

function validDisplayName_(name) {
  name = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
  if (name.length < 1 || name.length > 40) fail_('bad_request', 'Tên hiển thị cần 1–40 ký tự.');
  return name;
}

function validPassword_(pw) {
  pw = String(pw == null ? '' : pw);
  if (pw.length < 6) fail_('bad_request', 'Mật khẩu cần ít nhất 6 ký tự.');
  if (pw.length > 100) fail_('bad_request', 'Mật khẩu quá dài (tối đa 100 ký tự).');
  return pw;
}

/** Đặt mật khẩu mới cho dòng người dùng i (chưa ghi Sheet; gọi writeRows_ sau). */
function setPasswordRow_(t, i, password, mustChange) {
  var salt = newSalt_();
  t.rows[i] = mergeRow_(t, t.rows[i], {
    passwordHash: hashPassword_(password, salt), salt: salt, mustChangePassword: mustChange ? 'TRUE' : 'FALSE'
  });
}

/* ---------------- Phiên ---------------- */

function deleteSessionsWhere_(ss, pred) {
  var t = table_(ss, 'sessions');
  var del = [];
  t.rows.forEach(function (r, i) { if (!isBlankRow_(r) && pred(r, t)) del.push(i + 2); });
  del.sort(function (a, b) { return b - a; }).forEach(function (rowNum) { t.sh.deleteRow(rowNum); });
  return del.length;
}

function deleteUserSessions_(ss, userId) {
  return deleteSessionsWhere_(ss, function (r, t) { return cell_(t, r, 'userId') === userId; });
}

function sessionExpired_(lastSeenIso, now) {
  var ms = Date.parse(lastSeenIso);
  return isNaN(ms) || now - ms > SESSION_DAYS * 86400000;
}

/**
 * Xác thực token. Trả về {user, ss}. userId chỉ lấy từ token, không bao giờ từ payload.
 * Lỗi: unauthorized (token thiếu/sai/hết hạn), inactive (tài khoản bị khóa).
 */
function authenticate_(ss, token) {
  if (!token || typeof token !== 'string' || token.length > 200) fail_('unauthorized', 'Phiên đăng nhập không hợp lệ. Hãy đăng nhập lại.');
  var th = hashToken_(token);
  var st = table_(ss, 'sessions');
  var si = findUserIndex_(st, 'tokenHash', th);
  if (si < 0) fail_('unauthorized', 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
  var now = Date.now();
  var lastSeen = cell_(st, st.rows[si], 'lastSeenAt');
  if (sessionExpired_(lastSeen, now)) {
    st.sh.deleteRow(si + 2);
    fail_('unauthorized', 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
  }
  var userId = cell_(st, st.rows[si], 'userId');
  var ut = table_(ss, 'users');
  var ui = findUserIndex_(ut, 'userId', userId);
  if (ui < 0) fail_('unauthorized', 'Tài khoản không còn tồn tại.');
  var user = userFromRow_(ut, ut.rows[ui]);
  if (!user.active) fail_('inactive', 'Tài khoản này chưa được kích hoạt. Liên hệ người quản lý.');
  if (now - (Date.parse(lastSeen) || 0) > SEEN_REFRESH_MS) {
    st.rows[si] = mergeRow_(st, st.rows[si], { lastSeenAt: new Date(now).toISOString() });
    writeRows_(st, [si]);
  }
  return { user: user, tokenHash: th };
}

/* ---------------- Đăng nhập ---------------- */

function failKey_(name) { return 'fail_' + Utilities.base64EncodeWebSafe(sha256_(name)).slice(0, 40); }
function lockKey_(name) { return 'lock_' + Utilities.base64EncodeWebSafe(sha256_(name)).slice(0, 40); }

function login_(ss, payload) {
  var name = String((payload && payload.username) || '').trim().toLowerCase();
  var password = String((payload && payload.password) || '');
  if (!name || !password) fail_('bad_request', 'Nhập tên đăng nhập và mật khẩu.');
  if (name.length > 40 || password.length > 100) fail_('bad_login', 'Sai tên đăng nhập hoặc mật khẩu.');

  var cache = CacheService.getScriptCache();
  if (cache.get(lockKey_(name))) fail_('locked_out', 'Bạn đã nhập sai quá 5 lần. Thử lại sau 15 phút.');

  var ut = table_(ss, 'users');
  var i = findUserIndex_(ut, 'username', name);
  var ok = false;
  if (i >= 0) {
    var salt = cell_(ut, ut.rows[i], 'salt');
    var hash = cell_(ut, ut.rows[i], 'passwordHash');
    ok = !!salt && !!hash && hashPassword_(password, salt) === hash;
  }
  if (!ok) {
    var now = Date.now();
    var fails = [];
    try { fails = JSON.parse(cache.get(failKey_(name)) || '[]'); } catch (e) { fails = []; }
    fails = fails.filter(function (ts) { return now - ts < FAIL_WINDOW_S * 1000; });
    fails.push(now);
    if (fails.length >= FAIL_LIMIT) {
      cache.put(lockKey_(name), '1', FAIL_WINDOW_S);
      cache.remove(failKey_(name));
      fail_('locked_out', 'Bạn đã nhập sai quá 5 lần. Thử lại sau 15 phút.');
    }
    cache.put(failKey_(name), JSON.stringify(fails), FAIL_WINDOW_S);
    fail_('bad_login', 'Sai tên đăng nhập hoặc mật khẩu.');
  }
  cache.remove(failKey_(name));

  var user = userFromRow_(ut, ut.rows[i]);
  if (!user.active) fail_('inactive', 'Tài khoản này chưa được kích hoạt. Liên hệ người quản lý.');

  var nowMs = Date.now();
  // dọn phiên hết hạn
  deleteSessionsWhere_(ss, function (r, t) { return sessionExpired_(cell_(t, r, 'lastSeenAt'), nowMs); });
  var token = newToken_();
  var iso = new Date(nowMs).toISOString();
  appendObjs_(header_(ss, 'sessions'), [{ tokenHash: hashToken_(token), userId: user.userId, createdAt: iso, lastSeenAt: iso }]);
  ut.rows[i] = mergeRow_(ut, ut.rows[i], { lastLoginAt: vnStamp_(nowMs) });
  writeRows_(ut, [i]);
  return { token: token, user: publicUser_(user) };
}

function logout_(ss, ctx) {
  deleteSessionsWhere_(ss, function (r, t) { return cell_(t, r, 'tokenHash') === ctx.tokenHash; });
  return { loggedOut: true };
}

/* ---------------- Tài khoản của chính mình ---------------- */

function setPassword_(ss, ctx, payload) {
  var pw = validPassword_(payload && payload.password);
  var ut = table_(ss, 'users');
  var i = findUserIndex_(ut, 'userId', ctx.user.userId);
  setPasswordRow_(ut, i, pw, false);
  writeRows_(ut, [i]);
  return { user: publicUser_(userFromRow_(ut, ut.rows[i])) };
}

function updateProfile_(ss, ctx, payload) {
  payload = payload || {};
  var ut = table_(ss, 'users');
  var i = findUserIndex_(ut, 'userId', ctx.user.userId);
  var patch = {};
  if (payload.displayName != null) patch.displayName = validDisplayName_(payload.displayName);
  if (payload.username != null) {
    var name = validUsername_(payload.username);
    var j = findUserIndex_(ut, 'username', name);
    if (j >= 0 && j !== i) fail_('conflict', 'Tên đăng nhập "' + name + '" đã có người dùng.');
    patch.username = name;
  }
  if (!Object.keys(patch).length) fail_('bad_request', 'Không có gì để cập nhật.');
  ut.rows[i] = mergeRow_(ut, ut.rows[i], patch);
  writeRows_(ut, [i]);
  return { user: publicUser_(userFromRow_(ut, ut.rows[i])) };
}
