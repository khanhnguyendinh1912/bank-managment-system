-- Đảm bảo psql đọc file theo UTF-8 (tránh lỗi WIN1252 trên Windows)
SET client_encoding = 'UTF8';

-- ================================================================
--  BLOCK 0: TABLE DEFINITIONS
--  Run order: 01 -> 02 -> 03 -> 04 -> 05
--  Schema mirrors the provided ER diagram (draw.io) one-to-one.
--  The only addition is `app_users` (login table) because the ERD
--  has no place to store credentials/roles for the web app.
-- ================================================================

-- Khách hàng (Customer)
CREATE TABLE customers (
    customer_id INT PRIMARY KEY,
    cccd        CHAR(12) UNIQUE NOT NULL,        -- CCCD Việt Nam: 12 chữ số
    full_name   VARCHAR(100) NOT NULL,
    dob         DATE,
    gender      VARCHAR(10),
    address     TEXT,
    phone       VARCHAR(20),
    email       VARCHAR(100)
);

-- Tài khoản ngân hàng (Account) — 1 khách hàng : 1 tài khoản
CREATE TABLE accounts (
    account_id  INT PRIMARY KEY,
    customer_id INT NOT NULL UNIQUE,             -- UNIQUE => ràng buộc 1:1
    balance     NUMERIC(18,2) DEFAULT 0,
    status      VARCHAR(20) DEFAULT 'Active',
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    CHECK (status IN ('Active','Inactive'))
);

-- Vai trò (Role) — RBAC: Admin / Teller / HR / Customer
CREATE TABLE roles (
    role_id   INT PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL
);

-- Nhân viên (Employee)
CREATE TABLE employees (
    employee_id  INT PRIMARY KEY,
    full_name    VARCHAR(100) NOT NULL,
    dob          DATE,
    gender       VARCHAR(10),
    phone        VARCHAR(20),
    address      TEXT,
    salary_level NUMERIC(18,2),                  -- hệ số lương
    allowance    NUMERIC(18,2) DEFAULT 0,
    status       VARCHAR(20) DEFAULT 'Active',
    account_id   INT,                            -- tài khoản nhận lương
    role_id      INT,
    FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    FOREIGN KEY (role_id)    REFERENCES roles(role_id),
    CHECK (status IN ('Active','Inactive'))
);

-- Khoản vay (Loan)
CREATE TABLE loans (
    loan_id          INT PRIMARY KEY,
    customer_id      INT NOT NULL,
    account_id       INT NOT NULL,
    loan_amount      NUMERIC(18,2) NOT NULL,
    remaining_amount NUMERIC(18,2) NOT NULL,
    start_date       DATE,
    end_date         DATE,
    loan_status      VARCHAR(20) DEFAULT 'Pending',
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    FOREIGN KEY (account_id)  REFERENCES accounts(account_id),
    CHECK (loan_status IN ('Pending','Approved','Rejected','Completed'))
);

-- Giao dịch (Transaction)
CREATE TABLE transactions (
    transaction_id   INT PRIMARY KEY,
    account_id       INT NOT NULL,
    amount           NUMERIC(18,2) NOT NULL,
    transaction_type VARCHAR(30) NOT NULL,
    status           VARCHAR(20) DEFAULT 'Success',
    FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    CHECK (status IN ('Success','Failed'))
);

-- Thanh toán khoản vay (Loan payment)
CREATE TABLE loan_payments (
    payment_id           INT PRIMARY KEY,
    loan_id              INT NOT NULL,
    account_id           INT NOT NULL,
    transaction_id       INT UNIQUE,
    amount               NUMERIC(18,2) NOT NULL,
    payment_date         TIMESTAMP,
    remain_after_payment NUMERIC(18,2),
    FOREIGN KEY (loan_id)        REFERENCES loans(loan_id),
    FOREIGN KEY (account_id)     REFERENCES accounts(account_id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id)
);

-- Bảng lương (Payroll)
CREATE TABLE payroll (
    payroll_id     INT PRIMARY KEY,
    employee_id    INT NOT NULL,
    transaction_id INT UNIQUE,
    month_year     DATE NOT NULL,
    basic_salary   NUMERIC(18,2) NOT NULL,
    allowance      NUMERIC(18,2) DEFAULT 0,
    total_salary   NUMERIC(18,2) NOT NULL,
    status         VARCHAR(20) DEFAULT 'Unpaid',
    FOREIGN KEY (employee_id)    REFERENCES employees(employee_id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id),
    CHECK (status IN ('Paid','Unpaid'))
);

-- Chấm công (Attendance)
CREATE TABLE attendance (
    attendance_id INT PRIMARY KEY,
    employee_id   INT NOT NULL,
    work_date     DATE NOT NULL,
    check_in      TIMESTAMP,
    check_out     TIMESTAMP,
    status        VARCHAR(20),
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
    CHECK (status IN ('Present','Unpresent'))
);

-- Tài khoản đăng nhập web app (login) — phần bổ sung ngoài ERD.
-- Mỗi user gắn với 1 role và (tuỳ loại) 1 customer hoặc 1 employee.
CREATE TABLE app_users (
    user_id       INT PRIMARY KEY,
    username      VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,                 -- định dạng: scrypt$<salt_hex>$<hash_hex>
    role_id       INT NOT NULL,
    customer_id   INT,                           -- khác NULL nếu là Customer
    employee_id   INT,                           -- khác NULL nếu là nhân viên
    status        VARCHAR(20) DEFAULT 'Active',
    FOREIGN KEY (role_id)     REFERENCES roles(role_id),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
    CHECK (status IN ('Active','Inactive'))
);

-- Chỉ mục hỗ trợ truy vấn nghiệp vụ thường dùng
CREATE INDEX idx_tx_account   ON transactions(account_id);
CREATE INDEX idx_loans_cust   ON loans(customer_id);
CREATE INDEX idx_payroll_emp  ON payroll(employee_id);
