(() => {
  "use strict";

  // ---- Supabase config -----------------------------------------------------
  const SUPABASE_URL = "https://yysflmougvftwnqrqybf.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5c2ZsbW91Z3ZmdHducXJxeWJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTE3MTgsImV4cCI6MjA5MzY4NzcxOH0.1rRegqBITOkS_LgSkJlOKOczrV56ot7ohV4f5mCMF8s";
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ---- Constants -----------------------------------------------------------
  const DEFAULT_CATEGORIES = [
    { name: "Overtime",                  type: "hourly", rate: 350,  startTime: "15:50" },
    { name: "Overtime (Late)",           type: "hourly", rate: 350,  startTime: "21:00" },
    { name: "Pre-time",                  type: "hourly", rate: 350,  startTime: "06:50", flexibleTimes: true },
    { name: "Bellevue Extra Att.",       type: "hourly", rate: 350,  startTime: "07:30" },
    { name: "Weekend Back Up 1",         type: "hourly", rate: 350,  startTime: "08:00" },
    { name: "Weekend Back Up 2",         type: "hourly", rate: 350,  startTime: "08:00", flexibleTimes: true },
    { name: "Weekend Flat Pay",          type: "flat",   rate: 400,  startTime: "" },
    { name: "Tisch M-Th Overnight",      type: "flat",   rate: 300,  startTime: "" },
    { name: "Tisch Friday Overnight",    type: "flat",   rate: 1300, startTime: "" },
    { name: "Bellevue M-Th Overnight",   type: "flat",   rate: 2400, startTime: "" },
    { name: "Bellevue Friday Overnight", type: "flat",   rate: 3600, startTime: "" },
    { name: "Saturday Call",             type: "flat",   rate: 5200, startTime: "" },
    { name: "Sunday Call",               type: "flat",   rate: 3600, startTime: "" },
    { name: "Bellevue Long Call",        type: "flat",   rate: 1050, startTime: "" },
    { name: "Holiday",                   type: "flat",   rate: 3700, startTime: "" },
    { name: "Holiday Saturday",          type: "flat",   rate: 5200, startTime: "" },
  ];

  const uid = () =>
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  const state = {
    categories: [],
    entries: [],
    filter: { search: "", category: "", status: "", month: "" },
    editingCategoryId: null,
    editingEntryId: null,
    user: null,
    selectedEntries: new Set(),
    visibleEntryIds: new Set(),
  };

  const $ = (id) => document.getElementById(id);

  // ---- DB row mapping ------------------------------------------------------
  function catToRow(cat, userId) {
    return {
      id: cat.id,
      user_id: userId,
      name: cat.name,
      type: cat.type,
      rate: Number(cat.rate) || 0,
      start_time: cat.startTime || "",
      flexible_times: !!cat.flexibleTimes,
    };
  }
  function rowToCat(r) {
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      rate: Number(r.rate) || 0,
      startTime: r.start_time || "",
      flexibleTimes: !!r.flexible_times,
    };
  }
  function entryToRow(e, userId) {
    return {
      id: e.id,
      user_id: userId,
      date: e.date,
      category_id: e.categoryId || null,
      hours: Number(e.hours) || 0,
      start_time: e.startTime || "",
      end_time: e.endTime || "",
      status: e.status || "pending",
      note: e.note || "",
    };
  }
  function rowToEntry(r) {
    return {
      id: r.id,
      date: r.date,
      categoryId: r.category_id,
      hours: Number(r.hours) || 0,
      startTime: r.start_time || "",
      endTime: r.end_time || "",
      status: r.status,
      note: r.note || "",
    };
  }

  // ---- DB ops --------------------------------------------------------------
  async function dbLoadAll() {
    const [{ data: cats, error: e1 }, { data: entries, error: e2 }] =
      await Promise.all([
        sb.from("categories").select("*").order("created_at", { ascending: true }),
        sb.from("entries").select("*"),
      ]);
    if (e1) throw e1;
    if (e2) throw e2;
    state.categories = (cats || []).map(rowToCat);
    state.entries = (entries || []).map(rowToEntry);
    if (state.categories.length === 0) await dbSeedDefaults();
  }

  async function dbSeedDefaults() {
    const userId = state.user.id;
    const rows = DEFAULT_CATEGORIES.map((c) =>
      catToRow({ id: uid(), flexibleTimes: false, ...c }, userId)
    );
    const { data, error } = await sb.from("categories").insert(rows).select();
    if (error) throw error;
    state.categories = (data || []).map(rowToCat);
    state.entries = [];
  }

  async function dbUpsertCategory(cat) {
    const { error } = await sb
      .from("categories")
      .upsert(catToRow(cat, state.user.id));
    if (error) {
      console.error("upsert category:", error);
      showToast(`Couldn't save category: ${error.message}`);
    }
  }

  async function dbDeleteCategory(id) {
    const { error } = await sb.from("categories").delete().eq("id", id);
    if (error) {
      console.error("delete category:", error);
      showToast(`Couldn't delete category: ${error.message}`);
    }
  }

  async function dbUpsertEntry(entry) {
    const { error } = await sb
      .from("entries")
      .upsert(entryToRow(entry, state.user.id));
    if (error) {
      console.error("upsert entry:", error);
      showToast(`Couldn't save entry: ${error.message}`);
    }
  }

  async function dbDeleteEntry(id) {
    const { error } = await sb.from("entries").delete().eq("id", id);
    if (error) {
      console.error("delete entry:", error);
      showToast(`Couldn't delete entry: ${error.message}`);
    }
  }

  async function dbReset() {
    const userId = state.user.id;
    await sb.from("entries").delete().eq("user_id", userId);
    await sb.from("categories").delete().eq("user_id", userId);
    await dbSeedDefaults();
  }

  async function dbImport(data) {
    const { data: refreshData, error: refreshErr } = await sb.auth.refreshSession();
    if (refreshErr || !refreshData?.session) {
      throw new Error("Session expired — please sign out and sign in again, then retry.");
    }
    state.user = refreshData.session.user;
    const userId = state.user.id;

    const { error: delEntriesErr } = await sb.from("entries").delete().eq("user_id", userId);
    if (delEntriesErr) throw delEntriesErr;
    const { error: delCatsErr } = await sb.from("categories").delete().eq("user_id", userId);
    if (delCatsErr) throw delCatsErr;

    const catRows = data.categories.map((c) =>
      catToRow({ flexibleTimes: false, ...c }, userId)
    );
    const { data: savedCats, error: e1 } = await sb
      .from("categories")
      .insert(catRows)
      .select();
    if (e1) throw e1;
    state.categories = (savedCats || []).map(rowToCat);
    if (data.entries.length > 0) {
      const entryRows = data.entries.map((e) => entryToRow(e, userId));
      const { data: savedEntries, error: e2 } = await sb
        .from("entries")
        .insert(entryRows)
        .select();
      if (e2) throw e2;
      state.entries = (savedEntries || []).map(rowToEntry);
    } else {
      state.entries = [];
    }
  }

  // ---- Auth ----------------------------------------------------------------
  let isSignUp = false;

  function showAuth() {
    $("authOverlay").style.display = "flex";
    $("appShell").style.display = "none";
  }
  function showApp() {
    $("authOverlay").style.display = "none";
    $("appShell").style.display = "";
    if (state.user) $("userChip").textContent = state.user.email;
  }
  function setAuthError(msg) {
    const el = $("authError");
    if (msg) {
      el.style.display = "";
      el.querySelector(".error-text").textContent = msg;
    } else {
      el.style.display = "none";
    }
  }

  function wireAuth() {
    $("authToggleBtn").addEventListener("click", () => {
      isSignUp = !isSignUp;
      $("authSubmitBtn").textContent = isSignUp ? "Create Account" : "Sign In";
      $("authToggleBtn").textContent = isSignUp
        ? "Already have an account? Sign in"
        : "Don't have an account? Sign up";
      $("authSubtitle").textContent = isSignUp
        ? "Create an account to start tracking"
        : "Sign in to access your data";
      setAuthError(null);
    });

    $("authForm").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const email = $("authEmail").value.trim();
      const password = $("authPassword").value;
      const btn = $("authSubmitBtn");
      btn.disabled = true;
      const oldText = btn.textContent;
      btn.textContent = isSignUp ? "Creating…" : "Signing in…";
      setAuthError(null);

      try {
        const result = isSignUp
          ? await sb.auth.signUp({ email, password })
          : await sb.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        const session = result.data.session;
        const user = result.data.user || session?.user;
        if (isSignUp && !session) {
          setAuthError(
            "Account created. Check your email to confirm, then sign in."
          );
          return;
        }
        state.user = user;
        await dbLoadAll();
        showApp();
        renderAll();
      } catch (err) {
        setAuthError(err.message || "Authentication failed");
      } finally {
        btn.disabled = false;
        btn.textContent = oldText;
      }
    });

    $("signOutBtn").addEventListener("click", async () => {
      await sb.auth.signOut();
      state.user = null;
      state.categories = [];
      state.entries = [];
      showAuth();
    });
  }

  // ---- Helpers -------------------------------------------------------------
  function showToast(message, kind = "error") {
    let host = document.getElementById("toastHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "toastHost";
      host.className = "toast-host";
      document.body.appendChild(host);
    }
    const toast = document.createElement("div");
    toast.className = `toast toast-${kind}`;
    toast.textContent = message;
    host.appendChild(toast);
    setTimeout(() => toast.classList.add("toast-leave"), 4500);
    setTimeout(() => toast.remove(), 5000);
  }

  const fmtMoney = (n) =>
    (n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
  const fmtHours = (n) => (Number(n) || 0).toFixed(2);

  function categoryById(id) {
    return state.categories.find((c) => c.id === id);
  }

  // Hours worked past 7 PM are paid at the bumped rate, but only for shifts
  // dated in the late-rate effective year or later.
  const LATE_RATE_THRESHOLD_HOUR = 19;
  const LATE_HOURLY_RATE = 375;
  const LATE_RATE_EFFECTIVE_YEAR = 2026;

  function isLateRateEligible(dateStr) {
    if (!dateStr) return false;
    const year = parseInt(dateStr.slice(0, 4), 10);
    return Number.isFinite(year) && year >= LATE_RATE_EFFECTIVE_YEAR;
  }

  function calcHourlyEarned(baseRate, totalHours, effectiveStart, endTime, date) {
    if (totalHours <= 0) return 0;
    if (!isLateRateEligible(date)) return baseRate * totalHours;
    if (!effectiveStart || !endTime) return baseRate * totalHours;
    const [sh, sm] = effectiveStart.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;
    if (endMin <= startMin) endMin += 24 * 60;
    const totalMin = endMin - startMin;
    if (totalMin <= 0) return baseRate * totalHours;
    const thresholdMin = LATE_RATE_THRESHOLD_HOUR * 60;
    const lateMin = Math.max(0, endMin - Math.max(startMin, thresholdMin));
    const lateHours = totalHours * (lateMin / totalMin);
    const regularHours = totalHours - lateHours;
    return regularHours * baseRate + lateHours * LATE_HOURLY_RATE;
  }

  function calcEarned(entry) {
    const cat = categoryById(entry.categoryId);
    if (!cat) return 0;
    if (cat.type === "flat") return Number(cat.rate) || 0;
    const effectiveStart = cat.flexibleTimes ? entry.startTime : cat.startTime;
    return calcHourlyEarned(
      Number(cat.rate) || 0,
      Number(entry.hours) || 0,
      effectiveStart,
      entry.endTime,
      entry.date
    );
  }

  function calcHoursFromTimes(start, end) {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let mins = eh * 60 + em - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    return mins / 60;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }
  const escapeAttr = escapeHtml;

  function formatDate(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    if (!y) return iso;
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatTime(t) {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
  }

  // ---- Rendering -----------------------------------------------------------
  function renderCategories() {
    const body = $("categoriesBody");
    body.innerHTML = "";
    if (state.categories.length === 0) {
      body.innerHTML = `<tr><td colspan="5" class="empty">No categories yet. Click "+ Add Category".</td></tr>`;
      return;
    }
    for (const cat of state.categories) {
      const tr = document.createElement("tr");
      tr.className = "row-edit";
      tr.dataset.id = cat.id;
      tr.innerHTML = `
        <td class="cat-name"><input type="text" data-field="name" value="${escapeAttr(cat.name)}" /></td>
        <td>
          <span class="seg seg-sm" role="radiogroup" aria-label="Category type">
            <label class="seg-opt"><input type="radio" name="ctype-${cat.id}" value="hourly" data-field="type"${cat.type === "hourly" ? " checked" : ""} />Hr</label>
            <label class="seg-opt"><input type="radio" name="ctype-${cat.id}" value="flat" data-field="type"${cat.type === "flat" ? " checked" : ""} />Flat</label>
          </span>
        </td>
        <td class="num">
          <input type="number" data-field="rate" min="0" step="0.01" value="${cat.rate}" />
        </td>
        <td>
          ${cat.type === "flat"
            ? '<span class="start-muted">—</span>'
            : `<input type="time" data-field="startTime" value="${escapeAttr(cat.startTime || "")}" />`}
        </td>
        <td class="num">
          <button class="btn btn-ghost btn-del" data-action="delete-cat" title="Delete category">Delete</button>
        </td>
      `;
      body.appendChild(tr);
    }
  }

  function renderCategoryDropdowns() {
    const sel = $("entryCategory");
    const filt = $("filterCategory");
    const prev = sel.value;
    sel.innerHTML = "";
    filt.innerHTML = `<option value="">All categories</option>`;
    for (const c of state.categories) {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.name} ${c.type === "flat" ? `(flat ${fmtMoney(c.rate)})` : `(${fmtMoney(c.rate)}/hr)`}`;
      sel.appendChild(opt);
      const o2 = document.createElement("option");
      o2.value = c.id;
      o2.textContent = c.name;
      filt.appendChild(o2);
    }
    if (prev && state.categories.find((c) => c.id === prev)) sel.value = prev;
    syncHoursField();
    updatePreview();
  }

  function renderEntries() {
    const body = $("entriesBody");
    body.innerHTML = "";

    let rows = [...state.entries].sort((a, b) => (a.date < b.date ? 1 : -1));
    const { search, category, status, month } = state.filter;
    if (category) rows = rows.filter((e) => e.categoryId === category);
    if (status) rows = rows.filter((e) => e.status === status);
    if (month) rows = rows.filter((e) => e.date && e.date.startsWith(month));
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((e) => {
        const cat = categoryById(e.categoryId);
        return (
          (e.note || "").toLowerCase().includes(q) ||
          (cat && cat.name.toLowerCase().includes(q))
        );
      });
    }

    state.visibleEntryIds = new Set(rows.map((e) => e.id));

    if (rows.length === 0) {
      const isEmpty = state.entries.length === 0;
      body.innerHTML = `<div class="empty">${
        isEmpty
          ? "No entries yet. Log your first shift on the Log tab."
          : "No entries match the current filters."
      }</div>`;
      $("footHours").textContent = fmtHours(0);
      $("footTotal").textContent = fmtMoney(0);
      updateSelectAll();
      updateBulkBar();
      renderRecent();
      return;
    }

    let totalHours = 0;
    let totalEarned = 0;
    for (const e of rows) {
      const cat = categoryById(e.categoryId);
      const earned = calcEarned(e);
      const hours = cat && cat.type === "hourly" ? Number(e.hours) || 0 : 0;
      totalHours += hours;
      totalEarned += earned;

      const isFlat = cat && cat.type === "flat";
      const effectiveStart =
        cat && cat.flexibleTimes ? e.startTime : (cat && cat.startTime);
      const hoursLabel = !cat
        ? ""
        : isFlat
          ? "flat rate"
          : effectiveStart && e.endTime
            ? `<strong>${fmtHours(hours)}</strong> (${formatTime(effectiveStart)}–${formatTime(e.endTime)})`
            : `<strong>${fmtHours(hours)}</strong> hrs`;
      const checked = state.selectedEntries.has(e.id) ? " checked" : "";

      const row = document.createElement("div");
      row.className = "shift-row";
      row.dataset.id = e.id;
      row.innerHTML = `
        <input type="checkbox" class="entry-select"${checked} aria-label="Select entry" />
        <div class="shift-main">
          <div class="shift-line">
            <span class="shift-cat">${cat ? escapeHtml(cat.name) : "<em>(deleted)</em>"}</span>
            ${cat ? `<span class="tag ${isFlat ? "tag-accent" : "tag-accent-2"}">${isFlat ? "flat" : "hourly"}</span>` : ""}
            <span class="tag ${e.status === "deposited" ? "tag-accent-2" : "tag-accent"}">${escapeHtml(e.status)}</span>
          </div>
          <div class="shift-date">${formatDate(e.date)}</div>
        </div>
        <div class="shift-right">
          <span class="shift-earned">${fmtMoney(earned)}</span>
          <span class="shift-sub">${hoursLabel}</span>
        </div>
        <div class="shift-actions">
          <button class="btn btn-ghost btn-icon" data-action="edit-entry" title="Edit entry">✎</button>
          <button class="btn btn-ghost btn-icon" data-action="cycle-status" title="Cycle status">↻</button>
          <button class="btn btn-ghost btn-icon btn-del" data-action="delete-entry" title="Delete entry">✕</button>
        </div>
        ${e.note ? `<div class="shift-note">${escapeHtml(e.note)}</div>` : ""}
      `;
      body.appendChild(row);
    }
    $("footHours").textContent = fmtHours(totalHours);
    $("footTotal").textContent = fmtMoney(totalEarned);
    updateSelectAll();
    updateBulkBar();
    renderRecent();
  }

  function renderRecent() {
    const host = $("recentShifts");
    if (!host) return;
    const rows = [...state.entries]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 5);
    if (rows.length === 0) {
      host.innerHTML = `<div class="empty">Nothing logged yet.</div>`;
      return;
    }
    host.innerHTML = rows
      .map((e) => {
        const cat = categoryById(e.categoryId);
        const isFlat = cat && cat.type === "flat";
        const sub = !cat ? "" : isFlat ? "flat rate" : `${fmtHours(e.hours)} hrs`;
        return `<div class="card elev-sm recent-row">
          <div class="recent-main">
            <div class="shift-line">
              <span class="shift-cat">${cat ? escapeHtml(cat.name) : "<em>(deleted)</em>"}</span>
              ${cat ? `<span class="tag ${isFlat ? "tag-accent" : "tag-accent-2"}">${isFlat ? "flat" : "hourly"}</span>` : ""}
            </div>
            <div class="shift-date">${formatDate(e.date)}${sub ? " · " + sub : ""}</div>
          </div>
          <span class="recent-earned">${fmtMoney(calcEarned(e))}</span>
        </div>`;
      })
      .join("");
  }

  function updateSelectAll() {
    const all = $("selectAllEntries");
    if (!all) return;
    const visible = state.visibleEntryIds;
    if (visible.size === 0) {
      all.checked = false;
      all.indeterminate = false;
      return;
    }
    let selectedCount = 0;
    for (const id of visible) if (state.selectedEntries.has(id)) selectedCount++;
    all.checked = selectedCount === visible.size;
    all.indeterminate = selectedCount > 0 && selectedCount < visible.size;
  }

  function updateBulkBar() {
    const bar = $("bulkBar");
    if (!bar) return;
    const count = state.selectedEntries.size;
    $("bulkCount").textContent = String(count);
    bar.hidden = count === 0;
  }

  async function bulkApplyStatus(newStatus) {
    const ids = [...state.selectedEntries];
    if (ids.length === 0) return;
    for (const id of ids) {
      const entry = state.entries.find((e) => e.id === id);
      if (entry) entry.status = newStatus;
    }
    const { error } = await sb
      .from("entries")
      .update({ status: newStatus })
      .in("id", ids);
    if (error) {
      alert("Bulk update failed: " + error.message);
      return;
    }
    state.selectedEntries.clear();
    renderEntries();
    renderSummary();
  }

  function buildMonthOptions() {
    const sel = $("filterMonth");
    if (!sel) return;
    const months = new Set();
    for (const e of state.entries) {
      if (e.date) months.add(e.date.slice(0, 7));
    }
    const sorted = [...months].sort().reverse();
    const prev = state.filter.month;
    sel.innerHTML = '<option value="">All months</option>';
    for (const m of sorted) {
      const [y, mo] = m.split("-");
      const dt = new Date(Number(y), Number(mo) - 1, 1);
      const label = dt.toLocaleString(undefined, { month: "long", year: "numeric" });
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = label;
      sel.appendChild(opt);
    }
    if (prev && months.has(prev)) sel.value = prev;
    else state.filter.month = "";
  }

  function wireTabs() {
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.tab;
        document.querySelectorAll(".nav-item").forEach((b) => {
          const isActive = b === btn;
          b.classList.toggle("active", isActive);
          b.setAttribute("aria-selected", isActive ? "true" : "false");
        });
        document.querySelectorAll(".tab-pane").forEach((p) =>
          p.classList.toggle("active", p.id === `tab-${target}`)
        );
      });
    });
  }

  function renderSummary() {
    let total = 0,
      outstanding = 0,
      deposited = 0,
      hours = 0;
    for (const e of state.entries) {
      const earned = calcEarned(e);
      total += earned;
      if (e.status === "deposited") deposited += earned;
      else outstanding += earned;
      const cat = categoryById(e.categoryId);
      if (cat && cat.type === "hourly") hours += Number(e.hours) || 0;
    }
    $("statTotal").textContent = fmtMoney(total);
    $("statPending").textContent = fmtMoney(outstanding);
    $("statDeposited").textContent = fmtMoney(deposited);
    $("statHours").textContent = fmtHours(hours);
    $("statShifts").textContent = String(state.entries.length);
  }

  function renderMetrics() {
    const yearSel = $("metricsYear");
    const monthlyEl = $("metricsMonthly");
    const catsEl = $("metricsCategories");
    if (!yearSel || !monthlyEl || !catsEl) return;

    // populate year selector from available entry dates
    const years = [...new Set(state.entries.map((e) => e.date && e.date.slice(0, 4)).filter(Boolean))].sort().reverse();
    const curYear = yearSel.value || (years[0] ?? String(new Date().getFullYear()));
    yearSel.innerHTML = years.map((y) => `<option value="${y}"${y === curYear ? " selected" : ""}>${y}</option>`).join("");
    if (!yearSel.value) yearSel.value = curYear;

    const filtered = state.entries.filter((e) => e.date && e.date.startsWith(curYear));

    // ---- monthly overview ----
    const monthMap = new Map();
    for (const e of filtered) {
      const m = e.date.slice(0, 7);
      if (!monthMap.has(m)) monthMap.set(m, { hours: 0, income: 0 });
      const d = monthMap.get(m);
      d.income += calcEarned(e);
      const cat = categoryById(e.categoryId);
      if (cat && cat.type === "hourly") d.hours += Number(e.hours) || 0;
    }
    const months = [...monthMap.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    const maxHours  = Math.max(...months.map(([, d]) => d.hours), 1);
    const maxIncome = Math.max(...months.map(([, d]) => d.income), 1);

    monthlyEl.innerHTML = months.length ? months.map(([key, d]) => {
      const [y, mo] = key.split("-");
      const label = new Date(+y, +mo - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
      const hPct  = (d.hours  / maxHours  * 100).toFixed(1);
      const iPct  = (d.income / maxIncome * 100).toFixed(1);
      return `<div class="metrics-row">
        <div class="metrics-month">${escapeHtml(label)}</div>
        <div class="metrics-bars">
          <div class="metrics-bar-row">
            <span class="metrics-bar-lbl">Hours</span>
            <div class="metrics-track"><div class="metrics-fill hours" style="width:${hPct}%"></div></div>
            <span class="metrics-bar-val">${fmtHours(d.hours)}</span>
          </div>
          <div class="metrics-bar-row">
            <span class="metrics-bar-lbl">Income</span>
            <div class="metrics-track"><div class="metrics-fill income" style="width:${iPct}%"></div></div>
            <span class="metrics-bar-val">${fmtMoney(d.income)}</span>
          </div>
        </div>
      </div>`;
    }).join("") : `<p class="empty">No entries for ${curYear}.</p>`;

    // ---- category breakdown ----
    const catMap = new Map();
    for (const e of filtered) {
      const cat = categoryById(e.categoryId);
      if (!cat) continue;
      if (!catMap.has(cat.id)) catMap.set(cat.id, { name: cat.name, type: cat.type, income: 0, hours: 0 });
      const c = catMap.get(cat.id);
      c.income += calcEarned(e);
      if (cat.type === "hourly") c.hours += Number(e.hours) || 0;
    }
    const cats = [...catMap.values()].sort((a, b) => b.income - a.income);
    const totalIncome  = cats.reduce((s, c) => s + c.income, 0);
    const maxCatIncome = Math.max(...cats.map((c) => c.income), 1);

    catsEl.innerHTML = cats.length ? cats.map((c) => {
      const pct    = totalIncome > 0 ? Math.round(c.income / totalIncome * 100) : 0;
      const barPct = (c.income / maxCatIncome * 100).toFixed(1);
      return `<div class="metrics-cat-row">
        <div class="metrics-cat-top">
          <span class="metrics-cat-name">${escapeHtml(c.name)}</span>
          <span class="tag ${c.type === "flat" ? "tag-accent" : "tag-accent-2"}">${escapeHtml(c.type)}</span>
          <span class="metrics-cat-amount">${fmtMoney(c.income)}</span>
          <span class="metrics-cat-pct">${pct}%</span>
        </div>
        <div class="metrics-cat-track"><div class="metrics-cat-fill" style="width:${barPct}%"></div></div>
        ${c.hours > 0 ? `<span class="metrics-cat-sub">${fmtHours(c.hours)} hours</span>` : ""}
      </div>`;
    }).join("") : `<p class="empty">No entries for ${curYear}.</p>`;

    yearSel.onchange = () => renderMetrics();
  }

  function renderAll() {
    renderCategories();
    renderCategoryDropdowns();
    buildMonthOptions();
    renderEntries();
    renderSummary();
    renderMetrics();
  }

  // ---- Entry form helpers --------------------------------------------------
  function syncHoursField() {
    const sel = $("entryCategory");
    const cat = categoryById(sel.value);
    const startField = $("startTimeField");
    const endField = $("endTimeField");
    const hoursField = $("hoursField");
    const startInput = $("entryStartTime");
    const endInput = $("entryEndTime");
    const hoursInput = $("entryHours");
    const startHint = $("startTimeHint");
    const endHint = $("endTimeHint");
    if (!cat) return;
    const timeGroup = document.getElementById("entryTimeGroup");
    if (cat.type === "flat") {
      startField.style.display = "none";
      endField.style.display = "none";
      hoursField.style.display = "none";
      if (timeGroup) timeGroup.style.display = "none";
      startInput.value = "";
      endInput.value = "";
      hoursInput.value = "";
      hoursInput.required = false;
      if (endHint) endHint.textContent = "";
    } else if (cat.flexibleTimes) {
      if (timeGroup) timeGroup.style.display = "";
      startField.style.display = "";
      endField.style.display = "";
      hoursField.style.display = "";
      startHint.textContent = "";
      if (endHint) endHint.textContent = "";
      hoursInput.required = true;
      recalcHoursFromEndTime();
    } else {
      if (timeGroup) timeGroup.style.display = "";
      startField.style.display = "none";
      startInput.value = "";
      endField.style.display = "";
      hoursField.style.display = "";
      startHint.textContent = "";
      if (endHint) {
        endHint.textContent = cat.startTime
          ? `(starts at ${formatTime(cat.startTime)})`
          : "(no start time set on category)";
      }
      hoursInput.required = true;
      recalcHoursFromEndTime();
    }
  }

  function recalcHoursFromEndTime() {
    const sel = $("entryCategory");
    const cat = categoryById(sel.value);
    const startInput = $("entryStartTime");
    const endInput = $("entryEndTime");
    const hoursInput = $("entryHours");
    const hoursAuto = $("hoursAuto");
    if (!cat || cat.type !== "hourly") return;
    const effectiveStart = cat.flexibleTimes ? startInput.value : cat.startTime;
    if (endInput.value && effectiveStart) {
      const h = calcHoursFromTimes(effectiveStart, endInput.value);
      hoursInput.value = (Math.round(h * 100) / 100).toString();
      hoursAuto.textContent = "(auto from times)";
    } else {
      hoursAuto.textContent = cat.flexibleTimes
        ? "(enter start & end times, or manually)"
        : "(enter manually or set times)";
    }
    updatePreview();
  }

  function updatePreview() {
    const sel = $("entryCategory");
    const cat = categoryById(sel.value);
    if (!cat) {
      $("entryPreview").textContent = fmtMoney(0);
      return;
    }
    if (cat.type === "flat") {
      $("entryPreview").textContent = fmtMoney(Number(cat.rate) || 0);
      return;
    }
    const hours = Number($("entryHours").value) || 0;
    const effectiveStart = cat.flexibleTimes ? $("entryStartTime").value : cat.startTime;
    const endTime = $("entryEndTime").value;
    const date = $("entryDate").value;
    $("entryPreview").textContent = fmtMoney(
      calcHourlyEarned(Number(cat.rate) || 0, hours, effectiveStart, endTime, date)
    );
  }

  function resetEntryForm() {
    $("entryNote").value = "";
    $("entryStartTime").value = "";
    $("entryEndTime").value = "";
    $("entryHours").value = "";
    recalcHoursFromEndTime();
  }

  function exitEditMode() {
    state.editingEntryId = null;
    $("entrySubmitBtn").textContent = "Add Entry";
    $("entryCancelEdit").style.display = "none";
    resetEntryForm();
  }

  function populateFormForEdit(entry) {
    const cat = categoryById(entry.categoryId);
    if (!cat) {
      showToast(
        "This entry's category has been deleted. Re-create the category before editing, or delete the entry."
      );
      return;
    }
    state.editingEntryId = entry.id;
    $("entryDate").value = entry.date || "";
    $("entryCategory").value = cat.id;
    syncHoursField();
    if (entry.startTime) $("entryStartTime").value = entry.startTime;
    if (entry.endTime) $("entryEndTime").value = entry.endTime;
    $("entryHours").value = entry.hours > 0 ? entry.hours : "";
    $("hoursAuto").textContent = entry.startTime || entry.endTime ? "(auto from times)" : "";
    $("entryStatus").value = entry.status || "pending";
    $("entryNote").value = entry.note || "";
    updatePreview();
    $("entrySubmitBtn").textContent = "Update Entry";
    $("entryCancelEdit").style.display = "";
    document.querySelector('.nav-item[data-tab="home"]').click();
    $("entryPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---- Wire ----------------------------------------------------------------
  function wire() {
    $("entryDate").value = new Date().toISOString().slice(0, 10);
    $("entryCategory").addEventListener("change", () => {
      syncHoursField();
      updatePreview();
    });
    $("entryDate").addEventListener("input", updatePreview);
    $("entryStartTime").addEventListener("input", recalcHoursFromEndTime);
    $("entryEndTime").addEventListener("input", recalcHoursFromEndTime);
    $("entryHours").addEventListener("input", () => {
      $("hoursAuto").textContent = "(manual)";
      updatePreview();
    });

    $("entryForm").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const cat = categoryById($("entryCategory").value);
      if (!cat) return;
      const hours = cat.type === "hourly" ? Number($("entryHours").value) || 0 : 0;
      const entryStartTime = cat.flexibleTimes ? $("entryStartTime").value : "";
      const endTime = cat.type === "hourly" ? $("entryEndTime").value : "";
      if (cat.type === "hourly" && hours <= 0) {
        $("entryEndTime").focus();
        return;
      }

      if (state.editingEntryId) {
        const existing = state.entries.find((e) => e.id === state.editingEntryId);
        if (existing) {
          Object.assign(existing, {
            date: $("entryDate").value || new Date().toISOString().slice(0, 10),
            categoryId: cat.id,
            hours,
            startTime: entryStartTime,
            endTime,
            status: $("entryStatus").value,
            note: $("entryNote").value.trim(),
          });
          renderEntries();
          renderSummary();
          renderMetrics();
          await dbUpsertEntry(existing);
        }
        exitEditMode();
      } else {
        const entry = {
          id: uid(),
          date: $("entryDate").value || new Date().toISOString().slice(0, 10),
          categoryId: cat.id,
          hours,
          startTime: entryStartTime,
          endTime,
          status: $("entryStatus").value,
          note: $("entryNote").value.trim(),
        };
        state.entries.push(entry);
        renderEntries();
        renderSummary();
        resetEntryForm();
        await dbUpsertEntry(entry);
      }
    });

    $("entryCancelEdit").addEventListener("click", exitEditMode);

    // Categories
    $("categoriesBody").addEventListener("click", async (ev) => {
      const row = ev.target.closest("tr[data-id]");
      if (!row) return;
      const id = row.dataset.id;
      const cat = categoryById(id);
      if (!cat) return;
      const btn = ev.target.closest("[data-action]");
      if (btn && btn.dataset.action === "delete-cat") {
        const used = state.entries.some((e) => e.categoryId === id);
        const msg = used
          ? `Delete "${cat.name}"? It is used by existing entries — those entries will remain but lose the category link.`
          : `Delete "${cat.name}"?`;
        if (!confirm(msg)) return;
        state.categories = state.categories.filter((c) => c.id !== id);
        renderAll();
        await dbDeleteCategory(id);
      }
    });

    $("categoriesBody").addEventListener("change", async (ev) => {
      const row = ev.target.closest("tr[data-id]");
      if (!row) return;
      const cat = categoryById(row.dataset.id);
      if (!cat) return;
      const field = ev.target.dataset.field;
      if (!field) return;
      if (field === "rate") cat.rate = Number(ev.target.value) || 0;
      else if (field === "type") cat.type = ev.target.value;
      else cat[field] = ev.target.value;
      if (field === "type") renderCategories();
      renderCategoryDropdowns();
      renderEntries();
      renderSummary();
      renderMetrics();
      await dbUpsertCategory(cat);
    });

    // Entries
    $("entriesBody").addEventListener("click", async (ev) => {
      const row = ev.target.closest(".shift-row[data-id]");
      if (!row) return;
      const entry = state.entries.find((e) => e.id === row.dataset.id);
      if (!entry) return;
      const action = ev.target.closest("[data-action]")?.dataset.action;
      if (action === "edit-entry") {
        populateFormForEdit(entry);
      } else if (action === "delete-entry") {
        state.entries = state.entries.filter((e) => e.id !== entry.id);
        state.selectedEntries.delete(entry.id);
        renderEntries();
        renderSummary();
        renderMetrics();
        await dbDeleteEntry(entry.id);
      } else if (action === "cycle-status") {
        const order = ["pending", "submitted", "deposited"];
        entry.status = order[(order.indexOf(entry.status) + 1) % order.length];
        renderEntries();
        renderSummary();
        await dbUpsertEntry(entry);
      }
    });

    // Entry selection (bulk)
    $("entriesBody").addEventListener("change", (ev) => {
      const cb = ev.target.closest(".entry-select");
      if (!cb) return;
      const row = cb.closest(".shift-row[data-id]");
      if (!row) return;
      const id = row.dataset.id;
      if (cb.checked) state.selectedEntries.add(id);
      else state.selectedEntries.delete(id);
      updateSelectAll();
      updateBulkBar();
    });

    $("selectAllEntries").addEventListener("change", (ev) => {
      const visible = state.visibleEntryIds;
      if (ev.target.checked) {
        visible.forEach((id) => state.selectedEntries.add(id));
      } else {
        visible.forEach((id) => state.selectedEntries.delete(id));
      }
      renderEntries();
    });

    $("bulkApply").addEventListener("click", async () => {
      const newStatus = $("bulkStatus").value;
      const count = state.selectedEntries.size;
      if (!confirm(`Mark ${count} selected entr${count === 1 ? "y" : "ies"} as "${newStatus}"?`)) return;
      const btn = $("bulkApply");
      btn.disabled = true;
      btn.textContent = "Applying…";
      try {
        await bulkApplyStatus(newStatus);
      } finally {
        btn.disabled = false;
        btn.textContent = "Apply status";
      }
    });

    $("bulkClear").addEventListener("click", () => {
      state.selectedEntries.clear();
      renderEntries();
    });

    // Filters
    $("searchInput").addEventListener("input", (ev) => {
      state.filter.search = ev.target.value;
      renderEntries();
    });
    $("filterMonth").addEventListener("change", (ev) => {
      state.filter.month = ev.target.value;
      renderEntries();
    });
    $("filterCategory").addEventListener("change", (ev) => {
      state.filter.category = ev.target.value;
      renderEntries();
    });
    $("filterStatus").addEventListener("change", (ev) => {
      state.filter.status = ev.target.value;
      renderEntries();
    });

    // Top-bar
    $("addCategoryBtn").addEventListener("click", () => openCategoryDialog());
    $("resetBtn").addEventListener("click", async () => {
      if (!confirm("Wipe all categories and entries and restore defaults?")) return;
      try {
        await dbReset();
        renderAll();
      } catch (err) {
        alert("Reset failed: " + err.message);
      }
    });

    $("exportBtn").addEventListener("click", () => {
      const blob = new Blob(
        [JSON.stringify({ categories: state.categories, entries: state.entries }, null, 2)],
        { type: "application/json" }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `overtime-tracker-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    $("importBtn").addEventListener("click", () => $("importFile").click());
    $("importFile").addEventListener("change", async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!Array.isArray(data.categories) || !Array.isArray(data.entries)) {
          throw new Error("Invalid file format");
        }
        if (!confirm("Import will replace all your current categories and entries. Continue?")) {
          ev.target.value = "";
          return;
        }
        await dbImport(data);
        renderAll();
      } catch (err) {
        alert("Could not import file: " + err.message);
      } finally {
        ev.target.value = "";
      }
    });

    // Category dialog
    const dialog = $("categoryDialog");
    $("catCancel").addEventListener("click", () => dialog.close());
    document.querySelectorAll('input[name="catType"]').forEach((r) =>
      r.addEventListener("change", syncCatTypeUI)
    );
    $("categoryForm").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const name = $("catName").value.trim();
      if (!name) return;
      const type = document.querySelector('input[name="catType"]:checked').value;
      const rate = Number($("catRate").value) || 0;
      const startTime = type === "hourly" ? $("catStartTime").value : "";
      let cat;
      if (state.editingCategoryId) {
        cat = categoryById(state.editingCategoryId);
        if (cat) Object.assign(cat, { name, type, rate, startTime });
      } else {
        cat = { id: uid(), name, type, rate, startTime, flexibleTimes: false };
        state.categories.push(cat);
      }
      state.editingCategoryId = null;
      dialog.close();
      renderAll();
      if (cat) await dbUpsertCategory(cat);
    });
  }

  // ---- Theme ---------------------------------------------------------------
  // The moon/sun icon swap is pure CSS driven by the html.ci-dark class.
  function wireTheme() {
    let saved = null;
    try {
      saved = localStorage.getItem("ci-theme");
    } catch (e) {}
    if (saved === "dark") document.documentElement.classList.add("ci-dark");
    const btn = $("themeToggle");
    if (btn) {
      btn.addEventListener("click", () => {
        const dark = document.documentElement.classList.toggle("ci-dark");
        try {
          localStorage.setItem("ci-theme", dark ? "dark" : "light");
        } catch (e) {}
      });
    }
  }

  function syncCatTypeUI() {
    const isFlat =
      document.querySelector('input[name="catType"]:checked').value === "flat";
    $("catRateLabel").textContent = isFlat
      ? "Flat amount per shift ($)"
      : "Hourly Rate ($)";
    $("catStartTimeField").style.display = isFlat ? "none" : "";
  }

  function openCategoryDialog(cat) {
    state.editingCategoryId = cat ? cat.id : null;
    $("categoryDialogTitle").textContent = cat ? "Edit Category" : "Add Category";
    $("catName").value = cat?.name || "";
    document.querySelector(
      `input[name="catType"][value="${cat?.type || "hourly"}"]`
    ).checked = true;
    $("catRate").value = cat?.rate ?? "";
    $("catStartTime").value = cat?.startTime ?? "";
    syncCatTypeUI();
    $("categoryDialog").showModal();
    $("catName").focus();
  }

  // ---- Init ----------------------------------------------------------------
  async function init() {
    wireTheme();
    wireAuth();
    wire();
    wireTabs();

    const { data } = await sb.auth.getSession();
    const session = data?.session;
    if (session?.user) {
      state.user = session.user;
      try {
        await dbLoadAll();
        showApp();
        renderAll();
      } catch (err) {
        console.error("Failed to load data:", err);
        setAuthError("Failed to load data: " + err.message);
        showAuth();
      }
    } else {
      showAuth();
    }

    sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") showAuth();
    });
  }

  init();
})();
