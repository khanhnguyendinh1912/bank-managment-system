-- ================================================================
--  BLOCK 2: STORED FUNCTIONS
--  Part A: 3 helper functions (giữ nguyên theo đề)
--  Part B: business functions cho các Use Case 1..5 (backend gọi)
--  Tất cả đều an toàn ACID khi chạy trong 1 transaction.
-- ================================================================

-- ================= PART A: HELPER FUNCTIONS =====================

-- FN1: số dư tài khoản Active của khách hàng
CREATE OR REPLACE FUNCTION get_customer_balance(p_customer_id INT)
RETURNS NUMERIC AS $$
DECLARE v_balance NUMERIC(18,2);
BEGIN
    SELECT balance INTO v_balance
    FROM accounts WHERE customer_id = p_customer_id AND status = 'Active';
    IF v_balance IS NULL THEN
        RAISE EXCEPTION 'Khong tim thay tai khoan Active cho customer_id: %', p_customer_id;
    END IF;
    RETURN v_balance;
END; $$ LANGUAGE plpgsql;

-- FN2: tổng dư nợ (các khoản vay Approved) của khách hàng
CREATE OR REPLACE FUNCTION get_total_debt(p_customer_id INT)
RETURNS NUMERIC AS $$
DECLARE v_total_debt NUMERIC(18,2);
BEGIN
    SELECT COALESCE(SUM(remaining_amount),0) INTO v_total_debt
    FROM loans WHERE customer_id = p_customer_id AND loan_status = 'Approved';
    RETURN v_total_debt;
END; $$ LANGUAGE plpgsql;

-- FN3: tính lương = base_salary * salary_level + allowance
CREATE OR REPLACE FUNCTION calculate_employee_salary(p_employee_id INT, p_base_salary NUMERIC)
RETURNS NUMERIC AS $$
DECLARE v_salary_level NUMERIC(18,2); v_allowance NUMERIC(18,2); v_total NUMERIC(18,2);
BEGIN
    SELECT salary_level, allowance INTO v_salary_level, v_allowance
    FROM employees WHERE employee_id = p_employee_id;
    IF v_salary_level IS NULL THEN
        RAISE EXCEPTION 'Khong tim thay nhan vien voi employee_id: %', p_employee_id;
    END IF;
    v_total := p_base_salary * v_salary_level + v_allowance;
    RETURN v_total;
END; $$ LANGUAGE plpgsql;


-- ================= PART B: BUSINESS FUNCTIONS ===================

-- CASE 1: Mở tài khoản — kiểm tra CCCD duy nhất + tuổi >= 18,
--         tự sinh customer_id / account_id, ràng buộc 1 KH : 1 TK.
CREATE OR REPLACE FUNCTION open_account(
    p_cccd VARCHAR, p_full_name VARCHAR, p_dob DATE,
    p_gender VARCHAR, p_address TEXT, p_phone VARCHAR, p_email VARCHAR,
    p_init_balance NUMERIC DEFAULT 0
) RETURNS TABLE(out_customer_id INT, out_account_id INT) AS $$
DECLARE v_cid INT; v_aid INT;
BEGIN
    IF EXISTS (SELECT 1 FROM customers WHERE cccd = p_cccd) THEN
        RAISE EXCEPTION 'CCCD % da ton tai', p_cccd;
    END IF;
    -- (trigger trg_check_customer_age cũng chặn < 18, kiểm tra ở đây cho thông báo rõ ràng)
    IF EXTRACT(YEAR FROM AGE(CURRENT_DATE, p_dob)) < 18 THEN
        RAISE EXCEPTION 'Khach hang phai tu 18 tuoi tro len';
    END IF;

    SELECT COALESCE(MAX(customer_id),0)+1 INTO v_cid FROM customers;
    INSERT INTO customers(customer_id,cccd,full_name,dob,gender,address,phone,email)
    VALUES (v_cid,p_cccd,p_full_name,p_dob,p_gender,p_address,p_phone,p_email);

    SELECT COALESCE(MAX(account_id),0)+1 INTO v_aid FROM accounts;
    INSERT INTO accounts(account_id,customer_id,balance,status)
    VALUES (v_aid,v_cid,COALESCE(p_init_balance,0),'Active');

    out_customer_id := v_cid; out_account_id := v_aid;
    RETURN NEXT;
