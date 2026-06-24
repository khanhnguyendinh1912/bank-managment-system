// routes.js — RESTful endpoints + validation. Calls DB stored functions for business logic.
'use strict';
const express = require('express');
const { query, withTransaction } = require('./db');
const { login, authRequired, requireRole } = require('./auth');
const { Q, MODULES, REPORTS } = require('./queries');

const router = express.Router();

// helper: run a named query from queries.js
async function runQ(key, params = []) {
  const { rows } = await query(Q[key].sql, params);
  return rows;
}
// helper: wrap async route
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  const status = e.status || 500;
  res.status(status).json({ error: e.message || 'Lỗi máy chủ' });
});
// numeric validator
function num(v, name) {
  const n = Number(v);
  if (!Number.isFinite(n)) { const e = new Error(`${name} không hợp lệ`); e.status = 400; throw e; }
  return n;
}

// ===================== AUTH =====================
router.post('/auth/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
  }
  const result = await login(String(username), String(password));
  result.modules = MODULES[result.user.role] || [];
  res.json(result);
}));

// who am I + my modules
router.get('/auth/me', authRequired, (req, res) => {
  res.json({ user: req.user, modules: MODULES[req.user.role] || [] });
});

// ===================== CUSTOMER =====================
// View personal info + balance
router.get('/me/profile', authRequired, requireRole('Customer'), wrap(async (req, res) => {
  const rows = await runQ('myProfile', [req.user.customerId]);
  if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy hồ sơ khách hàng' });
  res.json(rows[0]);
}));

router.get('/me/transactions', authRequired, requireRole('Customer'), wrap(async (req, res) => {
  res.json(await runQ('myTransactions', [req.user.customerId]));
}));

router.get('/me/loans', authRequired, requireRole('Customer'), wrap(async (req, res) => {
  res.json(await runQ('myLoans', [req.user.customerId]));
}));

// resolve the caller's own account id
async function myAccountId(customerId) {
  const { rows } = await query('SELECT account_id FROM accounts WHERE customer_id=$1', [customerId]);
  if (!rows[0]) { const e = new Error('Khách hàng chưa có tài khoản'); e.status = 400; throw e; }
  return rows[0].account_id;
}

// CASE 2: Deposit / Withdraw / Transfer (ACID via stored functions)
router.post('/transactions/deposit', authRequired, requireRole('Customer', 'Teller'), wrap(async (req, res) => {
  const amount = num(req.body.amount, 'Số tiền');
  if (amount <= 0) return res.status(400).json({ error: 'Số tiền phải lớn hơn 0' });
  const accountId = req.body.accountId ? num(req.body.accountId, 'Tài khoản')
                                       : await myAccountId(req.user.customerId);
  const r = await query('SELECT * FROM make_transaction($1,$2,$3)', [accountId, amount, 'Deposit']);
  res.json({ message: 'Nạp tiền thành công', ...r.rows[0] });
}));

router.post('/transactions/withdraw', authRequired, requireRole('Customer', 'Teller'), wrap(async (req, res) => {
  const amount = num(req.body.amount, 'Số tiền');
  if (amount <= 0) return res.status(400).json({ error: 'Số tiền phải lớn hơn 0' });
  const accountId = req.body.accountId ? num(req.body.accountId, 'Tài khoản')
                                       : await myAccountId(req.user.customerId);
  const r = await query('SELECT * FROM make_transaction($1,$2,$3)', [accountId, amount, 'Withdraw']);
  if (r.rows[0].out_status === 'Failed') {
    return res.status(400).json({ error: 'Rút tiền thất bại: số dư không đủ hoặc tài khoản bị khóa' });
  }
  res.json({ message: 'Rút tiền thành công', ...r.rows[0] });
}));

router.post('/transactions/transfer', authRequired, requireRole('Customer', 'Teller'), wrap(async (req, res) => {
  const amount = num(req.body.amount, 'Số tiền');
  const toAccount = num(req.body.toAccount, 'Tài khoản nhận');
  if (amount <= 0) return res.status(400).json({ error: 'Số tiền phải lớn hơn 0' });
  const fromAccount = req.body.fromAccount ? num(req.body.fromAccount, 'Tài khoản nguồn')
                                           : await myAccountId(req.user.customerId);
  const r = await withTransaction((c) =>
    c.query('SELECT transfer_money($1,$2,$3) AS tx', [fromAccount, toAccount, amount]));
  res.json({ message: 'Chuyển khoản thành công', tx: r.rows[0].tx });
}));

