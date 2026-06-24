// app.js — SPA: login, JWT storage, role-based sidebar, dynamic views
'use strict';
const API = '/api';

// ---- state ----
const state = { token: null, user: null, modules: [] };

// ---- tiny helpers ----
const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, html = '') => {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  if (html) e.innerHTML = html;
  return e;
};
const fmtMoney = (n) =>
  (Number(n) || 0).toLocaleString('vi-VN') + ' ₫';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function toast(message, type = 'info') {
  const box = $('#toast-box');
  const t = el('div', { class: `toast ${type}` }, esc(message));
  box.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ---- API wrapper (attaches JWT, handles errors in Vietnamese) ----
async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(API + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401 && state.token) { logout(); throw new Error('Phiên đăng nhập đã hết hạn'); }
  if (!res.ok) throw new Error(data.error || 'Đã xảy ra lỗi');
  return data;
}

// ---- session persistence ----
function saveSession() {
  localStorage.setItem('bms_session', JSON.stringify(state));
}
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem('bms_session') || 'null');
    if (s && s.token) { Object.assign(state, s); return true; }
  } catch { /* ignore */ }
  return false;
}

// ---- auth ----
async function doLogin(username, password) {
  const data = await api('/auth/login', { method: 'POST', body: { username, password } });
  state.token = data.token; state.user = data.user; state.modules = data.modules || [];
  saveSession();
  enterApp();
  toast(`Xin chào ${data.user.username}!`, 'success');
}
function logout() {
  state.token = null; state.user = null; state.modules = [];
  localStorage.removeItem('bms_session');
  $('#app-screen').classList.add('hidden');
  $('#login-screen').classList.remove('hidden');
}

const ROLE_LABELS = { Admin: 'Quản trị viên', Teller: 'Giao dịch viên', HR: 'Nhân sự', Customer: 'Khách hàng' };

// ---- shell: build sidebar + show app ----
function enterApp() {
  $('#login-screen').classList.add('hidden');
  $('#app-screen').classList.remove('hidden');
  $('#user-name').textContent = state.user.username;
  $('#user-role').textContent = ROLE_LABELS[state.user.role] || state.user.role;

  const nav = $('#sidebar-nav');
  nav.innerHTML = '';
  state.modules.forEach((m, i) => {
    const b = el('button', {}, esc(m.label));
    b.onclick = () => { setActive(b); renderView(m.id, m.label); };
    nav.appendChild(b);
    if (i === 0) setTimeout(() => { setActive(b); renderView(m.id, m.label); }, 0);
  });
}
function setActive(btn) {
  document.querySelectorAll('#sidebar-nav button').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
}

