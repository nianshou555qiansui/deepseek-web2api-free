/* ── State ─────────────────────────────────────────────────── */
const STATE = {
  token: localStorage.getItem("ds_token") || null,
  view: "dashboard",
  editingAccountId: null,
  editingAccountEmail: "",
};

function setToken(t) { STATE.token = t; if (t) localStorage.setItem("ds_token", t); else localStorage.removeItem("ds_token"); }
function authHeader() { return STATE.token ? { "Authorization": `Bearer ${STATE.token}` } : {}; }

/* ── API helpers ──────────────────────────────────────────── */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...authHeader(), ...opts.headers },
    ...opts,
  });
  if (res.status === 401) { setToken(null); render(); throw new Error("Unauthorized"); }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ── Toast ────────────────────────────────────────────────── */
function toast(msg, type = "ok") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* ── Router ───────────────────────────────────────────────── */
function navigate(view) {
  STATE.view = view;
  window.location.hash = view;
  render();
}

window.addEventListener("hashchange", () => {
  const view = window.location.hash.slice(1) || "dashboard";
  STATE.view = view;
  render();
});

/* ── SVG icons (inline, minimal set) ──────────────────────── */
const ICON = {
  dashboard: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  users: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  login: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>',
  activity: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  logOut: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  reload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
};

/* ── Render ───────────────────────────────────────────────── */
function render() {
  const app = document.getElementById("app");
  if (!STATE.token) { app.innerHTML = renderLogin(); attachLogin(); return; }
  app.innerHTML = renderLayout();

  const main = document.getElementById("page-content");
  switch (STATE.view) {
    case "dashboard": renderDashboard(main); break;
    case "accounts": renderAccounts(main); break;
    default: renderDashboard(main);
  }

  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.view === STATE.view);
  });
}

function renderLayout() {
  return `<aside class="sidebar">
    <div class="sidebar-header">
      <h1>DS Proxy</h1>
      <div class="sub">管理面板</div>
    </div>
    <nav class="sidebar-nav">
      <button class="nav-item${STATE.view === 'dashboard' ? ' active' : ''}" data-view="dashboard" onclick="navigate('dashboard')">
        ${ICON.dashboard} 概览
      </button>
      <button class="nav-item${STATE.view === 'accounts' ? ' active' : ''}" data-view="accounts" onclick="navigate('accounts')">
        ${ICON.users} 账号池
      </button>
    </nav>
    <div class="sidebar-footer">
      <button class="btn-logout" onclick="logout()">${ICON.logOut} 退出登录</button>
    </div>
  </aside>
  <main class="main" id="page-content"></main>`;
}

function logout() { setToken(null); render(); }

/* ── Login ────────────────────────────────────────────────── */
function renderLogin() {
  return `<div class="login-page">
    <div class="login-card">
      <h2>DS Proxy</h2>
      <div class="desc">输入管理密码登录</div>
      <div id="login-error"></div>
      <label for="pwd">密码</label>
      <input type="password" id="pwd" placeholder="管理密码" autofocus>
      <button class="btn btn-primary" id="login-btn">${ICON.login} 登录</button>
    </div>
  </div>`;
}

function attachLogin() {
  const btn = document.getElementById("login-btn");
  const input = document.getElementById("pwd");
  const errDiv = document.getElementById("login-error");

  async function doLogin() {
    const pwd = input.value.trim();
    if (!pwd) return;
    btn.disabled = true;
    btn.textContent = "登录中…";
    try {
      const res = await api("/admin/api/login", {
        method: "POST", body: JSON.stringify({ password: pwd }),
      });
      setToken(res.token);
      render();
    } catch (e) {
      errDiv.innerHTML = `<div class="login-error">${esc(e.message)}</div>`;
      btn.disabled = false;
      btn.innerHTML = `${ICON.login} 登录`;
    }
  }

  btn.onclick = doLogin;
  input.onkeydown = (e) => { if (e.key === "Enter") doLogin(); };
}

