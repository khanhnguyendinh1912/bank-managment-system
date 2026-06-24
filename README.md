# Bank Management System

Hệ thống quản lý ngân hàng. Bao gồm:

- `frontend/` — HTML/CSS/JavaScript thuần (không framework, không bước build), giao diện vận hành tiếng Việt
- `backend/` — Express API, xác thực JWT, kết nối PostgreSQL
- `database/` — script tạo bảng, trigger, dữ liệu mẫu, hàm (stored function) và truy vấn nghiệp vụ

## Tính năng chính

- Đăng nhập bằng tài khoản trong bảng `app_users`, cấp **JWT** có hiệu lực 8 giờ. Mọi API nghiệp vụ đều yêu cầu token hợp lệ.
- Phân quyền theo bốn vai trò lưu trong CSDL: `Admin` (Quản trị), `Teller` (Giao dịch viên), `HR` (Nhân sự), `Customer` (Khách hàng). Vai trò được nhúng trong JWT và kiểm tra ở từng endpoint.
- Chỉ cho đăng nhập tài khoản có `status = 'Active'`: tài khoản bị khóa/ngừng hoạt động sẽ bị từ chối.
- Trang **Tổng quan** với các thẻ số liệu thay đổi theo vai trò: khách hàng thấy số dư, số tài khoản, tổng dư nợ, trạng thái; giao dịch viên thấy tổng khách hàng và khoản vay chờ duyệt; nhân sự thấy tổng nhân viên, số đang hoạt động, bảng lương chưa chi; quản trị thấy tổng nhân viên và số vai trò.
- Thanh điều hướng chia theo **phân hệ** nghiệp vụ theo vai trò: Khách hàng (Thông tin cá nhân, Lịch sử giao dịch, Giao dịch tiền, Khoản vay); Giao dịch viên (Mở tài khoản, Khách hàng, Giao dịch hệ thống, Duyệt khoản vay); Nhân sự (Nhân viên, Bảng lương); Quản trị (Nhân viên, Phân vai trò, Vai trò, Báo cáo Q1–Q10).
- Nghiệp vụ tra cứu (chỉ đọc): thông tin cá nhân & số dư, lịch sử giao dịch, danh sách khoản vay, danh sách khách hàng, giao dịch gần đây toàn hệ thống, khoản vay chờ duyệt, danh sách nhân viên, bảng lương, danh sách vai trò, và 10 báo cáo nghiệp vụ Q1–Q10 cho quản trị.
- Nghiệp vụ ghi (gọi hàm trong CSDL): mở tài khoản, nạp/rút/chuyển tiền, đăng ký vay, duyệt & giải ngân khoản vay, thanh toán khoản vay, thêm/cập nhật nhân viên, duyệt & chi lương, phân vai trò.
- Quy tắc nghiệp vụ được kiểm soát ngay tại tầng CSDL bằng trigger:
  - Chặn đăng ký khách hàng dưới 18 tuổi.
  - Đánh dấu giao dịch *Failed* nếu tài khoản không ở trạng thái *Active*.
  - Đánh dấu giao dịch *Failed* nếu số dư không đủ khi Rút tiền / Chuyển khoản.
  - Tự cập nhật số dư tài khoản sau giao dịch thành công (cộng với Deposit/Salary/Loan_Disbursement, trừ với Withdraw/Transfer/Loan_Payment).
  - Cập nhật dư nợ sau mỗi lần thanh toán khoản vay; tự chuyển khoản vay sang *Completed* khi dư nợ về 0.
  - Chặn lập bảng lương cho nhân viên đang *Inactive*.
- Hiển thị thân thiện: nhãn cột tiếng Việt, định dạng tiền tệ `vi-VN`, chip màu cho trạng thái, thông báo dạng toast khi thao tác thành công / lỗi.

## Cấu trúc thư mục

