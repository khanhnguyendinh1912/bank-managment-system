-- ================================================================
--  BLOCK: SAMPLE DATA
--  Insert order respects FKs AND active triggers:
--    roles -> customers -> accounts -> employees -> loans
--    -> transactions -> loan_payments -> payroll -> attendance
--    -> app_users
--  NOTE: triggers are ACTIVE while inserting, so:
--    * Success transactions adjust account balances automatically
--    * loan_payments rows reduce loans.remaining_amount automatically
--  Final balances/debts are documented inline below.
-- ================================================================

-- ---------------- ROLES (RBAC: 4 vai trò) ----------------
INSERT INTO roles (role_id, role_name) VALUES
(1, 'Admin'),
(2, 'Teller'),
(3, 'HR'),
(4, 'Customer');

-- ---------------- CUSTOMERS ----------------
-- 1..5: khách hàng thường | 6..8: nhân viên (đứng tên chủ tài khoản nhận lương)
-- 99 : tài khoản trung tâm của ngân hàng (nguồn chi lương / giải ngân)
INSERT INTO customers (customer_id, cccd, full_name, dob, gender, address, phone, email) VALUES
(1 ,'001001001001','Nguyen Van A'   ,'2000-01-15','Male'  ,'Ha Noi'   ,'0911111111','a@gmail.com'),
(2 ,'001001001002','Tran Thi B'     ,'1999-03-10','Female','Hai Phong','0922222222','b@gmail.com'),
(3 ,'001001001003','Le Van C'       ,'1998-06-25','Male'  ,'Da Nang'  ,'0933333333','c@gmail.com'),
(4 ,'001001001004','Pham Thi D'     ,'2001-08-11','Female','Nam Dinh' ,'0944444444','d@gmail.com'),
(5 ,'001001001005','Hoang Van E'    ,'1997-12-20','Male'  ,'Ha Noi'   ,'0955555555','e@gmail.com'),
(6 ,'001001001006','Nguyen Minh Duc','1990-05-10','Male'  ,'Ha Noi'   ,'0901111111','duc@bank.vn'),
(7 ,'001001001007','Tran Hoang Long','1992-08-20','Male'  ,'Ha Noi'   ,'0902222222','long@bank.vn'),
(8 ,'001001001008','Le Quang Huy'   ,'1993-11-15','Male'  ,'Ha Noi'   ,'0903333333','huy@bank.vn'),
(99,'009999999999','NGAN HANG TRUNG TAM','1990-01-01','Other','Tru so chinh','0900000000','treasury@bank.vn');

-- ---------------- ACCOUNTS (1 customer : 1 account) ----------------
INSERT INTO accounts (account_id, customer_id, balance, status) VALUES
(1 ,1 , 50000000,'Active'),
(2 ,2 , 30000000,'Active'),
(3 ,3 , 70000000,'Active'),
(4 ,4 , 25000000,'Active'),
(5 ,5 , 10000000,'Active'),
(6 ,6 ,        0,'Active'),
(7 ,7 ,        0,'Active'),
(8 ,8 ,        0,'Active'),
(99,99,100000000000,'Active');   -- quỹ trung tâm

-- ---------------- EMPLOYEES ----------------
-- salary_level ở bộ dữ liệu này đóng vai trò "lương cơ bản theo tháng".
-- role: emp1=Teller, emp2=HR, emp3=Admin
INSERT INTO employees (employee_id, full_name, dob, gender, phone, address, salary_level, allowance, status, account_id, role_id) VALUES
(1,'Nguyen Minh Duc','1990-05-10','Male','0901111111','Ha Noi',12000000,2000000,'Active',6,2),
(2,'Tran Hoang Long','1992-08-20','Male','0902222222','Ha Noi',10000000,1500000,'Active',7,3),
(3,'Le Quang Huy'   ,'1993-11-15','Male','0903333333','Ha Noi', 9000000,1000000,'Active',8,1);

-- ---------------- LOANS ----------------
-- 1,2 Approved (sẽ có thanh toán) | 3 Approved (chưa trả -> dùng cho Q10) | 4 Pending (demo duyệt vay)
INSERT INTO loans (loan_id, customer_id, account_id, loan_amount, remaining_amount, start_date, end_date, loan_status) VALUES
(1,1,1,100000000,100000000,'2025-01-01','2028-01-01','Approved'),
(2,2,2, 50000000, 50000000,'2025-02-01','2027-02-01','Approved'),
(3,3,3, 70000000, 70000000,'2025-03-01','2028-03-01','Approved'),
(4,4,4, 30000000, 30000000,'2025-06-01','2027-06-01','Pending');