/* ── Dashboard ────────────────────────────────────────────── */
async function renderDashboard(el) {
  el.innerHTML = `<h1 class="page-title">${ICON.activity} 概览</h1>
    <div class="stats-grid" id="stats-grid">
      <div class="stat-card"><div class="label">总请求</div><div class="value accent" id="stat-total">-</div></div>
      <div class="stat-card"><div class="label">成功</div><div class="value green" id="stat-success">-</div></div>
      <div class="stat-card"><div class="label">失败</div><div class="value red" id="stat-fail">-</div></div>
      <div class="stat-card"><div class="label">成功率</div><div class="value accent" id="stat-rate">-</div></div>
      <div class="stat-card"><div class="label">平均延迟</div><div class="value" id="stat-lat">-</div></div>
      <div class="stat-card"><div class="label">运行时长</div><div class="value" id="stat-uptime">-</div></div>
    </div>
    <div class="section">
      <div class="section-header">${ICON.users} 账号池状态</div>
      <div class="section-body">
        <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
          <div class="stat-card"><div class="label">总计</div><div class="value" id="pool-total">-</div></div>
          <div class="stat-card"><div class="label green">空闲</div><div class="value green" id="pool-idle">-</div></div>
          <div class="stat-card"><div class="label yellow">繁忙</div><div class="value yellow" id="pool-busy">-</div></div>
          <div class="stat-card"><div class="label red">错误</div><div class="value red" id="pool-error">-</div></div>
        </div>
        <div id="pool-badges" class="account-badges"></div>
      </div>
    </div>`;

  async function refresh() {
    try {
      const [stats, accts] = await Promise.all([
        api("/admin/api/stats"),
        api("/admin/api/accounts"),
      ]);
      document.getElementById("stat-total").textContent = stats.total_requests ?? 0;
      document.getElementById("stat-success").textContent = stats.success_requests ?? 0;
      document.getElementById("stat-fail").textContent = stats.failed_requests ?? 0;
      const rate = stats.total_requests > 0
        ? ((stats.success_requests / stats.total_requests) * 100).toFixed(1) + "%"
        : "-";
      document.getElementById("stat-rate").textContent = rate;
      document.getElementById("stat-lat").textContent = stats.avg_latency_ms > 0 ? stats.avg_latency_ms + "ms" : "-";
      document.getElementById("stat-uptime").textContent = fmtUptime(stats.uptime_secs);

      document.getElementById("pool-total").textContent = accts.total ?? 0;
      document.getElementById("pool-idle").textContent = accts.idle ?? 0;
      document.getElementById("pool-busy").textContent = accts.busy ?? 0;
      document.getElementById("pool-error").textContent = accts.error ?? 0;

      const badgesEl = document.getElementById("pool-badges");
      if (accts.accounts && accts.accounts.length) {
        badgesEl.innerHTML = accts.accounts.map(a =>
          `<span class="badge ${escAttr(a.state)}">${esc(a.email || a.id)} · ${esc(a.source)}</span>`
        ).join("");
      } else {
        badgesEl.innerHTML = '<div class="empty">暂无账号</div>';
      }
    } catch (e) { /* polling will retry */ }
  }

  refresh();
  const iv = setInterval(refresh, 5000);
  el._iv = iv;
}

