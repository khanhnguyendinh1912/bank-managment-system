# 🏦 Bank Management System

Hệ thống Quản lý Ngân hàng full-stack: **Vanilla HTML/CSS/JS** (giao diện tiếng Việt) + **Node.js/Express** + **PostgreSQL**, xác thực **JWT** và phân quyền **RBAC** 4 vai trò.

## ✨ Tính năng chính

- Đăng nhập bằng tài khoản trong DB, cấp JWT hiệu lực **8 giờ**. Mọi API nghiệp vụ yêu cầu token hợp lệ.
- **RBAC** theo 4 vai trò lưu trong DB: `Admin`, `Teller` (Giao dịch viên), `HR` (Nhân sự), `Customer` (Khách hàng).
- 5 nghiệp vụ lõi: Mở tài khoản, Giao dịch tiền (Nạp/Rút/Chuyển), Vay tiền, Thanh toán khoản vay, Quản lý nhân viên & Lương.
- Logic nghiệp vụ đặt trong **stored functions** + **triggers** của PostgreSQL → đảm bảo **ACID** và toàn vẹn dữ liệu.

## 📁 Cấu trúc thư mục

```
Bank-Management-System/
├── README.md / DETAILS.md / LICENSE / .gitignore
├── frontend/          # index.html, styles.css, app.js (SPA thuần)
├── backend/
│   ├── src/           # server.js, auth.js, db.js, queries.js, routes.js
│   ├── package.json   # express, pg, jsonwebtoken, dotenv, cors
│   └── .env(.example)
└── database/          # 01_tables → 02_triggers → 03_data → 04_functions → 05_queries
```

## 🚀 Cài đặt & chạy

### 1. Tạo cơ sở dữ liệu
```bash
createdb bank_db          # hoặc CREATE DATABASE bank_db trong psql
cd database
psql -d bank_db -f 01_create_tables.sql
psql -d bank_db -f 02_create_triggers.sql
psql -d bank_db -f 03_insert_sample_data.sql
psql -d bank_db -f 04_create_functions.sql
# 05_ndnk_queries.sql là các truy vấn báo cáo, chạy khi cần xem Q1..Q10
```

### 2. Cấu hình backend
```bash
cd backend
cp .env.example .env      # sửa PGPASSWORD, JWT_SECRET cho đúng môi trường
npm install
npm start                 # http://localhost:3000
```

Mở trình duyệt tại **http://localhost:3000** — Express phục vụ luôn thư mục `frontend/`.

## 🔑 Tài khoản mẫu (mật khẩu đều là `123456`)

| Tên đăng nhập | Vai trò    | Quyền chính |
|---------------|------------|-------------|
| `admin`       | Admin      | Phân vai trò/chi nhánh cho nhân viên |
| `hr`          | HR         | Onboard/cập nhật nhân viên, duyệt & chi lương |
| `teller`      | Teller     | Mở tài khoản, duyệt vay, xem giao dịch |
| `khachhang`   | Customer   | Xem số dư, giao dịch tiền, vay & trả nợ |

> Mật khẩu được băm bằng `crypto.scrypt` (định dạng `scrypt$salt$hash`), không cần thư viện native.

## 🧩 Quy ước code (coding conventions)

- **Backend**: CommonJS, `'use strict'`, async/await, mọi truy vấn dùng tham số hoá (`$1, $2`) chống SQL injection.
- **Logic nghiệp vụ** nằm trong stored functions; route chỉ validate input + gọi hàm trong một transaction (`withTransaction`).
- **Frontend**: SPA không framework; mỗi màn hình là một hàm trong `VIEWS`; mọi chuỗi hiển thị bằng **tiếng Việt**.
- **Comment/biến**: tiếng Anh; **văn bản UI**: tiếng Việt.

Xem [DETAILS.md](DETAILS.md) để biết chi tiết kiến trúc, API và các use case.
