// queries.js — parameterized SQL + Vietnamese descriptions + sidebar module map
'use strict';

// Each entry: { sql, params(req), desc }. `params` maps the request to an array.
const Q = {
  // ---- Customer self-service ----
  myProfile: {
    desc: 'Thông tin cá nhân của khách hàng',
    sql: `SELECT c.customer_id, c.cccd, c.full_name, c.dob, c.gender,
                 c.address, c.phone, c.email, a.account_id, a.balance, a.status
          FROM customers c
          JOIN accounts a ON a.customer_id = c.customer_id
          WHERE c.customer_id = $1`,
  },
  myTransactions: {
    desc: 'Lịch sử giao dịch của khách hàng',
    sql: `SELECT t.transaction_id, t.amount, t.transaction_type, t.status
          FROM transactions t
          JOIN accounts a ON a.account_id = t.account_id
          WHERE a.customer_id = $1
          ORDER BY t.transaction_id DESC`,
  },
  myLoans: {
    desc: 'Danh sách khoản vay của khách hàng',
    sql: `SELECT loan_id, loan_amount, remaining_amount, start_date, end_date, loan_status
          FROM loans WHERE customer_id = $1
          ORDER BY loan_id DESC`,
  },

  // ---- Teller / shared listings ----
  allCustomers: {
    desc: 'Tất cả khách hàng kèm tài khoản',
    sql: `SELECT c.customer_id, c.cccd, c.full_name, c.phone, c.email,
                 a.account_id, a.balance, a.status
          FROM customers c
          LEFT JOIN accounts a ON a.customer_id = c.customer_id
          ORDER BY c.customer_id`,
  },
  pendingLoans: {
    desc: 'Khoản vay chờ duyệt',
    sql: `SELECT l.loan_id, c.full_name, l.account_id, l.loan_amount,
                 l.start_date, l.end_date, l.loan_status
          FROM loans l JOIN customers c ON c.customer_id = l.customer_id
          WHERE l.loan_status = 'Pending'
          ORDER BY l.loan_id`,
  },
  recentTransactions: {
    desc: 'Giao dịch gần đây toàn hệ thống',
    sql: `SELECT t.transaction_id, c.full_name, t.account_id, t.amount,
                 t.transaction_type, t.status
          FROM transactions t
          JOIN accounts a ON a.account_id = t.account_id
          JOIN customers c ON c.customer_id = a.customer_id
          ORDER BY t.transaction_id DESC LIMIT 50`,
  },

  // ---- HR ----
  allEmployees: {
    desc: 'Danh sách nhân viên',
    sql: `SELECT e.employee_id, e.full_name, e.phone, e.salary_level, e.allowance,
                 e.status, e.account_id, r.role_name
          FROM employees e LEFT JOIN roles r ON r.role_id = e.role_id
          ORDER BY e.employee_id`,
  },
  allPayroll: {
    desc: 'Bảng lương nhân viên',
    sql: `SELECT p.payroll_id, e.full_name, p.month_year, p.basic_salary,
                 p.allowance, p.total_salary, p.status
          FROM payroll p JOIN employees e ON e.employee_id = p.employee_id
          ORDER BY p.month_year DESC, p.payroll_id`,
  },

  // ---- Admin ----
  allRoles: {
    desc: 'Danh sách vai trò',
    sql: `SELECT role_id, role_name FROM roles ORDER BY role_id`,
  },
  branchOverview: {
    desc: 'Phân công nhân viên theo vai trò',
    sql: `SELECT e.employee_id, e.full_name, r.role_name, e.status
          FROM employees e JOIN roles r ON r.role_id = e.role_id
          ORDER BY r.role_name, e.employee_id`,
  },
};

// Sidebar modules per role (key = client view id, label = Vietnamese)
const MODULES = {
  Customer: [
    { id: 'overview',     label: 'Tổng quan' },
    { id: 'profile',      label: 'Thông tin cá nhân' },
    { id: 'transactions', label: 'Lịch sử giao dịch' },
    { id: 'transfer',     label: 'Giao dịch tiền' },
    { id: 'loans',        label: 'Khoản vay' },
  ],
  Teller: [
    { id: 'overview',     label: 'Tổng quan' },
    { id: 'open-account', label: 'Mở tài khoản' },
    { id: 'customers',    label: 'Khách hàng' },
    { id: 'verify-tx',    label: 'Giao dịch hệ thống' },
    { id: 'approve-loan', label: 'Duyệt khoản vay' },
  ],
  HR: [
    { id: 'overview',     label: 'Tổng quan' },
    { id: 'employees',    label: 'Nhân viên' },
    { id: 'payroll',      label: 'Bảng lương' },
  ],
  Admin: [
    { id: 'overview',     label: 'Tổng quan' },
    { id: 'employees',    label: 'Nhân viên' },
    { id: 'assign',       label: 'Phân vai trò' },
    { id: 'roles',        label: 'Vai trò' },
  ],
};

module.exports = { Q, MODULES };
