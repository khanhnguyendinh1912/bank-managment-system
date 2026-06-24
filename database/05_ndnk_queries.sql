-- Đảm bảo psql đọc file theo UTF-8 (tránh lỗi WIN1252 trên Windows)
SET client_encoding = 'UTF8';

-- ================================================================
--  BLOCK 3: BUSINESS QUERIES Q1..Q10 (NDNK)
--  Mỗi truy vấn có nhãn rõ ràng. Chạy trực tiếp trên PostgreSQL.
-- ================================================================

-- Q1: Danh sách khách hàng kèm tài khoản & số dư
SELECT c.full_name, c.phone, c.email, a.account_id, a.balance, a.status
FROM customers c
JOIN accounts a ON c.customer_id = a.customer_id
ORDER BY c.full_name;

-- Q2: Thống kê số lượng giao dịch theo loại
SELECT transaction_type AS loai_giao_dich, COUNT(*) AS so_luong
FROM transactions
GROUP BY transaction_type
ORDER BY so_luong DESC;

-- Q3: Các giao dịch thất bại (Failed) kèm thông tin khách hàng
SELECT c.full_name, c.phone, t.transaction_id, t.transaction_type, t.amount
FROM transactions t
JOIN accounts a  ON t.account_id  = a.account_id
JOIN customers c ON a.customer_id = c.customer_id
WHERE t.status = 'Failed'
ORDER BY t.transaction_id DESC;

-- Q4: Khoản vay đang Approved kèm dư nợ còn lại
SELECT c.full_name, c.phone, l.loan_id, l.loan_amount, l.remaining_amount, l.end_date
FROM customers c
JOIN loans l ON c.customer_id = l.customer_id
WHERE l.loan_status = 'Approved'
ORDER BY l.remaining_amount DESC;

-- Q5: Số nhân viên Active theo từng vai trò
SELECT r.role_name, COUNT(e.employee_id) AS so_nhan_vien
FROM roles r
JOIN employees e ON r.role_id = e.role_id
WHERE e.status = 'Active'
GROUP BY r.role_id, r.role_name
ORDER BY so_nhan_vien DESC;

-- Q6: Tổng tiền giao dịch thành công theo từng tài khoản
--     (FIX: join transactions->accounts->customers đúng khoá ngoại)
SELECT a.account_id, c.full_name, SUM(t.amount) AS tong_tien_giao_dich
FROM transactions t
JOIN accounts a  ON t.account_id  = a.account_id
JOIN customers c ON a.customer_id = c.customer_id
WHERE t.status = 'Success'
GROUP BY a.account_id, c.full_name
ORDER BY tong_tien_giao_dich DESC;

-- Q7: Khách hàng còn dư nợ (> 0) — tổng dư nợ Approved
SELECT c.full_name, c.phone,
       COUNT(l.loan_id) AS so_khoan_vay,
       SUM(l.remaining_amount) AS tong_du_no
FROM customers c
JOIN loans l ON c.customer_id = l.customer_id
WHERE l.loan_status = 'Approved'
GROUP BY c.customer_id, c.full_name, c.phone
HAVING SUM(l.remaining_amount) > 0
ORDER BY tong_du_no DESC;

-- Q8: Tiến độ trả nợ của từng khoản vay (đã trả = vay - còn lại)
SELECT l.loan_id, c.full_name, l.loan_amount, l.remaining_amount,
       l.loan_amount - l.remaining_amount AS so_tien_da_tra, l.loan_status
FROM loans l
JOIN customers c ON l.customer_id = c.customer_id
WHERE l.loan_status IN ('Approved','Completed')
ORDER BY (l.loan_amount - l.remaining_amount) DESC;

-- Q9: Top 10 tài khoản nhiều giao dịch nhất
SELECT a.account_id, c.full_name, COUNT(t.transaction_id) AS so_giao_dich
FROM accounts a
JOIN customers c    ON a.customer_id = c.customer_id
JOIN transactions t ON a.account_id  = t.account_id
GROUP BY a.account_id, c.full_name
ORDER BY so_giao_dich DESC
LIMIT 10;

-- Q10: Khoản vay Approved chưa phát sinh thanh toán nào
SELECT l.loan_id, c.full_name, c.phone, l.loan_amount, l.start_date, l.end_date
FROM loans l
JOIN customers c ON l.customer_id = c.customer_id
WHERE l.loan_status = 'Approved'
  AND l.loan_id NOT IN (SELECT loan_id FROM loan_payments)
ORDER BY l.loan_amount DESC;