```
Bank-Management-System/
├── README.md                     File này
├── DETAILS.md                    Tài liệu chi tiết
├── LICENSE                       Giấy phép MIT
├── .gitignore
│
├── frontend/                     Giao diện người dùng (HTML/CSS/JS thuần)
│   ├── index.html                Khung trang: màn hình đăng nhập + bảng điều khiển
│   ├── styles.css                Giao diện: theme xanh ngân hàng, sidebar tối, thẻ số liệu, toast
│   └── app.js                    Logic SPA: đăng nhập, tổng quan, sidebar phân hệ, bảng kết quả động
│
├── backend/                      API
│   ├── src/
│   │   ├── server.js             Khởi tạo Express, gắn xác thực, phục vụ frontend tĩnh
│   │   ├── auth.js               Xử lý đăng nhập JWT + middleware kiểm tra token & vai trò
│   │   ├── db.js                 Connection pool PostgreSQL + helper transaction (ACID)
│   │   ├── queries.js            SQL tham số hóa + mô tả tiếng Việt + danh sách phân hệ + báo cáo Q1–Q10
│   │   └── routes.js             Các endpoint REST + kiểm tra tham số
│   ├── package.json
│   ├── .env.example
│   └── .env                      Cấu hình kết nối thực tế (không commit)
│
├── database/                     Script SQL (PostgreSQL)
│   ├── 01_create_tables.sql       Tạo 10 bảng + ràng buộc khóa chính/ngoại
│   ├── 02_create_triggers.sql     6 trigger thực thi quy tắc nghiệp vụ
│   ├── 03_insert_sample_data.sql  Dữ liệu mẫu (nạp khi trigger đang hoạt động)
│   ├── 04_create_functions.sql    Hàm helper + hàm nghiệp vụ (stored function)
│   └── 05_ndnk_queries.sql        10 truy vấn nghiệp vụ (Q1–Q10)
│
└── ERD                            Sơ đồ thực thể - quan hệ (drawio)
```

## Yêu cầu môi trường

- Node.js phiên bản 18 trở lên
- PostgreSQL phiên bản 14 trở lên (khuyến nghị 16)
- `psql` (đi kèm PostgreSQL) để chạy script
- Trình duyệt hiện đại (Chrome, Edge, Firefox) để mở giao diện

> Lưu ý: script chứa tiếng Việt và đã có dòng `SET client_encoding = 'UTF8';` ở đầu mỗi file để tránh lỗi encoding `WIN1252` của psql trên Windows. Hãy tạo database với encoding `UTF8` (mặc định trên bản cài đặt hiện đại).

## Cài đặt và chạy

### 1. Tạo database

```bash
createdb -U postgres bank_db
# hoặc trong psql:  CREATE DATABASE bank_db ENCODING 'UTF8';
```

### 2. Nạp lược đồ và dữ liệu — **đúng thứ tự**

Các script được đánh số và **bắt buộc** chạy theo thứ tự 01 → 02 → 03 → 04. Trigger (02) đang hoạt động khi nạp dữ liệu mẫu (03), nên thứ tự rất quan trọng (ví dụ giao dịch thành công sẽ tự điều chỉnh số dư, thanh toán khoản vay tự giảm dư nợ).

```bash
cd database
psql -U postgres -d bank_db -f 01_create_tables.sql
psql -U postgres -d bank_db -f 02_create_triggers.sql
psql -U postgres -d bank_db -f 03_insert_sample_data.sql
psql -U postgres -d bank_db -f 04_create_functions.sql
cd ..
```

`05_ndnk_queries.sql` là danh mục truy vấn tham khảo Q1–Q10 — không cần chạy để nạp database; backend phát hành phiên bản tham số hóa của các truy vấn này lúc chạy (mục **Báo cáo** trong dashboard quản trị).

### 3. Cấu hình kết nối

Sao chép `backend/.env.example` thành `backend/.env`, chỉnh thông tin cho phù hợp:

```env
# PostgreSQL
PGHOST=localhost
PGPORT=5432
PGDATABASE=bank_db
PGUSER=postgres
PGPASSWORD=mat_khau_cua_ban

# JWT
JWT_SECRET=chuoi-bi-mat-dai-ngau-nhien
JWT_EXPIRES_IN=8h

# Server
PORT=3000
```

### 4. Cài package và chạy backend

