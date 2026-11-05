// Cấu hình công khai của web. URL Apps Script được phép công khai: mọi thao tác đọc/ghi đều cần phiên đăng nhập.
const PROD_API = 'https://script.google.com/macros/s/AKfycbyIaqHWNRFGjiFUpCgf1pkX5VUXZDMiQ_6uudYhcWbish4i9D0jQYr7LnM4nULKB-Iv/exec';

// Chạy thử trên máy (npm run dev): dùng API giả lập cục bộ /api, trừ khi mở với ?api=real.
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
const forceReal = new URLSearchParams(location.search).get('api') === 'real';

export const API_URL = local && !forceReal ? '/api' : PROD_API;
export const EXAM_DATE = '2026-12-18';