/* ── Accounts page ────────────────────────────────────────── */
async function renderAccounts(el) {
  el.innerHTML = `<h1 class="page-title">${ICON.users} 账号池</h1>
    <div class="section">
      <div class="section-header" id="acct-form-title">${STATE.editingAccountId ? '编辑账号' : '添加账号'}</div>
      <div class="section-body">
        <div class="form-row">
          <div class="form-group" style="flex:1;min-width:180px">
            <label>标识（邮箱/备注）</label>
            <input class="input" id="acct-email" placeholder="例如 user@example.com" value="${escAttr(STATE.editingAccountEmail || '')}">
          </div>
          <div class="form-group" style="flex:2;min-width:240px">
            <label>Token</label>
            <input class="input code" id="acct-token" placeholder="${STATE.editingAccountId ? '留空则不修改 Token' : 'Authorization Bearer token（不要带 Bearer）'}">
          </div>
          <div class="form-group" style="flex:2;min-width:240px">
            <label>Cookies</label>
            <input class="input code" id="acct-cookies" placeholder="${STATE.editingAccountId ? '留空则不修改 Cookies' : 'cf_clearance=...; session=...'}">
          </div>
          <button class="btn btn-primary" id="acct-save-btn">${STATE.editingAccountId ? ICON.edit + ' 保存' : ICON.plus + ' 添加'}</button>
          <button class="btn btn-outline" id="acct-cancel-btn" style="${STATE.editingAccountId ? '' : 'display:none'}">取消</button>
        </div>
        <div class="text-muted">面板添加的账号会持久保存；.env 账号会显示为只读，只能编辑 .env 后重启服务。</div>
      </div>
    </div>
    <div class="section">
      <div class="section-header">
        <span>账号列表</span>
        <button class="btn btn-sm btn-outline" id="acct-refresh-btn" style="margin-left:auto">${ICON.refresh} 刷新</button>
      </div>
      <div class="section-body" id="acct-table-wrap"><div class="loading">加载中…</div></div>
    </div>`;

  const wrap = document.getElementById("acct-table-wrap");

  async function loadList() {
    try {
      const data = await api("/admin/api/accounts");
      const accounts = data.accounts || [];
      if (!accounts.length) {
        wrap.innerHTML = '<div class="empty">暂无账号。你可以从面板添加持久账号，或在 .env 中配置 DEEPSEEK_TOKEN_1/2...</div>';
        return;
      }
      wrap.innerHTML = `<table>
        <thead><tr>
          <th>标识</th>
          <th>来源</th>
          <th>状态</th>
          <th>Token</th>
          <th>Cookies</th>
          <th>错误次数</th>
          <th>最后错误</th>
          <th style="width:170px">操作</th>
        </tr></thead>
        <tbody>${accounts.map(a => renderAccountRow(a)).join("")}</tbody>
      </table>`;
    } catch (e) {
      wrap.innerHTML = `<div class="loading" style="color:var(--red)">加载失败: ${esc(e.message)}</div>`;
    }
  }

  document.getElementById("acct-save-btn").onclick = async () => {
    const email = document.getElementById("acct-email").value.trim();
    const token = document.getElementById("acct-token").value.trim();
    const cookies = document.getElementById("acct-cookies").value.trim();
    try {
      if (STATE.editingAccountId) {
        const body = { email };
        if (token) body.token = token;
        if (cookies) body.cookies = cookies;
        await api(`/admin/api/accounts/${encodeURIComponent(STATE.editingAccountId)}`, {
          method: "PUT", body: JSON.stringify(body),
        });
        toast("账号已保存");
        clearAccountEdit();
        renderAccounts(el);
      } else {
        if (!token || !cookies) { toast("Token 和 Cookies 不能为空", "err"); return; }
        await api("/admin/api/accounts", {
          method: "POST", body: JSON.stringify({ token, cookies, email }),
        });
        toast("账号添加成功");
        document.getElementById("acct-email").value = "";
        document.getElementById("acct-token").value = "";
        document.getElementById("acct-cookies").value = "";
        loadList();
      }
    } catch (e) { toast(e.message, "err"); }
  };

  const cancelBtn = document.getElementById("acct-cancel-btn");
  if (cancelBtn) cancelBtn.onclick = () => { clearAccountEdit(); renderAccounts(el); };
  document.getElementById("acct-refresh-btn").onclick = loadList;
  wrap.onclick = (event) => {
    const btn = event.target.closest("[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "edit") editAccount(id, btn.dataset.email || "");
    else if (btn.dataset.action === "delete") removeAccount(id);
    else if (btn.dataset.action === "relogin") reloginAccount(id);
  };

  loadList();
}

function renderAccountRow(a) {
  const readOnly = a.read_only || a.source === "env";
  const editBtn = readOnly
    ? '<span class="text-muted text-sm">env只读</span>'
    : `<button class="btn btn-sm btn-outline" data-action="edit" data-id="${escAttr(a.id)}" data-email="${escAttr(a.email || '')}">${ICON.edit} 编辑</button>`;
  const deleteBtn = readOnly
    ? ''
    : `<button class="btn-icon danger" data-action="delete" data-id="${escAttr(a.id)}" title="删除">${ICON.x}</button>`;
  const reloginBtn = a.state === 'error'
    ? `<button class="btn btn-sm btn-outline" data-action="relogin" data-id="${escAttr(a.id)}">${ICON.reload} 重登</button>`
    : '';
  const actions = readOnly ? (reloginBtn || editBtn) : `${reloginBtn}${editBtn}${deleteBtn}`;
  return `<tr>
    <td><span class="truncate" style="max-width:160px;display:inline-block" title="${escAttr(a.id)}">${esc(a.email || a.id)}</span></td>
    <td><span class="badge ${a.source === 'env' ? 'busy' : 'idle'}">${esc(a.source)}</span></td>
    <td><span class="badge ${escAttr(a.state)}">${stateLabel(a.state)}</span></td>
    <td><span class="truncate code-inline" title="${escAttr(a.credential_fingerprint || '')}">${esc(a.token_preview || '-')}</span></td>
    <td><span class="truncate" style="max-width:180px;display:inline-block">${esc(a.cookies_preview || '-')}</span></td>
    <td>${a.error_count ?? 0}</td>
    <td class="text-muted truncate" style="max-width:180px">${esc(a.last_error) || '-'}</td>
    <td><div class="flex items-center gap-2">${actions}</div></td>
  </tr>`;
}

/* ── Account actions (global for onclick) ─────────────────── */
function setAccountEditMode(id, email = "") {
  STATE.editingAccountId = id;
  STATE.editingAccountEmail = email || "";

  const title = document.getElementById("acct-form-title");
  const emailInput = document.getElementById("acct-email");
  const tokenInput = document.getElementById("acct-token");
  const cookiesInput = document.getElementById("acct-cookies");
  const saveBtn = document.getElementById("acct-save-btn");
  const cancelBtn = document.getElementById("acct-cancel-btn");

  if (title) title.textContent = id ? "编辑账号" : "添加账号";
  if (emailInput) emailInput.value = email || "";
  if (tokenInput) {
    tokenInput.value = "";
    tokenInput.placeholder = id ? "留空则不修改 Token" : "Authorization Bearer token（不要带 Bearer）";
  }
  if (cookiesInput) {
    cookiesInput.value = "";
    cookiesInput.placeholder = id ? "留空则不修改 Cookies" : "cf_clearance=...; session=...";
  }
  if (saveBtn) saveBtn.innerHTML = id ? `${ICON.edit} 保存` : `${ICON.plus} 添加`;
  if (cancelBtn) cancelBtn.style.display = id ? "" : "none";
  if (emailInput) {
    emailInput.scrollIntoView({ behavior: "smooth", block: "center" });
    emailInput.focus();
    emailInput.select();
  }
}

function editAccount(id, email) {
  setAccountEditMode(id, email);
  toast("已进入编辑模式：留空 Token/Cookies 表示不修改", "ok");
}

function clearAccountEdit() {
  setAccountEditMode(null, "");
}

async function reloginAccount(id) {
  try {
    const res = await api(`/admin/api/accounts/${encodeURIComponent(id)}/relogin`, { method: "POST" });
    if (res.ok) { toast("重登录成功"); render(); }
    else { toast(`重登录失败: ${res.message}`, "err"); render(); }
  } catch (e) { toast(e.message, "err"); }
}

async function removeAccount(id) {
  if (!confirm("确定删除此账号？")) return;
  try {
    await api(`/admin/api/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
    toast("账号已删除");
    render();
  } catch (e) { toast(e.message, "err"); }
}

/* ── Utilities ────────────────────────────────────────────── */
function fmtUptime(s) {
  if (!s) return "-";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  let r = "";
  if (d > 0) r += d + "天 ";
  if (h > 0) r += h + "时 ";
  r += m + "分";
  return r;
}

function stateLabel(s) {
  return { idle: "空闲", busy: "繁忙", error: "异常" }[s] || s;
}

function esc(s) {
  if (s === null || s === undefined) return "";
  const d = document.createElement("div");
  d.textContent = String(s);
  return d.innerHTML;
}

function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;");
}

function js(s) {
  return JSON.stringify(String(s || "")).replace(/</g, "\\u003c");
}

/* ── Init ─────────────────────────────────────────────────── */
render();