```bash
cd backend
npm install
npm start
```

Backend lắng nghe ở `http://localhost:3000` và phục vụ luôn giao diện frontend từ cùng origin (không cần proxy hay server riêng).

### 5. Mở ứng dụng

Truy cập **http://localhost:3000**. Đăng nhập bằng một tài khoản mẫu (ví dụ `admin` / `123456`), sau đó bảng điều khiển chia theo phân hệ tương ứng vai trò sẽ hiển thị.

### 6. Kiểm tra nhanh

```bash
curl http://localhost:3000/api/health
```

Trả về `{"status":"ok","db":"connected"}` khi kết nối CSDL thành công.

## Tài khoản mẫu

Tất cả tài khoản mẫu dùng chung mật khẩu **`123456`**.

| Vai trò             | Tên đăng nhập | Mật khẩu  | Quyền chính |
|---------------------|---------------|-----------|-------------|
| Quản trị (Admin)    | `admin`       | `123456`  | Phân vai trò cho nhân viên, xem báo cáo Q1–Q10 |
| Nhân sự (HR)        | `hr`          | `123456`  | Onboard/cập nhật nhân viên, duyệt & chi lương |
| Giao dịch viên      | `teller`      | `123456`  | Mở tài khoản, duyệt vay, xem giao dịch hệ thống |
| Khách hàng          | `khachhang`   | `123456`  | Xem số dư, giao dịch tiền, vay & trả nợ |

> **Lưu ý về mật khẩu.** Mật khẩu được băm bằng `crypto.scrypt` (định dạng `scrypt$<salt>$<hash>`) — đây là **mã băm thật**, được xác thực bằng `crypto.timingSafeEqual` trong `auth.js`, không dùng mật khẩu demo dùng chung. Mỗi tài khoản mẫu được seed sẵn hash trong `03_insert_sample_data.sql`. Đăng nhập được bằng bất kỳ `username` nào trong bảng `app_users` có `status = 'Active'`.
>
> Trước khi triển khai thật, hãy đặt `JWT_SECRET` đủ mạnh và đổi mật khẩu mặc định. Để tạo tài khoản mới, sinh hash bằng hàm `hashPassword()` trong `auth.js` rồi chèn vào bảng `app_users`.

## Quy ước mã (ID)

Khóa chính của các bảng là **số nguyên** (`INT`), do hàm nghiệp vụ sinh tự động theo công thức `MAX(id) + 1` khi tạo bản ghi mới (mở tài khoản, đăng ký vay, thêm nhân viên...). Không dùng tiền tố chữ.

| Bảng            | Khóa chính        | Ghi chú |
|-----------------|-------------------|---------|
| `customers`     | `customer_id`     | Khách hàng; ràng buộc `CCCD` duy nhất, ≥ 18 tuổi |
| `accounts`      | `account_id`      | 1 khách hàng ↔ 1 tài khoản (`customer_id` UNIQUE) |
| `roles`         | `role_id`         | 4 vai trò: Admin, Teller, HR, Customer |
| `employees`     | `employee_id`     | Liên kết `account_id` (nhận lương) và `role_id` |
| `loans`         | `loan_id`         | Trạng thái: Pending / Approved / Rejected / Completed |
| `transactions`  | `transaction_id`  | Loại: Deposit, Withdraw, Transfer, Salary, Loan_Disbursement, Loan_Payment |
| `loan_payments` | `payment_id`      | Mỗi lần thanh toán khoản vay |
| `payroll`       | `payroll_id`      | Trạng thái: Paid / Unpaid |
| `attendance`    | `attendance_id`   | Chấm công: Present / Unpresent |
| `app_users`     | `user_id`         | Tài khoản đăng nhập web; liên kết `customer_id` hoặc `employee_id` |

> Tài khoản số 99 (`NGAN HANG TRUNG TAM`) đóng vai trò quỹ trung tâm, là nguồn chi lương và giải ngân khoản vay.
>
> Xem [DETAILS.md](DETAILS.md) để biết chi tiết kiến trúc, danh sách endpoint API và các use case nghiệp vụ.