-- ---------------- TRANSACTIONS (phải insert TRƯỚC loan_payments) ----------------
-- tx5 cố tình rút vượt số dư -> trigger đánh dấu Failed (phục vụ Q3)
-- tx6, tx7 là Loan_Payment -> trigger trừ tiền tài khoản
INSERT INTO transactions (transaction_id, account_id, amount, transaction_type, status) VALUES
(1,1,5000000  ,'Deposit'     ,'Success'),  -- acc1: 50M -> 55M
(2,1,2000000  ,'Withdraw'    ,'Success'),  -- acc1: 55M -> 53M
(3,2,2000000  ,'Transfer'    ,'Success'),  -- acc2: 30M -> 28M
(4,3,500000   ,'Deposit'     ,'Success'),  -- acc3: 70M -> 70.5M
(5,5,999999999,'Withdraw'    ,'Failed' ),  -- vượt số dư -> Failed, không trừ tiền
(6,1,5000000  ,'Loan_Payment','Success'),  -- acc1: 53M -> 48M
(7,2,3000000  ,'Loan_Payment','Success');  -- acc2: 28M -> 25M

-- ---------------- LOAN PAYMENTS (tham chiếu tx6, tx7) ----------------
-- trigger sẽ tự trừ remaining_amount: loan1 100M->95M, loan2 50M->47M
INSERT INTO loan_payments (payment_id, loan_id, account_id, transaction_id, amount, payment_date, remain_after_payment) VALUES
(1,1,1,6,5000000,'2025-03-01 00:00:00',95000000),
(2,2,2,7,3000000,'2025-03-15 00:00:00',47000000);

-- ---------------- PAYROLL (Unpaid -> HR sẽ duyệt & chi lương) ----------------
INSERT INTO payroll (payroll_id, employee_id, transaction_id, month_year, basic_salary, allowance, total_salary, status) VALUES
(1,1,NULL,'2025-05-01',12000000,2000000,12600000,'Unpaid'),
(2,2,NULL,'2025-05-01',10000000,1500000,10350000,'Unpaid'),
(3,3,NULL,'2025-05-01', 9000000,1000000, 9000000,'Unpaid');

-- ---------------- ATTENDANCE ----------------
INSERT INTO attendance (attendance_id, employee_id, work_date, check_in, check_out, status) VALUES
(1,1,'2025-06-01','2025-06-01 08:00:00','2025-06-01 17:00:00','Present'),
(2,2,'2025-06-01','2025-06-01 08:30:00','2025-06-01 17:30:00','Present'),
(3,3,'2025-06-01',NULL,NULL,'Unpresent');

-- ---------------- APP USERS (đăng nhập web) ----------------
-- Mật khẩu của cả 4 tài khoản mẫu đều là: 123456
-- Định dạng hash: scrypt$<salt_hex>$<hash_hex> (Node crypto.scrypt, không cần thư viện ngoài)
INSERT INTO app_users (user_id, username, password_hash, role_id, customer_id, employee_id, status) VALUES
(1,'admin'    ,'scrypt$73a55a2583d79e40f9dc99414ecf5d3a$7ed93ebc7643008acd4c739bacc529894d9da7ca4079f1cac7d0f6f3aeabf310ff4120736e439a49b565079d5837de346b534bd64110bf7b4f3669074b053736',1,NULL,3,'Active'),
(2,'hr'       ,'scrypt$b4d1a41ec55136f192c55b0fd79c1713$e13f04061b9a10edfe5afbd781f77014df077c5e59e9332b676f8e9134f4837218ea38289d8cfdfd9ad35af80e8c92c4961039150c030458dcd4a38315c7784c',3,NULL,2,'Active'),
(3,'teller'   ,'scrypt$acdf36babec3263cbccb37bfa3f844f1$5d43e72ad4cb9003aa2699c1552f93676bd53cb87f8500bc70a596e56384f42a6f4e35f87d12b1b8e3b0a219ae36d8956cbd0b67af3ef6952f1cd430490e1398',2,NULL,1,'Active'),
(4,'khachhang','scrypt$525672089b88b23f81198514df7c4c69$c42f918cd42eedd915ccffc119d76b5131d284aae3e325940416d9c094bad93c4afa33d0cf4dad6ede5ef4ee01cdaaa65461ca13c2156c5be516dd557b67161e',4,1,NULL,'Active');
