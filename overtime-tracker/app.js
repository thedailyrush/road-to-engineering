(() => {
  "use strict";

  const STORAGE_KEY = "overtime-tracker-v1";

  const DEFAULT_CATEGORIES = [
    { name: "Overtime",                  type: "hourly", rate: 350,  defaultHours: 4 },
    { name: "Overtime (Late)",           type: "hourly", rate: 350,  defaultHours: 2 },
    { name: "Pre-time",                  type: "hourly", rate: 350,  defaultHours: 2 },
    { name: "Bellevue Extra Att.",       type: "hourly", rate: 350,  defaultHours: 4 },
    { name: "Weekend Back Up 1",         type: "hourly", rate: 350,  defaultHours: 8 },
    { name: "Weekend Back Up 2",         type: "hourly", rate: 350,  defaultHours: 8 },
    { name: "Weekend Flat Pay",          type: "flat",   rate: 400,  defaultHours: 0 },
    { name: "Tisch M-Th Overnight",      type: "flat",   rate: 300,  defaultHours: 0 },
    { name: "Tisch Friday Overnight",    type: "flat",   rate: 1300, defaultHours: 0 },
    { name: "Bellevue M-Th Overnight",   type: "flat",   rate: 2400, defaultHours: 0 },
    { name: "Bellevue Friday Overnight", type: "flat",   rate: 3600, defaultHours: 0 },
    { name: "Saturday Call",             type: "flat",   rate: 5200, defaultHours: 0 },
    { name: "Sunday Call",               type: "flat",   rate: 3600, defaultHours: 0 },
    { name: "Bellevue Long Call",        type: "flat",   rate: 1050, defaultHours: 0 },
    { name: "Holiday",                   type: "flat",   rate: 3700, defaultHours: 0 },
    { name: "Holiday Saturday",          type: "flat",   rate: 5200, defaultHours: 0 },
  ];

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  /** @typedef {{id:string,name:string,type:'hourly'|'flat',rate:number,defaultHours:number}} Category */
  /** @typedef {{id:string,date:string,categoryId:string,hours:number,status:'pending'|'submitted'|'deposited',note:string}} Entry */

  const state = {
    /** @type {Category[]} */ categories: [],
    /** @type {Entry[]}    */ entries: [],
    filter: { search: "", category: "", status: "" },
    editingCategoryId: null,
  };

  // ----- persistence ---------------------------------------------------------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return seedDefaults();
      const parsed = JSON.parse(raw);
      state.categories = parsed.categories || [];
      state.entries = parsed.entries || [];
      if (state.categories.length === 0) seedDefaults();
    } catch (e) {
      console.warn("Failed to load state, seeding defaults", e);
      seedDefaults();
    }
  }

  function seedDefaults() {
    state.categories = DEFAULT_CATEGORIES.map((c) => ({ id: uid(), ...c }));
    state.entries = [];
    save();
  }

  function save() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ categories: state.categories, entries: state.entries })
    );
  }

  // ----- helpers -------------------------------------------------------------
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

  // ----- rendering -----------------------------------------------------------
  const $ = (id) => document.getElementById(id);

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
          <input type="number" data-field="defaultHours" min="0" step="0.25"
                 value="${cat.defaultHours || ""}"
                 ${cat.type === "flat" ? "disabled" : ""} />
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
      tr.innerHTML = `
        <td>${formatDate(e.date)}</td>
        <td>
          ${cat ? escapeHtml(cat.name) : "<em>(deleted)</em>"}
          ${cat ? `<span class="pill ${cat.type}">${cat.type}</span>` : ""}
        </td>
        <td class="num">${cat && cat.type === "hourly" ? fmtHours(hours) : "—"}</td>
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

  // ----- formatting helpers --------------------------------------------------
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

  // ----- entry form ---------------------------------------------------------
  function syncHoursField() {
    const sel = $("entryCategory");
    const cat = categoryById(sel.value);
    const field = $("hoursField");
    const hoursInput = $("entryHours");
    if (!cat) return;
    if (cat.type === "flat") {
      field.style.display = "none";
      hoursInput.value = "";
      hoursInput.required = false;
    } else {
      field.style.display = "";
      hoursInput.required = true;
      if (!hoursInput.value && cat.defaultHours) {
        hoursInput.value = cat.defaultHours;
      }
    }
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

  // ----- event wiring -------------------------------------------------------
  function wire() {
    // entry form
    $("entryDate").value = new Date().toISOString().slice(0, 10);
    $("entryCategory").addEventListener("change", () => {
      syncHoursField();
      updatePreview();
    });
    $("entryHours").addEventListener("input", updatePreview);

    $("entryForm").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const cat = categoryById($("entryCategory").value);
      if (!cat) return;
      const hours = cat.type === "hourly" ? Number($("entryHours").value) || 0 : 0;
      if (cat.type === "hourly" && hours <= 0) {
        $("entryHours").focus();
        return;
      }
      const entry = {
        id: uid(),
        date: $("entryDate").value || new Date().toISOString().slice(0, 10),
        categoryId: cat.id,
        hours,
        status: $("entryStatus").value,
        note: $("entryNote").value.trim(),
      };
      state.entries.push(entry);
      save();
      $("entryNote").value = "";
      $("entryHours").value = cat.type === "hourly" ? cat.defaultHours || "" : "";
      renderEntries();
      renderSummary();
      updatePreview();
    });

    // category table interactions (event delegation)
    $("categoriesBody").addEventListener("click", (ev) => {
      const row = ev.target.closest("tr[data-id]");
      if (!row) return;
      const id = row.dataset.id;
      const cat = categoryById(id);
      if (!cat) return;

      const toggle = ev.target.closest(".toggle");
      if (toggle) {
        cat.type = cat.type === "hourly" ? "flat" : "hourly";
        save();
        renderCategories();
        renderCategoryDropdowns();
        renderEntries();
        renderSummary();
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
        save();
        renderAll();
      }
    });

    $("categoriesBody").addEventListener("keydown", (ev) => {
      const toggle = ev.target.closest(".toggle");
      if (toggle && (ev.key === "Enter" || ev.key === " ")) {
        ev.preventDefault();
        toggle.click();
      }
    });

    $("categoriesBody").addEventListener("change", (ev) => {
      const row = ev.target.closest("tr[data-id]");
      if (!row) return;
      const cat = categoryById(row.dataset.id);
      if (!cat) return;
      const field = ev.target.dataset.field;
      if (!field) return;
      if (field === "rate" || field === "defaultHours") {
        cat[field] = Number(ev.target.value) || 0;
      } else {
        cat[field] = ev.target.value;
      }
      save();
      renderCategoryDropdowns();
      renderEntries();
      renderSummary();
    });

    // entries table
    $("entriesBody").addEventListener("click", (ev) => {
      const row = ev.target.closest("tr[data-id]");
      if (!row) return;
      const entry = state.entries.find((e) => e.id === row.dataset.id);
      if (!entry) return;
      const action = ev.target.closest("[data-action]")?.dataset.action;
      if (action === "delete-entry") {
        state.entries = state.entries.filter((e) => e.id !== entry.id);
        save();
        renderEntries();
        renderSummary();
      } else if (action === "cycle-status") {
        const order = ["pending", "submitted", "deposited"];
        entry.status = order[(order.indexOf(entry.status) + 1) % order.length];
        save();
        renderEntries();
        renderSummary();
      }
    });

    // filters
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

    // top-bar actions
    $("addCategoryBtn").addEventListener("click", () => openCategoryDialog());
    $("resetBtn").addEventListener("click", () => {
      if (!confirm("Wipe all categories and entries and restore defaults?")) return;
      seedDefaults();
      renderAll();
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
        state.categories = data.categories;
        state.entries = data.entries;
        save();
        renderAll();
      } catch (err) {
        alert("Could not import file: " + err.message);
      } finally {
        ev.target.value = "";
      }
    });

    // category dialog
    const dialog = $("categoryDialog");
    $("catCancel").addEventListener("click", () => dialog.close());
    document.querySelectorAll('input[name="catType"]').forEach((r) =>
      r.addEventListener("change", syncCatTypeUI)
    );
    $("categoryForm").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const name = $("catName").value.trim();
      if (!name) return;
      const type = document.querySelector('input[name="catType"]:checked').value;
      const rate = Number($("catRate").value) || 0;
      const defaultHours = Number($("catDefaultHours").value) || 0;
      if (state.editingCategoryId) {
        const cat = categoryById(state.editingCategoryId);
        if (cat) Object.assign(cat, { name, type, rate, defaultHours });
      } else {
        state.categories.push({ id: uid(), name, type, rate, defaultHours });
      }
      state.editingCategoryId = null;
      save();
      dialog.close();
      renderAll();
    });
  }

  function syncCatTypeUI() {
    const isFlat = document.querySelector('input[name="catType"]:checked').value === "flat";
    $("catRateLabel").textContent = isFlat ? "Flat amount per shift ($)" : "Hourly Rate ($)";
    $("catDefaultHoursField").style.display = isFlat ? "none" : "";
  }

  function openCategoryDialog(cat) {
    state.editingCategoryId = cat ? cat.id : null;
    $("categoryDialogTitle").textContent = cat ? "Edit Category" : "Add Category";
    $("catName").value = cat?.name || "";
    document.querySelector(`input[name="catType"][value="${cat?.type || "hourly"}"]`).checked = true;
    $("catRate").value = cat?.rate ?? "";
    $("catDefaultHours").value = cat?.defaultHours ?? "";
    syncCatTypeUI();
    $("categoryDialog").showModal();
    $("catName").focus();
  }

  // ----- init ---------------------------------------------------------------
  load();
  wire();
  renderAll();
})();