// ---- table builder ----
function table(columns, rows, rowFn) {
  if (!rows || rows.length === 0) return '<div class="empty">Không có dữ liệu</div>';
  const head = columns.map((c) => `<th>${esc(c)}</th>`).join('');
  const body = rows.map(rowFn).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
function statusBadge(s) {
  const ok = ['Active', 'Success', 'Approved', 'Completed', 'Paid', 'Present'];
  const bad = ['Inactive', 'Failed', 'Rejected'];
  const cls = ok.includes(s) ? 'ok' : bad.includes(s) ? 'bad' : 'warn';
  return `<span class="badge ${cls}">${esc(s)}</span>`;
}

// ---- main view router ----
async function renderView(id, label) {
  $('#view-title').textContent = label;
  const c = $('#view-container');
  c.innerHTML = '<div class="empty">Đang tải...</div>';
  try {
    const fn = VIEWS[id] || VIEWS._notfound;
    await fn(c);
  } catch (e) {
    c.innerHTML = `<div class="panel"><p class="empty">${esc(e.message)}</p></div>`;
    toast(e.message, 'error');
  }
}

// ============ VIEW IMPLEMENTATIONS ============
const VIEWS = {
  _notfound: (c) => { c.innerHTML = '<div class="empty">Chức năng đang phát triển</div>'; },
};
const cardHTML = (label, value) =>
  `<div class="card"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`;

// ---- OVERVIEW (per role) ----
VIEWS.overview = async (c) => {
  const role = state.user.role;
  if (role === 'Customer') {
    const p = await api('/me/profile');
    const loans = await api('/me/loans');
    const debt = loans.filter((l) => l.loan_status === 'Approved')
      .reduce((s, l) => s + Number(l.remaining_amount), 0);
    c.innerHTML = `<div class="cards">
      ${cardHTML('Số dư khả dụng', fmtMoney(p.balance))}
      ${cardHTML('Số tài khoản', '#' + p.account_id)}
      ${cardHTML('Tổng dư nợ', fmtMoney(debt))}
      ${cardHTML('Trạng thái', p.status === 'Active' ? 'Hoạt động' : 'Khóa')}
    </div>`;
  } else if (role === 'Teller') {
    const cust = await api('/customers');
    const pend = await api('/loans/pending');
    c.innerHTML = `<div class="cards">
      ${cardHTML('Tổng khách hàng', cust.length)}
      ${cardHTML('Khoản vay chờ duyệt', pend.length)}
    </div>`;
  } else if (role === 'HR') {
    const emp = await api('/employees');
    const pay = await api('/payroll');
    const unpaid = pay.filter((p) => p.status === 'Unpaid').length;
    c.innerHTML = `<div class="cards">
      ${cardHTML('Tổng nhân viên', emp.length)}
      ${cardHTML('Đang hoạt động', emp.filter((e) => e.status === 'Active').length)}
      ${cardHTML('Bảng lương chưa chi', unpaid)}
    </div>`;
  } else {
    const emp = await api('/employees');
    const roles = await api('/roles');
    c.innerHTML = `<div class="cards">
      ${cardHTML('Tổng nhân viên', emp.length)}
      ${cardHTML('Số vai trò', roles.length)}
    </div>`;
  }
};

// ---- CUSTOMER: profile ----
VIEWS.profile = async (c) => {
  const p = await api('/me/profile');
  c.innerHTML = `<div class="panel"><h3>Thông tin cá nhân</h3>
    <div class="form-grid">
      ${ro('Họ và tên', p.full_name)}
      ${ro('CCCD', p.cccd)}
      ${ro('Ngày sinh', (p.dob || '').slice(0, 10))}
      ${ro('Giới tính', p.gender)}
      ${ro('Số điện thoại', p.phone)}
      ${ro('Email', p.email)}
      ${ro('Địa chỉ', p.address)}
      ${ro('Số tài khoản', '#' + p.account_id)}
      ${ro('Số dư', fmtMoney(p.balance))}
    </div></div>`;
};
const ro = (label, val) =>
  `<div class="field"><label>${esc(label)}</label>
   <input value="${esc(val ?? '')}" readonly /></div>`;

// ---- CUSTOMER: transaction history ----
VIEWS.transactions = async (c) => {
  const rows = await api('/me/transactions');
  c.innerHTML = `<div class="panel"><h3>Lịch sử giao dịch</h3>${
    table(['Mã GD', 'Loại', 'Số tiền', 'Trạng thái'], rows, (t) =>
      `<tr><td>#${t.transaction_id}</td><td>${esc(t.transaction_type)}</td>
       <td>${fmtMoney(t.amount)}</td><td>${statusBadge(t.status)}</td></tr>`)
  }</div>`;
};

// ---- CUSTOMER: money operations (CASE 2) ----
VIEWS.transfer = async (c) => {
  c.innerHTML = `
    <div class="panel"><h3>Nạp tiền</h3>
      <div class="form-grid">
        <div class="field"><label>Số tiền</label><input id="dep-amt" type="number" min="1" /></div>
      </div>
      <div class="form-actions"><button class="btn-sm" id="btn-deposit">Nạp tiền</button></div>
    </div>
    <div class="panel"><h3>Rút tiền</h3>
      <div class="form-grid">
        <div class="field"><label>Số tiền</label><input id="wd-amt" type="number" min="1" /></div>
      </div>
      <div class="form-actions"><button class="btn-sm" id="btn-withdraw">Rút tiền</button></div>
    </div>
    <div class="panel"><h3>Chuyển khoản</h3>
      <div class="form-grid">
        <div class="field"><label>Tài khoản nhận (ID)</label><input id="tf-to" type="number" /></div>
        <div class="field"><label>Số tiền</label><input id="tf-amt" type="number" min="1" /></div>
      </div>
      <div class="form-actions"><button class="btn-sm" id="btn-transfer">Chuyển khoản</button></div>
    </div>`;

  $('#btn-deposit').onclick = () => doMoney('/transactions/deposit',
    { amount: +$('#dep-amt').value }, 'Nạp tiền');
  $('#btn-withdraw').onclick = () => doMoney('/transactions/withdraw',
    { amount: +$('#wd-amt').value }, 'Rút tiền');
  $('#btn-transfer').onclick = () => doMoney('/transactions/transfer',
    { toAccount: +$('#tf-to').value, amount: +$('#tf-amt').value }, 'Chuyển khoản');
};
async function doMoney(path, body, label) {
  try {
    const r = await api(path, { method: 'POST', body });
    toast(r.message || `${label} thành công`, 'success');
    renderView('transfer', 'Giao dịch tiền');
  } catch (e) { toast(e.message, 'error'); }
}

// ---- CUSTOMER: loans (register, pay) CASE 3/4 ----
VIEWS.loans = async (c) => {
  const rows = await api('/me/loans');
  c.innerHTML = `
    <div class="panel"><h3>Đăng ký khoản vay</h3>
      <div class="form-grid">
        <div class="field"><label>Số tiền vay</label><input id="loan-amt" type="number" min="1" /></div>
        <div class="field"><label>Số tháng</label><input id="loan-months" type="number" value="12" /></div>
      </div>
      <div class="form-actions"><button class="btn-sm" id="btn-loan">Gửi yêu cầu vay</button></div>
    </div>
    <div class="panel"><h3>Khoản vay của tôi</h3>${
      table(['Mã', 'Số tiền vay', 'Còn lại', 'Trạng thái', 'Thao tác'], rows, (l) =>
        `<tr><td>#${l.loan_id}</td><td>${fmtMoney(l.loan_amount)}</td>
         <td>${fmtMoney(l.remaining_amount)}</td><td>${statusBadge(l.loan_status)}</td>
         <td>${l.loan_status === 'Approved'
            ? `<button class="btn-sm" onclick="payLoan(${l.loan_id})">Thanh toán</button>` : '—'}</td></tr>`)
    }</div>`;

  $('#btn-loan').onclick = async () => {
    try {
      const r = await api('/loans', { method: 'POST',
        body: { amount: +$('#loan-amt').value, months: +$('#loan-months').value } });
      toast(r.message, 'success'); renderView('loans', 'Khoản vay');
    } catch (e) { toast(e.message, 'error'); }
  };
};
window.payLoan = async (id) => {
  const amt = prompt('Nhập số tiền muốn thanh toán:');
  if (!amt) return;
  try {
    const r = await api(`/loans/${id}/pay`, { method: 'POST', body: { amount: +amt } });
    toast(`${r.message}. Dư nợ còn lại: ${fmtMoney(r.remaining)}`, 'success');
    renderView('loans', 'Khoản vay');
  } catch (e) { toast(e.message, 'error'); }
};

// ---- TELLER: open account (CASE 1) ----
VIEWS['open-account'] = async (c) => {
  c.innerHTML = `<div class="panel"><h3>Mở tài khoản cho khách hàng</h3>
    <div class="form-grid">
      <div class="field"><label>CCCD (12 số)</label><input id="oa-cccd" maxlength="12" /></div>
      <div class="field"><label>Họ và tên</label><input id="oa-name" /></div>
      <div class="field"><label>Ngày sinh</label><input id="oa-dob" type="date" /></div>
      <div class="field"><label>Giới tính</label>
        <select id="oa-gender"><option value="Male">Nam</option>
        <option value="Female">Nữ</option><option value="Other">Khác</option></select></div>
      <div class="field"><label>Số điện thoại</label><input id="oa-phone" /></div>
      <div class="field"><label>Email</label><input id="oa-email" /></div>
      <div class="field"><label>Địa chỉ</label><input id="oa-address" /></div>
      <div class="field"><label>Số dư ban đầu</label><input id="oa-balance" type="number" value="0" /></div>
    </div>
    <div class="form-actions"><button class="btn-sm" id="btn-open">Mở tài khoản</button></div>
  </div>`;
  $('#btn-open').onclick = async () => {
    try {
      const r = await api('/accounts', { method: 'POST', body: {
        cccd: $('#oa-cccd').value.trim(), fullName: $('#oa-name').value.trim(),
        dob: $('#oa-dob').value, gender: $('#oa-gender').value,
        phone: $('#oa-phone').value.trim(), email: $('#oa-email').value.trim(),
        address: $('#oa-address').value.trim(), initBalance: +$('#oa-balance').value } });
      toast(`${r.message} (KH #${r.customerId}, TK #${r.accountId})`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  };
};

// ---- TELLER/ADMIN: customers list ----
VIEWS.customers = async (c) => {
  const rows = await api('/customers');
  c.innerHTML = `<div class="panel"><h3>Danh sách khách hàng</h3>${
    table(['KH', 'CCCD', 'Họ tên', 'SĐT', 'TK', 'Số dư', 'Trạng thái'], rows, (r) =>
      `<tr><td>#${r.customer_id}</td><td>${esc(r.cccd)}</td><td>${esc(r.full_name)}</td>
       <td>${esc(r.phone || '')}</td><td>${r.account_id ? '#' + r.account_id : '—'}</td>
       <td>${r.balance != null ? fmtMoney(r.balance) : '—'}</td>
       <td>${r.status ? statusBadge(r.status) : '—'}</td></tr>`)
  }</div>`;
};

// ---- TELLER: system transactions ----
VIEWS['verify-tx'] = async (c) => {
  const rows = await api('/transactions/recent');
  c.innerHTML = `<div class="panel"><h3>Giao dịch gần đây (toàn hệ thống)</h3>${
    table(['Mã GD', 'Khách hàng', 'TK', 'Loại', 'Số tiền', 'Trạng thái'], rows, (t) =>
      `<tr><td>#${t.transaction_id}</td><td>${esc(t.full_name)}</td><td>#${t.account_id}</td>
       <td>${esc(t.transaction_type)}</td><td>${fmtMoney(t.amount)}</td>
       <td>${statusBadge(t.status)}</td></tr>`)
  }</div>`;
};

// ---- TELLER/ADMIN: approve loans (CASE 3) ----
VIEWS['approve-loan'] = async (c) => {
  const rows = await api('/loans/pending');
  c.innerHTML = `<div class="panel"><h3>Khoản vay chờ duyệt</h3>${
    table(['Mã', 'Khách hàng', 'TK', 'Số tiền', 'Thao tác'], rows, (l) =>
      `<tr><td>#${l.loan_id}</td><td>${esc(l.full_name)}</td><td>#${l.account_id}</td>
       <td>${fmtMoney(l.loan_amount)}</td>
       <td><button class="btn-sm" onclick="approveLoan(${l.loan_id})">Duyệt</button>
       <button class="btn-sm btn-danger" onclick="rejectLoan(${l.loan_id})">Từ chối</button></td></tr>`)
  }</div>`;
};
window.approveLoan = async (id) => {
  try { const r = await api(`/loans/${id}/approve`, { method: 'POST' });
    toast(r.message, 'success'); renderView('approve-loan', 'Duyệt khoản vay');
  } catch (e) { toast(e.message, 'error'); }
};
window.rejectLoan = async (id) => {
  try { const r = await api(`/loans/${id}/reject`, { method: 'POST' });
    toast(r.message, 'info'); renderView('approve-loan', 'Duyệt khoản vay');
  } catch (e) { toast(e.message, 'error'); }
};

// ---- HR/ADMIN: employees ----
VIEWS.employees = async (c) => {
  const rows = await api('/employees');
  const isHR = state.user.role === 'HR';
  const form = isHR ? `<div class="panel"><h3>Thêm nhân viên</h3>
    <div class="form-grid">
      <div class="field"><label>Họ tên</label><input id="emp-name" /></div>
      <div class="field"><label>Ngày sinh</label><input id="emp-dob" type="date" /></div>
      <div class="field"><label>SĐT</label><input id="emp-phone" /></div>
      <div class="field"><label>Lương cơ bản (hệ số)</label><input id="emp-salary" type="number" /></div>
      <div class="field"><label>Phụ cấp</label><input id="emp-allow" type="number" value="0" /></div>
    </div>
    <div class="form-actions"><button class="btn-sm" id="btn-emp">Thêm nhân viên</button></div></div>` : '';
  c.innerHTML = form + `<div class="panel"><h3>Danh sách nhân viên</h3>${
    table(['NV', 'Họ tên', 'SĐT', 'Hệ số lương', 'Phụ cấp', 'Vai trò', 'Trạng thái', isHR ? 'Thao tác' : ''], rows, (e) =>
      `<tr><td>#${e.employee_id}</td><td>${esc(e.full_name)}</td><td>${esc(e.phone || '')}</td>
       <td>${fmtMoney(e.salary_level)}</td><td>${fmtMoney(e.allowance)}</td>
       <td>${esc(e.role_name || '—')}</td><td>${statusBadge(e.status)}</td>
       ${isHR ? `<td>${e.status === 'Active'
          ? `<button class="btn-sm btn-warn" onclick="deactivateEmp(${e.employee_id})">Cho nghỉ</button>` : '—'}</td>` : '<td></td>'}</tr>`)
  }</div>`;
  if (isHR) $('#btn-emp').onclick = async () => {
    try {
      const r = await api('/employees', { method: 'POST', body: {
        fullName: $('#emp-name').value.trim(), dob: $('#emp-dob').value,
        phone: $('#emp-phone').value.trim(), salaryLevel: +$('#emp-salary').value,
        allowance: +$('#emp-allow').value } });
      toast(r.message, 'success'); renderView('employees', 'Nhân viên');
    } catch (e) { toast(e.message, 'error'); }
  };
};
window.deactivateEmp = async (id) => {
  try { const r = await api(`/employees/${id}`, { method: 'PUT', body: { status: 'Inactive' } });
    toast(r.message, 'info'); renderView('employees', 'Nhân viên');
  } catch (e) { toast(e.message, 'error'); }
};

// ---- HR: payroll (CASE 5) ----
VIEWS.payroll = async (c) => {
  const rows = await api('/payroll');
  c.innerHTML = `<div class="panel"><h3>Bảng lương</h3>${
    table(['Mã', 'Nhân viên', 'Tháng', 'Cơ bản', 'Phụ cấp', 'Tổng', 'Trạng thái', 'Thao tác'], rows, (p) =>
      `<tr><td>#${p.payroll_id}</td><td>${esc(p.full_name)}</td>
       <td>${(p.month_year || '').slice(0, 7)}</td><td>${fmtMoney(p.basic_salary)}</td>
       <td>${fmtMoney(p.allowance)}</td><td>${fmtMoney(p.total_salary)}</td>
       <td>${statusBadge(p.status)}</td>
       <td>${p.status === 'Unpaid'
          ? `<button class="btn-sm" onclick="payPayroll(${p.payroll_id})">Duyệt & chi lương</button>` : '—'}</td></tr>`)
  }</div>`;
};
window.payPayroll = async (id) => {
  try { const r = await api(`/payroll/${id}/pay`, { method: 'POST' });
    toast(r.message, 'success'); renderView('payroll', 'Bảng lương');
  } catch (e) { toast(e.message, 'error'); }
};

// ---- ADMIN: assign roles ----
VIEWS.assign = async (c) => {
  const emps = await api('/employees');
  const roles = await api('/roles');
  const opts = roles.map((r) => `<option value="${r.role_id}">${esc(r.role_name)}</option>`).join('');
  c.innerHTML = `<div class="panel"><h3>Phân vai trò cho nhân viên</h3>${
    table(['NV', 'Họ tên', 'Vai trò hiện tại', 'Phân vai trò mới'], emps, (e) =>
      `<tr><td>#${e.employee_id}</td><td>${esc(e.full_name)}</td><td>${esc(e.role_name || '—')}</td>
       <td><select id="role-${e.employee_id}">${opts}</select>
       <button class="btn-sm" onclick="assignRole(${e.employee_id})">Lưu</button></td></tr>`)
  }</div>`;
};
window.assignRole = async (id) => {
  const roleId = +$(`#role-${id}`).value;
  try { const r = await api(`/employees/${id}/role`, { method: 'PUT', body: { roleId } });
    toast(r.message, 'success'); renderView('assign', 'Phân vai trò');
  } catch (e) { toast(e.message, 'error'); }
};

// ---- ADMIN: roles ----
VIEWS.roles = async (c) => {
  const rows = await api('/roles');
  c.innerHTML = `<div class="panel"><h3>Danh sách vai trò</h3>${
    table(['Mã', 'Tên vai trò'], rows, (r) =>
      `<tr><td>#${r.role_id}</td><td>${esc(r.role_name)}</td></tr>`)
  }</div>`;
};

// ============ BOOTSTRAP ============
$('#login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    await doLogin($('#login-username').value.trim(), $('#login-password').value);
  } catch (e) { toast(e.message, 'error'); }
});
$('#logout-btn').addEventListener('click', logout);

// auto-restore session
if (loadSession()) {
  api('/auth/me')
    .then((d) => { state.modules = d.modules; enterApp(); })
    .catch(() => logout());
}