// CASE 3 (customer side): register a loan (status Pending)
router.post('/loans', authRequired, requireRole('Customer'), wrap(async (req, res) => {
  const amount = num(req.body.amount, 'Số tiền vay');
  const months = req.body.months ? num(req.body.months, 'Số tháng') : 12;
  if (amount <= 0) return res.status(400).json({ error: 'Số tiền vay phải lớn hơn 0' });
  const accountId = await myAccountId(req.user.customerId);
  const sql = `INSERT INTO loans(loan_id, customer_id, account_id, loan_amount, remaining_amount,
                 start_date, end_date, loan_status)
               VALUES ((SELECT COALESCE(MAX(loan_id),0)+1 FROM loans), $1, $2, $3, $3,
                 CURRENT_DATE, CURRENT_DATE + ($4 || ' months')::interval, 'Pending')
               RETURNING loan_id`;
  const { rows } = await query(sql, [req.user.customerId, accountId, amount, months]);
  res.json({ message: 'Đăng ký khoản vay thành công, chờ duyệt', loanId: rows[0].loan_id });
}));

// CASE 4: pay a loan
router.post('/loans/:id/pay', authRequired, requireRole('Customer'), wrap(async (req, res) => {
  const loanId = num(req.params.id, 'Mã khoản vay');
  const amount = num(req.body.amount, 'Số tiền');
  if (amount <= 0) return res.status(400).json({ error: 'Số tiền phải lớn hơn 0' });
  // ownership check
  const own = await query('SELECT 1 FROM loans WHERE loan_id=$1 AND customer_id=$2', [loanId, req.user.customerId]);
  if (!own.rows[0]) return res.status(403).json({ error: 'Khoản vay không thuộc về bạn' });
  const r = await withTransaction((c) => c.query('SELECT * FROM pay_loan($1,$2)', [loanId, amount]));
  res.json({ message: 'Thanh toán khoản vay thành công', remaining: r.rows[0].out_remaining });
}));

// ===================== TELLER =====================
// CASE 1: open account (unique CCCD + age >= 18 enforced in function & trigger)
router.post('/accounts', authRequired, requireRole('Teller', 'Admin'), wrap(async (req, res) => {
  const { cccd, fullName, dob, gender, address, phone, email } = req.body || {};
  if (!cccd || !fullName || !dob) {
    return res.status(400).json({ error: 'Thiếu CCCD, họ tên hoặc ngày sinh' });
  }
  if (!/^\d{12}$/.test(String(cccd))) {
    return res.status(400).json({ error: 'CCCD phải gồm 12 chữ số' });
  }
  const initBalance = req.body.initBalance ? num(req.body.initBalance, 'Số dư ban đầu') : 0;
  const r = await withTransaction((c) => c.query(
    'SELECT * FROM open_account($1,$2,$3,$4,$5,$6,$7,$8)',
    [cccd, fullName, dob, gender || null, address || null, phone || null, email || null, initBalance]));
  res.json({ message: 'Mở tài khoản thành công',
             customerId: r.rows[0].out_customer_id, accountId: r.rows[0].out_account_id });
}));

router.get('/customers', authRequired, requireRole('Teller', 'Admin'), wrap(async (req, res) => {
  res.json(await runQ('allCustomers'));
}));

router.get('/transactions/recent', authRequired, requireRole('Teller', 'Admin'), wrap(async (req, res) => {
  res.json(await runQ('recentTransactions'));
}));

router.get('/loans/pending', authRequired, requireRole('Teller', 'Admin'), wrap(async (req, res) => {
  res.json(await runQ('pendingLoans'));
}));

// CASE 3: teller approves a loan -> disburse
router.post('/loans/:id/approve', authRequired, requireRole('Teller', 'Admin'), wrap(async (req, res) => {
  const loanId = num(req.params.id, 'Mã khoản vay');
  await withTransaction((c) => c.query('SELECT approve_loan($1)', [loanId]));
  res.json({ message: 'Duyệt và giải ngân khoản vay thành công' });
}));

