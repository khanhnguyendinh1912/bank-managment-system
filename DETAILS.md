# 📘 DETAILS — Tài liệu hệ thống

## 1. Kiến trúc tổng quan

```
Browser (SPA tiếng Việt)
   │  fetch + JWT (Bearer)
   ▼
Express API (/api/*)  ── auth.js (JWT + RBAC) ── routes.js (validate)
   │  pg pool / withTransaction (ACID)
   ▼
PostgreSQL  ── triggers (ràng buộc) + stored functions (nghiệp vụ)
```

- **server.js**: khởi tạo Express, CORS, JSON parser, log request, gắn router `/api`, phục vụ tĩnh `frontend/`, health check `/api/health`.
- **auth.js**: băm/kiểm mật khẩu (`crypto.scrypt`), `login()` cấp JWT 8h, middleware `authRequired` + `requireRole(...)`.
- **db.js**: pool `pg`, helper `query()` và `withTransaction()` (BEGIN/COMMIT/ROLLBACK).
- **queries.js**: SQL tham số hoá + mô tả tiếng Việt + bản đồ module sidebar theo vai trò.
- **routes.js**: REST endpoints, validate tham số, gọi stored functions.

## 2. Cơ sở dữ liệu

### Bảng (theo ERD)
`customers, accounts (1:1 với customers), roles, employees, loans, transactions, loan_payments, payroll, attendance` — và bảng bổ sung **`app_users`** để lưu thông tin đăng nhập (username, password_hash, role, liên kết customer/employee).

### Triggers (02)
1. Chặn khách hàng < 18 tuổi (BEFORE INSERT customers).
2. Đánh dấu `Failed` nếu tài khoản không `Active` (BEFORE INSERT transactions).
3. Đánh dấu `Failed` nếu số dư không đủ với `Withdraw/Transfer`.
4. Tự cập nhật số dư sau giao dịch `Success` (Deposit/Salary/Loan_Disbursement cộng; Withdraw/Transfer/Loan_Payment trừ).
5. Cập nhật dư nợ sau mỗi loan_payment; về 0 → `loan_status = Completed`.
6. Chặn tạo payroll cho nhân viên `Inactive`.

### Stored functions (04)
- Helper: `get_customer_balance`, `get_total_debt`, `calculate_employee_salary`.
- Nghiệp vụ: `open_account`, `make_transaction`, `transfer_money`, `approve_loan`, `pay_loan`, `run_payroll`.

### Truy vấn báo cáo (05): Q1–Q10
Khách hàng+TK, thống kê giao dịch, GD thất bại, khoản vay Approved, NV theo vai trò, tổng GD theo TK (đã sửa JOIN), KH còn dư nợ, tiến độ trả nợ, top 10 TK nhiều GD, khoản vay chưa thanh toán.

## 3. Use Cases & Endpoints

| Case | Mô tả | Endpoint | Vai trò |
|------|-------|----------|---------|
| 1 | Mở tài khoản (CCCD duy nhất, ≥18, tự sinh số TK, 1:1) | `POST /api/accounts` | Teller, Admin |
| 2 | Nạp tiền | `POST /api/transactions/deposit` | Customer, Teller |
| 2 | Rút tiền (kiểm tra số dư) | `POST /api/transactions/withdraw` | Customer, Teller |
| 2 | Chuyển khoản (ACID) | `POST /api/transactions/transfer` | Customer, Teller |
| 3 | KH đăng ký vay (Pending) | `POST /api/loans` | Customer |
| 3 | NV duyệt vay → giải ngân | `POST /api/loans/:id/approve` | Teller, Admin |
| 4 | Thanh toán khoản vay | `POST /api/loans/:id/pay` | Customer |
| 5 | HR duyệt & chi lương từ quỹ trung tâm | `POST /api/payroll/:id/pay` | HR |
| 5 | Onboard/cập nhật/cho nghỉ NV | `POST/PUT /api/employees` | HR |
| - | Phân vai trò | `PUT /api/employees/:id/role` | Admin |

### Xác thực
- `POST /api/auth/login` → `{ token, user, modules }`.
- `GET /api/auth/me` → thông tin user + module sidebar (khôi phục phiên).

## 4. Bảo mật

- Mật khẩu băm `scrypt` + salt ngẫu nhiên, so sánh `timingSafeEqual`.
- JWT ký HS256, hết hạn 8h; mọi route nghiệp vụ qua `authRequired` + `requireRole`.
- SQL tham số hoá toàn bộ → chống SQL injection.
- ⚠️ Demo dùng HTTP cục bộ. Khi triển khai thật: bật HTTPS, đổi `JWT_SECRET`, dùng mật khẩu mạnh, giới hạn CORS.

## 5. Quy ước & luồng dữ liệu tiền tệ

- **Quỹ trung tâm** = `account_id 99` (customer 99), là nguồn chi lương/giải ngân.
- Chuyển khoản = 1 giao dịch `Transfer` (trừ người gửi) + 1 `Deposit` (cộng người nhận) trong cùng transaction; nếu bước trừ `Failed` → `RAISE` → rollback toàn bộ.
- Lương = `basic_salary + allowance - tax` (dữ liệu mẫu `total_salary` đã tính sẵn); khi HR duyệt, `run_payroll` trừ quỹ trung tâm và cộng cho nhân viên, đặt payroll `Paid`.
