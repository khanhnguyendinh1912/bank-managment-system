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
    { id: 'reports',      label: 'Báo cáo (Q1–Q10)' },
  ],
};

// ---- Business report queries Q1..Q10 (đồng bộ với 05_ndnk_queries.sql) ----
// Mỗi báo cáo: title (tiếng Việt), columns (nhãn cột hiển thị) và sql.
const REPORTS = [
  {
    key: 'q1',
    title: 'Q1 — Khách hàng kèm tài khoản & số dư',
    columns: ['Họ tên', 'SĐT', 'Email', 'Mã TK', 'Số dư', 'Trạng thái'],
    sql: `SELECT c.full_name, c.phone, c.email, a.account_id, a.balance, a.status
          FROM customers c
          JOIN accounts a ON c.customer_id = a.customer_id
          ORDER BY c.full_name`,
  },
  {
    key: 'q2',
    title: 'Q2 — Thống kê số lượng giao dịch theo loại',
    columns: ['Loại giao dịch', 'Số lượng'],
    sql: `SELECT transaction_type AS loai_giao_dich, COUNT(*) AS so_luong
          FROM transactions
          GROUP BY transaction_type
          ORDER BY so_luong DESC`,
  },
  {
    key: 'q3',
    title: 'Q3 — Giao dịch thất bại kèm thông tin khách hàng',
    columns: ['Họ tên', 'SĐT', 'Mã GD', 'Loại', 'Số tiền'],
    sql: `SELECT c.full_name, c.phone, t.transaction_id, t.transaction_type, t.amount
          FROM transactions t
          JOIN accounts a  ON t.account_id  = a.account_id
          JOIN customers c ON a.customer_id = c.customer_id
          WHERE t.status = 'Failed'
          ORDER BY t.transaction_id DESC`,
  },
  {
    key: 'q4',
    title: 'Q4 — Khoản vay đang Approved kèm dư nợ',
    columns: ['Họ tên', 'SĐT', 'Mã vay', 'Số tiền vay', 'Còn lại', 'Ngày kết thúc'],
    sql: `SELECT c.full_name, c.phone, l.loan_id, l.loan_amount, l.remaining_amount, l.end_date
          FROM customers c
          JOIN loans l ON c.customer_id = l.customer_id
          WHERE l.loan_status = 'Approved'
          ORDER BY l.remaining_amount DESC`,
  },
  {
    key: 'q5',
    title: 'Q5 — Số nhân viên Active theo vai trò',
    columns: ['Vai trò', 'Số nhân viên'],
    sql: `SELECT r.role_name, COUNT(e.employee_id) AS so_nhan_vien
          FROM roles r
          JOIN employees e ON r.role_id = e.role_id
          WHERE e.status = 'Active'
          GROUP BY r.role_id, r.role_name
          ORDER BY so_nhan_vien DESC`,
  },
  {
    key: 'q6',
    title: 'Q6 — Tổng tiền giao dịch thành công theo tài khoản',
    columns: ['Mã TK', 'Họ tên', 'Tổng tiền giao dịch'],
    sql: `SELECT a.account_id, c.full_name, SUM(t.amount) AS tong_tien_giao_dich
          FROM transactions t
          JOIN accounts a  ON t.account_id  = a.account_id
          JOIN customers c ON a.customer_id = c.customer_id
          WHERE t.status = 'Success'
          GROUP BY a.account_id, c.full_name
          ORDER BY tong_tien_giao_dich DESC`,
  },
  {
    key: 'q7',
    title: 'Q7 — Khách hàng còn dư nợ (> 0)',
    columns: ['Họ tên', 'SĐT', 'Số khoản vay', 'Tổng dư nợ'],
    sql: `SELECT c.full_name, c.phone,
                 COUNT(l.loan_id) AS so_khoan_vay,
                 SUM(l.remaining_amount) AS tong_du_no
          FROM customers c
          JOIN loans l ON c.customer_id = l.customer_id
          WHERE l.loan_status = 'Approved'
          GROUP BY c.customer_id, c.full_name, c.phone
          HAVING SUM(l.remaining_amount) > 0
          ORDER BY tong_du_no DESC`,
  },
  {
    key: 'q8',
    title: 'Q8 — Tiến độ trả nợ từng khoản vay',
    columns: ['Mã vay', 'Họ tên', 'Số tiền vay', 'Còn lại', 'Đã trả', 'Trạng thái'],
    sql: `SELECT l.loan_id, c.full_name, l.loan_amount, l.remaining_amount,
                 l.loan_amount - l.remaining_amount AS so_tien_da_tra, l.loan_status
          FROM loans l
          JOIN customers c ON l.customer_id = c.customer_id
          WHERE l.loan_status IN ('Approved','Completed')
          ORDER BY (l.loan_amount - l.remaining_amount) DESC`,
  },
  {
    key: 'q9',
    title: 'Q9 — Top 10 tài khoản nhiều giao dịch nhất',
    columns: ['Mã TK', 'Họ tên', 'Số giao dịch'],
    sql: `SELECT a.account_id, c.full_name, COUNT(t.transaction_id) AS so_giao_dich
          FROM accounts a
          JOIN customers c    ON a.customer_id = c.customer_id
          JOIN transactions t ON a.account_id  = t.account_id
          GROUP BY a.account_id, c.full_name
          ORDER BY so_giao_dich DESC
          LIMIT 10`,
  },
  {
    key: 'q10',
    title: 'Q10 — Khoản vay Approved chưa có thanh toán',
    columns: ['Mã vay', 'Họ tên', 'SĐT', 'Số tiền vay', 'Ngày bắt đầu', 'Ngày kết thúc'],
    sql: `SELECT l.loan_id, c.full_name, c.phone, l.loan_amount, l.start_date, l.end_date
          FROM loans l
          JOIN customers c ON l.customer_id = c.customer_id
          WHERE l.loan_status = 'Approved'
            AND l.loan_id NOT IN (SELECT loan_id FROM loan_payments)
          ORDER BY l.loan_amount DESC`,
  },
];

module.exports = { Q, MODULES, REPORTS };
