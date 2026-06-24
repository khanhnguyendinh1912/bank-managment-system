// auth.js — password hashing (scrypt, no native deps), JWT issue/verify, RBAC middleware
'use strict';
require('dotenv').config();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// ---- Password helpers (format: scrypt$<saltHex>$<hashHex>) ----
function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(plain, stored) {
  try {
    const [scheme, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const calc = crypto.scryptSync(plain, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    if (calc.length !== expected.length) return false;
    return crypto.timingSafeEqual(calc, expected);
  } catch {
    return false;
  }
}

// ---- Login: validate credentials, return JWT valid 8h ----
async function login(username, password) {
  const sql = `
    SELECT u.user_id, u.username, u.password_hash, u.status,
           u.customer_id, u.employee_id, r.role_name
    FROM app_users u
    JOIN roles r ON u.role_id = r.role_id
    WHERE u.username = $1`;
  const { rows } = await query(sql, [username]);
  const user = rows[0];
  if (!user) throw httpError(401, 'Sai tên đăng nhập hoặc mật khẩu');
  if (user.status !== 'Active') throw httpError(403, 'Tài khoản đã bị khóa');
  if (!verifyPassword(password, user.password_hash)) {
    throw httpError(401, 'Sai tên đăng nhập hoặc mật khẩu');
  }

  const payload = {
    uid: user.user_id,
    username: user.username,
    role: user.role_name,
    customerId: user.customer_id,
    employeeId: user.employee_id,
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return { token, user: payload };
}

// ---- Middleware: require a valid token ----
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Thiếu token xác thực' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
  }
}

// ---- Middleware factory: require one of the given roles ----
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này' });
    }
    next();
  };
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

module.exports = {
  hashPassword, verifyPassword, login,
  authRequired, requireRole, httpError,
};