router.post('/loans/:id/reject', authRequired, requireRole('Teller', 'Admin'), wrap(async (req, res) => {
  const loanId = num(req.params.id, 'Mã khoản vay');
  const r = await query(
    `UPDATE loans SET loan_status='Rejected' WHERE loan_id=$1 AND loan_status='Pending' RETURNING loan_id`,
    [loanId]);
  if (!r.rows[0]) return res.status(400).json({ error: 'Khoản vay không ở trạng thái chờ duyệt' });
  res.json({ message: 'Đã từ chối khoản vay' });
}));

// ===================== HR =====================
router.get('/employees', authRequired, requireRole('HR', 'Admin'), wrap(async (req, res) => {
  res.json(await runQ('allEmployees'));
}));

// onboard a new employee
router.post('/employees', authRequired, requireRole('HR'), wrap(async (req, res) => {
  const { fullName, dob, gender, phone, address } = req.body || {};
  const salaryLevel = num(req.body.salaryLevel, 'Lương cơ bản');
  const allowance = req.body.allowance ? num(req.body.allowance, 'Phụ cấp') : 0;
  if (!fullName) return res.status(400).json({ error: 'Thiếu họ tên nhân viên' });
  const sql = `INSERT INTO employees(employee_id, full_name, dob, gender, phone, address,
                 salary_level, allowance, status, role_id)
               VALUES ((SELECT COALESCE(MAX(employee_id),0)+1 FROM employees),
                 $1,$2,$3,$4,$5,$6,$7,'Active',2) RETURNING employee_id`;
  const { rows } = await query(sql, [fullName, dob || null, gender || null, phone || null,
                                     address || null, salaryLevel, allowance]);
  res.json({ message: 'Thêm nhân viên thành công', employeeId: rows[0].employee_id });
}));

// update / mark inactive
router.put('/employees/:id', authRequired, requireRole('HR'), wrap(async (req, res) => {
  const id = num(req.params.id, 'Mã nhân viên');
  const { phone, address, status } = req.body || {};
  const r = await query(
    `UPDATE employees SET
       phone = COALESCE($2, phone),
       address = COALESCE($3, address),
       status = COALESCE($4, status)
     WHERE employee_id=$1 RETURNING employee_id`,
    [id, phone || null, address || null, status || null]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
  res.json({ message: 'Cập nhật nhân viên thành công' });
}));

router.get('/payroll', authRequired, requireRole('HR', 'Admin'), wrap(async (req, res) => {
  res.json(await runQ('allPayroll'));
}));

// CASE 5: HR approves payroll -> auto-transfer salary from treasury
router.post('/payroll/:id/pay', authRequired, requireRole('HR'), wrap(async (req, res) => {
  const id = num(req.params.id, 'Mã bảng lương');
  await withTransaction((c) => c.query('SELECT run_payroll($1)', [id]));
  res.json({ message: 'Đã duyệt và chi lương thành công' });
}));

// ===================== ADMIN =====================
router.get('/roles', authRequired, requireRole('Admin'), wrap(async (req, res) => {
  res.json(await runQ('allRoles'));
}));

router.get('/branch-overview', authRequired, requireRole('Admin'), wrap(async (req, res) => {
  res.json(await runQ('branchOverview'));
}));

// Admin: danh sách các báo cáo Q1..Q10 (chỉ metadata, không chạy SQL)
router.get('/reports', authRequired, requireRole('Admin'), wrap(async (req, res) => {
  res.json(REPORTS.map((r) => ({ key: r.key, title: r.title })));
}));

// Admin: chạy 1 báo cáo theo key -> trả về columns + rows
router.get('/reports/:key', authRequired, requireRole('Admin'), wrap(async (req, res) => {
  const report = REPORTS.find((r) => r.key === req.params.key);
  if (!report) return res.status(404).json({ error: 'Không tìm thấy báo cáo' });
  const { rows } = await query(report.sql);
  res.json({ title: report.title, columns: report.columns, rows });
}));

// assign role (and branch placeholder) to an employee
router.put('/employees/:id/role', authRequired, requireRole('Admin'), wrap(async (req, res) => {
  const id = num(req.params.id, 'Mã nhân viên');
  const roleId = num(req.body.roleId, 'Vai trò');
  const r = await query('UPDATE employees SET role_id=$2 WHERE employee_id=$1 RETURNING employee_id',
    [id, roleId]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
  res.json({ message: 'Phân vai trò thành công' });
}));

module.exports = router;
