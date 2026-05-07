(() => {
  "use strict";

  // ---- Supabase config -----------------------------------------------------
  const SUPABASE_URL = "https://yysflmougvftwnqrqybf.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5c2ZsbW91Z3ZmdHducXJxeWJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTE3MTgsImV4cCI6MjA5MzY4NzcxOH0.1rRegqBITOkS_LgSkJlOKOczrV56ot7ohV4f5mCMF8s";
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ---- Constants -----------------------------------------------------------
  const FLEXIBLE_CATEGORIES = new Set(["Weekend Back Up 2", "Pre-time"]);
  const CORRECT_START_TIMES = {
    "Overtime": "15:50",
    "Overtime (Late)": "21:00",
    "Pre-time": "06:50",
    "Bellevue Extra Att.": "07:30",
    "Weekend Back Up 1": "08:00",
    "Weekend Back Up 2": "08:00",
  };

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
    filter: { search: "", category: "", status: "" },
    editingCategoryId: null,
    user: null,
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
    applyMigrations();
  }

  function applyMigrations() {
    const dirty = [];
    for (const c of state.categories) {
      let changed = false;
      if (FLEXIBLE_CATEGORIES.has(c.name) && !c.flexibleTimes) {
        c.flexibleTimes = true;
        changed = true;
      }
      if (c.name in CORRECT_START_TIMES && c.startTime !== CORRECT_START_TIMES[c.name]) {
        c.startTime = CORRECT_START_TIMES[c.name];
        changed = true;
      }
      if (changed) dirty.push(c);
    }
    for (const c of dirty) dbUpsertCategory(c);
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
    if (error) console.error("upsert category:", error);
  }

  async function dbDeleteCategory(id) {
    const { error } = await sb.from("categories").delete().eq("id", id);
    if (error) console.error("delete category:", error);
  }

  async function dbUpsertEntry(entry) {
    const { error } = await sb
      .from("entries")
      .upsert(entryToRow(entry, state.user.id));
    if (error) console.error("upsert entry:", error);
  }

  async function dbDeleteEntry(id) {
    const { error } = await sb.from("entries").delete().eq("id", id);
    if (error) console.error("delete entry:", error);
  }

  async function dbReset() {
    const userId = state.user.id;
    await sb.from("entries").delete().eq("user_id", userId);
    await sb.from("categories").delete().eq("user_id", userId);
    await dbSeedDefaults();
  }

  async function dbImport(data) {
    const userId = state.user.id;
    await sb.from("entries").delete().eq("user_id", userId);
    await sb.from("categories").delete().eq("user_id", userId);
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
  const fmtMoney = (n) =>
    (n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
  const fmtHours = (n) => (Number(n) || 0).toFixed(1);

  function categoryById(id) {
    return state.categories.find((c) => c.id === id);
  }

  function calcEarned(entry) {
    const cat = categoryById(entry.categoryId);
    if (!cat) return 0;
    if (cat.type === "flat") return Number(cat.rate) || 0;
    return (Number(cat.rate) || 0) * (Number(entry.hours) || 0);
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
        <td><input type="text" data-field="name" value="${escapeAttr(cat.name)}" /></td>
        <td>
          <div class="toggle" data-type="${cat.type}" role="switch" aria-checked="${cat.type === "flat"}" tabindex="0" title="Toggle hourly / flat">
            <span class="label-on">Hr</span>
            <span class="label-off">Flat</span>
            <span class="knob">${cat.type === "flat" ? "Flat" : "Hr"}</span>
          </div>
        </td>
        <td class="num">
          <input type="number" data-field="rate" min="0" step="0.01" value="${cat.rate}" />
        </td>
        <td class="num">
          ${cat.type === "flat"
            ? '<span class="muted">—</span>'
            : `<input type="time" data-field="startTime" value="${escapeAttr(cat.startTime || "")}" />`}
        </td>
        <td class="num">
          <button class="btn btn-icon del" data-action="delete-cat" title="Delete category">Delete</button>
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
    const { search, category, status } = state.filter;
    if (category) rows = rows.filter((e) => e.categoryId === category);
    if (status) rows = rows.filter((e) => e.status === status);
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

    if (rows.length === 0) {
      body.innerHTML = `<tr><td colspan="7" class="empty">No entries match. Log a shift on the right to get started.</td></tr>`;
      $("footHours").textContent = fmtHours(0);
      $("footTotal").textContent = fmtMoney(0);
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

      const tr = document.createElement("tr");
      tr.dataset.id = e.id;
      const effectiveStart =
        cat && cat.flexibleTimes ? e.startTime : (cat && cat.startTime);
      const hoursLabel =
        cat && cat.type === "hourly"
          ? effectiveStart && e.endTime
            ? `${fmtHours(hours)} <span class="muted small">(${formatTime(effectiveStart)}–${formatTime(e.endTime)})</span>`
            : fmtHours(hours)
          : "—";
      tr.innerHTML = `
        <td>${formatDate(e.date)}</td>
        <td>
          ${cat ? escapeHtml(cat.name) : "<em>(deleted)</em>"}
          ${cat ? `<span class="pill ${cat.type}">${cat.type}</span>` : ""}
        </td>
        <td class="num">${hoursLabel}</td>
        <td class="num">${fmtMoney(earned)}</td>
        <td><span class="pill ${e.status}">${e.status}</span></td>
        <td>${escapeHtml(e.note || "")}</td>
        <td class="num">
          <button class="btn btn-icon" data-action="cycle-status" title="Cycle status">↻</button>
          <button class="btn btn-icon del" data-action="delete-entry" title="Delete entry">✕</button>
        </td>
      `;
      body.appendChild(tr);
    }
    $("footHours").textContent = fmtHours(totalHours);
    $("footTotal").textContent = fmtMoney(totalEarned);
  }

  function renderSummary() {
    let total = 0,
      pending = 0,
      deposited = 0,
      hours = 0;
    for (const e of state.entries) {
      const earned = calcEarned(e);
      total += earned;
      if (e.status === "deposited") deposited += earned;
      else pending += earned;
      const cat = categoryById(e.categoryId);
      if (cat && cat.type === "hourly") hours += Number(e.hours) || 0;
    }
    $("statTotal").textContent = fmtMoney(total);
    $("statPending").textContent = fmtMoney(pending);
    $("statDeposited").textContent = fmtMoney(deposited);
    $("statHours").textContent = fmtHours(hours);
    $("statShifts").textContent = String(state.entries.length);
  }

  function renderAll() {
    renderCategories();
    renderCategoryDropdowns();
    renderEntries();
    renderSummary();
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
    const hint = $("startTimeHint");
    if (!cat) return;
    if (cat.type === "flat") {
      startField.style.display = "none";
      endField.style.display = "none";
      hoursField.style.display = "none";
      startInput.value = "";
      endInput.value = "";
      hoursInput.value = "";
      hoursInput.required = false;
    } else if (cat.flexibleTimes) {
      startField.style.display = "";
      endField.style.display = "";
      hoursField.style.display = "";
      hint.textContent = "";
      hoursInput.required = true;
      recalcHoursFromEndTime();
    } else {
      startField.style.display = "none";
      startInput.value = "";
      endField.style.display = "";
      hoursField.style.display = "";
      hint.textContent = cat.startTime
        ? `(starts at ${formatTime(cat.startTime)})`
        : "(no start time set on category)";
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
    const hours = Number($("entryHours").value) || 0;
    const earned =
      cat.type === "flat" ? Number(cat.rate) || 0 : (Number(cat.rate) || 0) * hours;
    $("entryPreview").textContent = fmtMoney(earned);
  }

  // ---- Wire ----------------------------------------------------------------
  function wire() {
    $("entryDate").value = new Date().toISOString().slice(0, 10);
    $("entryCategory").addEventListener("change", () => {
      syncHoursField();
      updatePreview();
    });
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
      $("entryNote").value = "";
      $("entryStartTime").value = "";
      $("entryEndTime").value = "";
      $("entryHours").value = "";
      updatePreview();
      await dbUpsertEntry(entry);
    });

    // Categories
    $("categoriesBody").addEventListener("click", async (ev) => {
      const row = ev.target.closest("tr[data-id]");
      if (!row) return;
      const id = row.dataset.id;
      const cat = categoryById(id);
      if (!cat) return;
      const toggle = ev.target.closest(".toggle");
      if (toggle) {
        cat.type = cat.type === "hourly" ? "flat" : "hourly";
        renderCategories();
        renderCategoryDropdowns();
        renderEntries();
        renderSummary();
        await dbUpsertCategory(cat);
        return;
      }
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

    $("categoriesBody").addEventListener("keydown", (ev) => {
      const toggle = ev.target.closest(".toggle");
      if (toggle && (ev.key === "Enter" || ev.key === " ")) {
        ev.preventDefault();
        toggle.click();
      }
    });

    $("categoriesBody").addEventListener("change", async (ev) => {
      const row = ev.target.closest("tr[data-id]");
      if (!row) return;
      const cat = categoryById(row.dataset.id);
      if (!cat) return;
      const field = ev.target.dataset.field;
      if (!field) return;
      if (field === "rate") cat[field] = Number(ev.target.value) || 0;
      else cat[field] = ev.target.value;
      renderCategoryDropdowns();
      renderEntries();
      renderSummary();
      await dbUpsertCategory(cat);
    });

    // Entries
    $("entriesBody").addEventListener("click", async (ev) => {
      const row = ev.target.closest("tr[data-id]");
      if (!row) return;
      const entry = state.entries.find((e) => e.id === row.dataset.id);
      if (!entry) return;
      const action = ev.target.closest("[data-action]")?.dataset.action;
      if (action === "delete-entry") {
        state.entries = state.entries.filter((e) => e.id !== entry.id);
        renderEntries();
        renderSummary();
        await dbDeleteEntry(entry.id);
      } else if (action === "cycle-status") {
        const order = ["pending", "submitted", "deposited"];
        entry.status = order[(order.indexOf(entry.status) + 1) % order.length];
        renderEntries();
        renderSummary();
        await dbUpsertEntry(entry);
      }
    });

    // Filters
    $("searchInput").addEventListener("input", (ev) => {
      state.filter.search = ev.target.value;
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
    wireAuth();
    wire();

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