END; $$ LANGUAGE plpgsql;

-- CASE 2 (helper): tạo 1 giao dịch và trả về trạng thái sau khi trigger xử lý.
CREATE OR REPLACE FUNCTION make_transaction(
    p_account_id INT, p_amount NUMERIC, p_type VARCHAR
) RETURNS TABLE(out_tx_id INT, out_status VARCHAR) AS $$
DECLARE v_tx INT; v_status VARCHAR(20);
BEGIN
    IF p_amount <= 0 THEN RAISE EXCEPTION 'So tien phai lon hon 0'; END IF;
    SELECT COALESCE(MAX(transaction_id),0)+1 INTO v_tx FROM transactions;
    -- triggers tự set Failed nếu account khong Active / khong du so du, va tu cap nhat balance
    INSERT INTO transactions(transaction_id,account_id,amount,transaction_type,status)
    VALUES (v_tx,p_account_id,p_amount,p_type,'Success');
    SELECT status INTO v_status FROM transactions WHERE transaction_id = v_tx;
    out_tx_id := v_tx; out_status := v_status;
    RETURN NEXT;
END; $$ LANGUAGE plpgsql;

-- CASE 2: Chuyển khoản giữa 2 tài khoản (ACID).
-- Trừ tiền người gửi (Transfer) -> nếu Failed thì RAISE để rollback.
-- Cộng tiền người nhận (Deposit) trong cùng transaction.
CREATE OR REPLACE FUNCTION transfer_money(
    p_from_account INT, p_to_account INT, p_amount NUMERIC
) RETURNS INT AS $$
DECLARE v_tx INT; v_status VARCHAR(20);
BEGIN
    IF p_from_account = p_to_account THEN
        RAISE EXCEPTION 'Tai khoan nguon va dich phai khac nhau';
    END IF;
    SELECT out_tx_id, out_status INTO v_tx, v_status
    FROM make_transaction(p_from_account, p_amount, 'Transfer');
    IF v_status = 'Failed' THEN
        RAISE EXCEPTION 'Chuyen khoan that bai: tai khoan khoa hoac khong du so du';
    END IF;
    PERFORM make_transaction(p_to_account, p_amount, 'Deposit');
    RETURN v_tx;
END; $$ LANGUAGE plpgsql;

-- CASE 3: Duyệt khoản vay -> giải ngân vào tài khoản KH + ghi giao dịch.
CREATE OR REPLACE FUNCTION approve_loan(p_loan_id INT)
RETURNS VARCHAR AS $$
DECLARE v_amount NUMERIC(18,2); v_account INT; v_status VARCHAR(20);
BEGIN
    SELECT loan_amount, account_id, loan_status
    INTO v_amount, v_account, v_status
    FROM loans WHERE loan_id = p_loan_id FOR UPDATE;
    IF v_amount IS NULL THEN RAISE EXCEPTION 'Khong tim thay khoan vay %', p_loan_id; END IF;
    IF v_status <> 'Pending' THEN RAISE EXCEPTION 'Khoan vay khong o trang thai Pending'; END IF;
    IF v_amount <= 0 THEN RAISE EXCEPTION 'So tien vay phai lon hon 0'; END IF;

    UPDATE loans SET loan_status='Approved', remaining_amount=v_amount WHERE loan_id=p_loan_id;
    -- giải ngân: Loan_Disbursement -> trigger cộng tiền vào tài khoản
    PERFORM make_transaction(v_account, v_amount, 'Loan_Disbursement');
    RETURN 'Approved';
END; $$ LANGUAGE plpgsql;

