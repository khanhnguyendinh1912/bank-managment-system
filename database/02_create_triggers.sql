-- Đảm bảo psql đọc file theo UTF-8 (tránh lỗi WIN1252 trên Windows)
SET client_encoding = 'UTF8';

-- ================================================================
--  BLOCK 1: 6 TRIGGERS
--  Chạy trực tiếp trên PostgreSQL, không cần sửa gì
-- ================================================================


-- ----------------------------------------------------------------
-- TRIGGER 1: Chặn khách hàng dưới 18 tuổi khi đăng ký
-- Khi nào chạy: BEFORE INSERT vào bảng customers
-- Kết quả nếu vi phạm: Báo lỗi, không tạo được khách hàng
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_check_customer_age()
RETURNS TRIGGER AS $$
BEGIN
    IF EXTRACT(YEAR FROM AGE(CURRENT_DATE, NEW.dob)) < 18 THEN
        RAISE EXCEPTION 'Khách hàng phải từ 18 tuổi trở lên (ngày sinh: %)', NEW.dob;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_customer_age
BEFORE INSERT ON customers
FOR EACH ROW EXECUTE FUNCTION fn_check_customer_age();


-- ----------------------------------------------------------------
-- TRIGGER 2: Đánh dấu Failed nếu tài khoản không ở trạng thái Active
-- Khi nào chạy: BEFORE INSERT vào bảng transactions (chạy ĐẦU TIÊN)
-- Kết quả nếu vi phạm: Giao dịch vẫn được lưu nhưng status = 'Failed'
--   (đúng nguyên tắc: mọi giao dịch dù thất bại đều phải lưu vết)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_check_account_active()
RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status
    FROM accounts
    WHERE account_id = NEW.account_id;

    IF v_status IS NULL OR v_status != 'Active' THEN
        NEW.status := 'Failed';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_account_active
BEFORE INSERT ON transactions
FOR EACH ROW EXECUTE FUNCTION fn_check_account_active();


-- ----------------------------------------------------------------
-- TRIGGER 3: Đánh dấu Failed nếu số dư không đủ khi Withdraw/Transfer
-- Khi nào chạy: BEFORE INSERT vào bảng transactions (chạy SAU trigger 2)
-- Điều kiện: Chỉ kiểm tra khi giao dịch chưa bị Failed bởi trigger 2
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_check_sufficient_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_balance NUMERIC(18,2);
BEGIN
    -- Chỉ kiểm tra nếu là Withdraw/Transfer VÀ trigger 2 chưa đánh dấu Failed
    IF NEW.transaction_type IN ('Withdraw', 'Transfer')
       AND NEW.status != 'Failed' THEN

        SELECT balance INTO v_balance
        FROM accounts
        WHERE account_id = NEW.account_id;

        IF v_balance < NEW.amount THEN
            NEW.status := 'Failed';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_sufficient_balance
BEFORE INSERT ON transactions
FOR EACH ROW EXECUTE FUNCTION fn_check_sufficient_balance();


-- ----------------------------------------------------------------
-- TRIGGER 4: Tự động cập nhật số dư tài khoản sau giao dịch thành công
-- Khi nào chạy: AFTER INSERT vào bảng transactions
-- Logic:
--   Deposit / Salary / Loan_Disbursement  → cộng tiền vào tài khoản
--   Withdraw / Transfer / Loan_Payment    → trừ tiền khỏi tài khoản
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'Success' THEN

        IF NEW.transaction_type IN ('Deposit', 'Salary', 'Loan_Disbursement') THEN
            UPDATE accounts
            SET balance = balance + NEW.amount
            WHERE account_id = NEW.account_id;

        ELSIF NEW.transaction_type IN ('Withdraw', 'Transfer', 'Loan_Payment') THEN
            UPDATE accounts
            SET balance = balance - NEW.amount
            WHERE account_id = NEW.account_id;
        END IF;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_account_balance
AFTER INSERT ON transactions
FOR EACH ROW EXECUTE FUNCTION fn_update_account_balance();


-- ----------------------------------------------------------------
-- TRIGGER 5: Cập nhật dư nợ sau mỗi lần thanh toán khoản vay
--            Tự động chuyển loan_status = 'Completed' khi dư nợ về 0
-- Khi nào chạy: AFTER INSERT vào bảng loan_payments
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_update_loan_after_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_new_remaining NUMERIC(18,2);
BEGIN
    -- Tính số tiền còn lại sau khi thanh toán lần này
    SELECT remaining_amount - NEW.amount
    INTO v_new_remaining
    FROM loans
    WHERE loan_id = NEW.loan_id;

    IF v_new_remaining <= 0 THEN
        -- Trả đủ: đặt dư nợ = 0 và đánh dấu hoàn thành
        UPDATE loans
        SET remaining_amount = 0,
            loan_status      = 'Completed'
        WHERE loan_id = NEW.loan_id;
    ELSE
        -- Còn nợ: cập nhật số tiền còn lại
        UPDATE loans
        SET remaining_amount = v_new_remaining
        WHERE loan_id = NEW.loan_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_loan_after_payment
AFTER INSERT ON loan_payments
FOR EACH ROW EXECUTE FUNCTION fn_update_loan_after_payment();


-- ----------------------------------------------------------------
-- TRIGGER 6: Chặn tạo bảng lương cho nhân viên đang Inactive
-- Khi nào chạy: BEFORE INSERT vào bảng payroll
-- Kết quả nếu vi phạm: Báo lỗi, không tạo được bản ghi payroll
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_check_employee_active_payroll()
RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status
    FROM employees
    WHERE employee_id = NEW.employee_id;

    IF v_status IS NULL OR v_status != 'Active' THEN
        RAISE EXCEPTION
            'Nhân viên % không Active, không thể tạo bảng lương',
            NEW.employee_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_employee_active_payroll
BEFORE INSERT ON payroll
FOR EACH ROW EXECUTE FUNCTION fn_check_employee_active_payroll();