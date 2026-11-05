/**
 * api.js: gọi Apps Script và hàng đợi lưu tự động.
 *
 * - POST text/plain (tránh preflight CORS), redirect: 'follow' (Apps Script trả 302 sang googleusercontent).
 * - Hàng đợi: gửi sau 2 giây không có thao tác mới, hoặc đủ 10 sự kiện, hoặc khi trang bị ẩn.
 *   Ghi tạm vào localStorage theo userId. Lỗi mạng: thử lại sau 5, 15, 60 giây (và ở lần mở trang sau).
 *   Phiên hết hạn: giữ nguyên hàng đợi, báo để đưa về trang đăng nhập; đăng nhập lại thì gửi tiếp.
 */
import { API_URL } from '../config.js';

export class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const AUTH_CODES = ['unauthorized', 'inactive', 'must_change_password'];
export const isAuthError = (e) => !!e && AUTH_CODES.includes(e.code);

export async function call(action, payload, token, opts = {}) {
  const body = JSON.stringify({ action, token: token || undefined, payload: payload || {} });
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, redirect: 'follow',
      keepalive: !!opts.keepalive && body.length < 60000
    });
  } catch (e) {
    throw new ApiError('network', 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
  }
  let json;
  try { json = await res.json(); } catch (e) { throw new ApiError('network', 'Máy chủ trả về dữ liệu không đọc được. Thử lại sau.'); }
  if (!json || !json.ok) {
    const err = (json && json.error) || {};
    throw new ApiError(err.code || 'server_error', err.message || 'Lỗi máy chủ. Thử lại sau.');
  }
  return json.data;
}

/** Gửi khi trang đóng: sendBeacon nếu được, không thì fetch keepalive. Không đọc được kết quả. */
function beacon(action, payload, token) {
  const body = JSON.stringify({ action, token, payload });
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(API_URL, new Blob([body], { type: 'text/plain;charset=utf-8' }))) return true;
  } catch (e) { /* thử cách khác */ }
  try {
    fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, keepalive: true, mode: 'no-cors' });
    return true;
  } catch (e) { return false; }
}

export const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bộ nhớ đầy hoặc bị chặn: bỏ qua */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* bỏ qua */ } }
};

const BATCH = 40;
const RETRY = [5, 15, 60];

export class SyncQueue {
  /** opts: {userId, getToken, onStatus(s), onSaved(data), onAuthError(err)} */
  constructor(opts) {
    this.o = opts;
    this.key = 'gre.queue.' + opts.userId;
    this.queue = LS.get(this.key, []);
    this.inflight = false;
    this.paused = false;
    this.timer = null;
    this.retryTimer = null;
    this.retryN = 0;
    this.status = 'saved';
  }

  persist() { LS.set(this.key, this.queue); }

  push(ev) {
    this.queue.push(ev);
    this.persist();
    this.setStatus('pending');
    clearTimeout(this.timer);
    if (this.queue.length >= 10) this.flush();
    else this.timer = setTimeout(() => this.flush(), 2000);
  }

  async flush(opts = {}) {
    clearTimeout(this.timer);
    if (this.inflight || this.paused) return;
    if (!this.queue.length) { this.setStatus('saved'); return; }
    const token = this.o.getToken();
    if (!token) { this.setStatus('error'); return; }
    const batch = this.queue.slice(0, BATCH);
    this.inflight = true;
    this.setStatus('saving');
    try {
      const data = await call('saveEvents', { events: batch }, token, { keepalive: !!opts.keepalive });
      const sent = new Set(batch.map((e) => e.id));
      this.queue = this.queue.filter((e) => !sent.has(e.id));
      this.persist();
      this.inflight = false;
      this.retryN = 0;
      clearTimeout(this.retryTimer);
      if (this.o.onSaved) this.o.onSaved(data);
      if (this.queue.length) this.flush(); else this.setStatus('saved');
    } catch (err) {
      this.inflight = false;
      if (isAuthError(err)) {
        this.paused = true; // giữ hàng đợi; gửi tiếp sau khi đăng nhập lại
        this.setStatus('error');
        if (this.o.onAuthError) this.o.onAuthError(err);
        return;
      }
      this.scheduleRetry();
    }
  }

  scheduleRetry() {
    this.setStatus('error');
    const d = RETRY[Math.min(this.retryN, RETRY.length - 1)];
    this.retryN++;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.flush(), d * 1000);
  }

  /** Trang sắp đóng: gửi phần còn lại bằng beacon. Vẫn giữ trong hàng đợi; lần mở sau gửi lại (server bỏ qua bản trùng). */
  flushOnExit() {
    if (!this.queue.length || this.paused) return;
    const token = this.o.getToken();
    if (token) beacon('saveEvents', { events: this.queue.slice(0, BATCH) }, token);
  }

  resume() { this.paused = false; this.retryN = 0; this.flush(); }
  stop() { clearTimeout(this.timer); clearTimeout(this.retryTimer); this.paused = true; }

  setStatus(s) {
    this.status = s;
    if (this.o.onStatus) this.o.onStatus(s);
  }
}