-- CASE 4: Thanh toán khoản vay -> trừ tiền + ghi loan_payment.
-- Trigger 5 tự cập nhật remaining_amount và set Completed khi về 0.
CREATE OR REPLACE FUNCTION pay_loan(p_loan_id INT, p_amount NUMERIC)
RETURNS TABLE(out_tx_id INT, out_remaining NUMERIC) AS $$
DECLARE v_account INT; v_remaining NUMERIC(18,2); v_status VARCHAR(20);
        v_tx INT; v_tx_status VARCHAR(20); v_pay INT; v_pay_amount NUMERIC(18,2);
BEGIN
    SELECT account_id, remaining_amount, loan_status
    INTO v_account, v_remaining, v_status
    FROM loans WHERE loan_id = p_loan_id FOR UPDATE;
    IF v_account IS NULL THEN RAISE EXCEPTION 'Khong tim thay khoan vay %', p_loan_id; END IF;
    IF v_status <> 'Approved' THEN RAISE EXCEPTION 'Chi tra duoc khoan vay dang Approved'; END IF;
    IF p_amount <= 0 THEN RAISE EXCEPTION 'So tien tra phai lon hon 0'; END IF;

    -- không cho trả vượt dư nợ
    v_pay_amount := LEAST(p_amount, v_remaining);

    SELECT out_tx_id, out_status INTO v_tx, v_tx_status
    FROM make_transaction(v_account, v_pay_amount, 'Loan_Payment');
    IF v_tx_status = 'Failed' THEN
        RAISE EXCEPTION 'Thanh toan that bai: tai khoan khoa hoac khong du so du';
    END IF;

    SELECT COALESCE(MAX(payment_id),0)+1 INTO v_pay FROM loan_payments;
    INSERT INTO loan_payments(payment_id,loan_id,account_id,transaction_id,amount,payment_date,remain_after_payment)
    VALUES (v_pay,p_loan_id,v_account,v_tx,v_pay_amount,CURRENT_TIMESTAMP,GREATEST(v_remaining-v_pay_amount,0));

    SELECT remaining_amount INTO v_remaining FROM loans WHERE loan_id = p_loan_id;
    out_tx_id := v_tx; out_remaining := v_remaining;
    RETURN NEXT;
END; $$ LANGUAGE plpgsql;

-- CASE 5: HR duyệt 1 bảng lương -> chi lương từ quỹ trung tâm (acc 99)
-- sang tài khoản nhân viên, ghi giao dịch Salary, set payroll = Paid.
CREATE OR REPLACE FUNCTION run_payroll(p_payroll_id INT, p_treasury_account INT DEFAULT 99)
RETURNS INT AS $$
DECLARE v_emp INT; v_total NUMERIC(18,2); v_status VARCHAR(20); v_acc INT;
        v_tx INT; v_tx_status VARCHAR(20);
BEGIN
    SELECT employee_id, total_salary, status INTO v_emp, v_total, v_status
    FROM payroll WHERE payroll_id = p_payroll_id FOR UPDATE;
    IF v_emp IS NULL THEN RAISE EXCEPTION 'Khong tim thay bang luong %', p_payroll_id; END IF;
    IF v_status = 'Paid' THEN RAISE EXCEPTION 'Bang luong da duoc chi'; END IF;

    SELECT account_id INTO v_acc FROM employees WHERE employee_id = v_emp;
    IF v_acc IS NULL THEN RAISE EXCEPTION 'Nhan vien chua co tai khoan nhan luong'; END IF;

    -- trừ quỹ trung tâm
    SELECT out_tx_id, out_status INTO v_tx, v_tx_status
    FROM make_transaction(p_treasury_account, v_total, 'Withdraw');
    IF v_tx_status = 'Failed' THEN RAISE EXCEPTION 'Quy trung tam khong du de chi luong'; END IF;

    -- cộng cho nhân viên (Salary)
    SELECT out_tx_id INTO v_tx FROM make_transaction(v_acc, v_total, 'Salary');

    UPDATE payroll SET status='Paid', transaction_id=v_tx WHERE payroll_id=p_payroll_id;
    RETURN v_tx;
END; $$ LANGUAGE plpgsql;
