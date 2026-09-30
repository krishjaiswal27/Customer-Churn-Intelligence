import { createFindings } from "./charts.js";
import { initChat } from "./chat.js";

const DATA_URL = "data/site_data.json";
const PAGE_SIZE = 25;
const desktop = window.matchMedia("(min-width: 1024px)");

const int = (v) => v.toLocaleString("en-US");
const pct = (v) => `${v.toFixed(1)}%`;
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ---------- nav ---------- */
function initNav() {
  const header = document.querySelector(".nav");
  const toggle = header.querySelector(".nav__toggle");
  const links = header.querySelectorAll(".nav__links a");

  const setOpen = (open) => {
    header.classList.toggle("nav--open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "close" : "menu";
  };

  toggle.addEventListener("click", () => setOpen(!header.classList.contains("nav--open")));
  links.forEach((a) => a.addEventListener("click", () => setOpen(false)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && header.classList.contains("nav--open")) {
      setOpen(false);
      toggle.focus();
    }
  });
  desktop.addEventListener("change", () => setOpen(false));

  // Mark the section currently in view. Sections without a nav link (the hero,
  // "under the hood", "tech stack"...) clear the mark instead of leaving a stale one.
  const byId = new Map([...links].map((a) => [a.getAttribute("href").slice(1), a]));
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((l) => l.removeAttribute("aria-current"));
        byId.get(entry.target.id)?.setAttribute("aria-current", "true");
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  document.querySelectorAll("main > section").forEach((el) => io.observe(el));
}

/* ---------- tabs (WAI-ARIA tabs pattern, automatic activation) ---------- */
const tabSelectors = new Map();

function initTabs(container, onChange) {
  const tabs = [...container.querySelectorAll('[role="tab"]')];
  const select = (tab, focus = false) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      if (!t.dataset.seg) {
        const panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      }
    });
    if (tab.dataset.seg) {
      document.getElementById(tab.getAttribute("aria-controls"))?.setAttribute("aria-labelledby", tab.id);
    }
    if (focus) tab.focus();
    onChange?.(tab);
  };

  tabs.forEach((tab, i) => {
    tabSelectors.set(tab.id, () => select(tab));
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (e) => {
      let next = null;
      if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
      else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === "Home") next = tabs[0];
      else if (e.key === "End") next = tabs[tabs.length - 1];
      if (next) {
        e.preventDefault();
        select(next, true);
      }
    });
  });
}

// Pipeline rows that point at a specific tab in "under the hood".
function initDeepLinks() {
  document.querySelectorAll("[data-open-tab]").forEach((a) => {
    a.addEventListener("click", () => tabSelectors.get(a.dataset.openTab)?.());
  });
}

/* ---------- code highlighting (keywords, strings, comments) ---------- */
const KEYWORDS = {
  sql: "SELECT|FROM|WHERE|WITH|AS|CREATE|TABLE|CASE|WHEN|THEN|ELSE|END|OVER|PARTITION|BY|ORDER|DESC|ASC|RANK|AVG|ROUND|NULLIF|TRIM|NUMERIC|LIMIT|GROUP|COUNT|SUM",
  python: "withColumn|filter|when|otherwise|Window|partitionBy|over|avg|expr|col|spark_round|isNotNull",
};
const COMMENT = { sql: "--[^\\n]*", python: "#[^\\n]*" };
const STRING = { sql: "'[^']*'", python: '"[^"]*"' };

function highlight() {
  document.querySelectorAll("code[data-lang]").forEach((code) => {
    const lang = code.dataset.lang;
    const re = new RegExp(`(${COMMENT[lang]})|(${STRING[lang]})|\\b(${KEYWORDS[lang]})\\b`, lang === "sql" ? "g" : "g");
    const src = code.textContent;
    let out = "";
    let last = 0;
    for (const m of src.matchAll(re)) {
      out += escapeHtml(src.slice(last, m.index));
      const cls = m[1] ? "tok-c" : m[2] ? "tok-s" : "tok-k";
      out += `<span class="${cls}">${escapeHtml(m[0])}</span>`;
      last = m.index + m[0].length;
    }
    code.innerHTML = out + escapeHtml(src.slice(last));
  });
}

/* ---------- data binding: every number on the page comes from site_data.json ---------- */
function bindNumbers(data) {
  const segIndex = {};
  Object.entries(data.segments).forEach(([k, s]) => {
    segIndex[k] = Object.fromEntries(s.rows.map((r) => [r.key, r]));
  });
  const k = data.kpis;
  const kpi = {
    customers: () => int(k.customers),
    churned: () => int(k.churned),
    churn_rate: () => pct(k.churn_rate),
    mrr_lost: () => `$${Math.round(k.mrr_lost / 1000)}K`,
    high_risk: () => int(k.high_risk),
    m2m_avg_monthly_charge: () => `$${k.m2m_avg_monthly_charge.toFixed(2)}`,
  };

  document.querySelectorAll("[data-bind]").forEach((el) => {
    const [type, a, b, field] = el.dataset.bind.split(":");
    let text = null;
    if (type === "kpi" && kpi[a]) text = kpi[a]();
    else if (type === "risk") text = int(data.risk_counts[a]);
    else if (type === "seg") {
      const row = segIndex[a]?.[b];
      if (row) text = field === "rate" ? pct(row.rate) : int(row[field]);
    }
    if (text === null) {
      console.warn(`No data for ${el.dataset.bind}`);
      return;
    }
    el.textContent = text;
  });

  // Hero canvases read their counts from these attributes.
  const contract = segIndex.contract;
  const names = ["Month-to-month", "One year", "Two year"];
  document.querySelectorAll(".field").forEach((fig, i) => {
    const row = contract[names[i]];
    if (!row) return;
    fig.dataset.churned = row.churned;
    fig.dataset.customers = row.customers;
    fig.querySelector("canvas").setAttribute(
      "aria-label",
      `${names[i]} contracts: ${int(row.churned)} of ${int(row.customers)} customers left, ${pct(row.rate)}. Each mark is a customer; red marks left.`
    );
  });
}

function renderProfile(data) {
  const p = data.top_profile;
  const el = document.getElementById("profile");
  if (!p || !el) return;
  const who = p.contract_share === 1 ? "all" : `${Math.round(p.contract_share * 100)}%`;
  const tenure = p.tenure_median <= 1 ? "at least half of them in their first month" : `with a median tenure of ${p.tenure_median} months`;
  el.textContent =
    `The ${p.n} highest-risk customers are ${who} on ${p.contract_mode.toLowerCase()} contracts, ${tenure}. ` +
    `Most pay $${Math.round(p.charge_p10)} to $${Math.round(p.charge_p90)} a month, and their predicted churn probabilities run from ${p.prob_min.toFixed(2)} to ${p.prob_max.toFixed(2)}.`;
}

/* ---------- spine: every customer, ordered by predicted risk ---------- */
function initSpine(data) {
  const spine = document.querySelector(".spine");
  const stayed = spine.querySelector(".spine__layer--stayed");
  const left = spine.querySelector(".spine__layer--left");
  const cap = spine.querySelector(".spine__cap");
  const main = document.getElementById("main");
  const first = document.getElementById("question");
  const last = document.getElementById("limits");
  const outcomes = data.customers.rows.map((r) => r[5]); // already sorted by probability, highest first
  let lastKey = "";

  const layout = () => {
    if (!desktop.matches) return;
    // Revealed and positioned in the same task, so it never paints at the top of the page.
    spine.classList.add("is-ready");
    const top = first.offsetTop + 24;
    const height = last.offsetTop + last.offsetHeight - top;
    const capH = cap.offsetHeight + 8;
    const bodyH = Math.max(200, height - capH);
    const rowsWanted = Math.floor(bodyH / 10);
    const cols = Math.max(6, Math.ceil(outcomes.length / rowsWanted));
    const lines = Math.ceil(outcomes.length / cols);
    const key = `${cols}:${Math.round(bodyH)}`;
    spine.style.top = `${top}px`;
    spine.style.setProperty("--spine-lh", `${(bodyH / lines).toFixed(3)}px`);
    if (key === lastKey) return;
    lastKey = key;

    let s = "";
    let l = "";
    outcomes.forEach((o, i) => {
      s += o ? " " : "·";
      l += o ? "×" : " ";
      if ((i + 1) % cols === 0) {
        s += "\n";
        l += "\n";
      }
    });
    stayed.textContent = s;
    left.textContent = l;
  };

  layout();
  const relayout = debounce(layout, 120);
  new ResizeObserver(relayout).observe(main);
  desktop.addEventListener("change", layout);
  if (document.fonts) document.fonts.ready.then(layout);
}

/* ---------- findings ---------- */
function initFindings(data) {
  const container = document.querySelector("#findings [data-tabs]");
  const tableWrap = document.getElementById("seg-table");
  const toggle = container.querySelector(".table-toggle");

  const setTable = (open) => {
    tableWrap.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "hide data table" : "view data table";
  };
  toggle.addEventListener("click", () => setTable(tableWrap.hidden));

  const findings = createFindings(data, {
    canvas: document.getElementById("seg-chart"),
    insight: document.getElementById("seg-insight"),
    tbody: document.getElementById("seg-tbody"),
    caption: document.getElementById("seg-table-cap"),
    fallback: () => {
      document.querySelector("#findings .chart-box").hidden = true;
      document.getElementById("seg-note").textContent = "The chart library did not load, so the data is shown as a table.";
      setTable(true);
    },
  });

  initTabs(container, (tab) => findings.show(tab.dataset.seg));
}

/* ---------- risk explorer ---------- */
function initExplorer(data) {
  const rows = data.customers.rows; // [id, tenure, contract, monthly, prob, churn, risk]
  const contracts = data.customers.contracts;
  const riskName = data.customers.risk;
  const riskOrder = { H: 3, M: 2, L: 1 };
  const body = document.getElementById("ex-body");
  const status = document.getElementById("ex-status");
  const prev = document.getElementById("ex-prev");
  const next = document.getElementById("ex-next");
  const search = document.getElementById("ex-search");
  const headers = [...document.querySelectorAll(".ex-table th")];

  const col = { id: 0, tenure: 1, contract: 2, monthly: 3, prob: 4, risk: 6 };
  const firstDir = { id: "asc", contract: "asc", tenure: "desc", monthly: "desc", prob: "desc", risk: "desc" };
  const state = { risk: "all", q: "", sort: "prob", dir: "desc", page: 0 };
  let view = rows;

  const compare = (a, b) => {
    const i = col[state.sort];
    let x = a[i];
    let y = b[i];
    if (state.sort === "risk") {
      x = riskOrder[x];
      y = riskOrder[y];
    }
    let d = typeof x === "string" ? x.localeCompare(y) : x - y;
    if (d === 0) d = b[4] - a[4] || a[0].localeCompare(b[0]);
    else if (state.dir === "desc") d = -d;
    return d;
  };

  const refresh = () => {
    const q = state.q.trim().toUpperCase();
    view = rows.filter((r) => (state.risk === "all" || r[6] === state.risk) && (!q || r[0].includes(q)));
    view.sort(compare);
    state.page = 0;
    render();
  };

  const render = () => {
    const pages = Math.max(1, Math.ceil(view.length / PAGE_SIZE));
    state.page = Math.min(state.page, pages - 1);
    const start = state.page * PAGE_SIZE;
    const slice = view.slice(start, start + PAGE_SIZE);

    if (!slice.length) {
      body.innerHTML = '<tr><td colspan="6" class="ex-empty">No customers match. Clear the search or choose another risk level.</td></tr>';
      status.textContent = "0 customers";
    } else {
      body.innerHTML = slice
        .map((r) => {
          const p = r[4];
          // Truncate, not round, so a value just under a threshold never displays as the threshold.
          const shown = (Math.floor(p * 1000) / 1000).toFixed(3);
          // Probability and risk sit next to the ID so they stay on screen on phones.
          return `<tr class="risk-${r[6]}">
            <td>${escapeHtml(r[0])}</td>
            <td><span class="pbar"><span class="pbar__v">${shown}</span><span class="pbar__track" aria-hidden="true"><span class="pbar__fill" style="width:${(p * 100).toFixed(1)}%"></span></span></span></td>
            <td class="risk-label">${riskName[r[6]].toLowerCase()}</td>
            <td>${contracts[r[2]].toLowerCase()}</td>
            <td class="r">${r[1]}</td>
            <td class="r">$${r[3].toFixed(2)}</td>
          </tr>`;
        })
        .join("");
      status.textContent = `${int(start + 1)}–${int(start + slice.length)} of ${int(view.length)}, page ${int(state.page + 1)} of ${int(pages)}`;
    }
    prev.disabled = state.page === 0;
    next.disabled = state.page >= pages - 1;
  };

  headers.forEach((th) => {
    const btn = th.querySelector("button");
    btn.addEventListener("click", () => {
      const key = btn.dataset.sort;
      state.dir = state.sort === key ? (state.dir === "asc" ? "desc" : "asc") : firstDir[key];
      state.sort = key;
      headers.forEach((h) => h.setAttribute("aria-sort", "none"));
      th.setAttribute("aria-sort", state.dir === "asc" ? "ascending" : "descending");
      refresh();
    });
  });

  document.querySelectorAll('input[name="ex-risk"]').forEach((input) =>
    input.addEventListener("change", () => {
      state.risk = input.value;
      refresh();
    })
  );

  search.addEventListener(
    "input",
    debounce(() => {
      state.q = search.value;
      refresh();
    }, 120)
  );

  // After paging, bring the top of the table back into view if it scrolled away.
  const tableTop = document.querySelector(".table-scroll");
  const toTop = () => {
    if (tableTop.getBoundingClientRect().top < 0) tableTop.scrollIntoView({ block: "start" });
  };

  prev.addEventListener("click", () => {
    state.page -= 1;
    render();
    toTop();
  });
  next.addEventListener("click", () => {
    state.page += 1;
    render();
    toTop();
  });

  refresh();
}

/* ---------- lightbox ---------- */
function initLightbox() {
  const dialog = document.getElementById("lightbox");
  const img = document.getElementById("lightbox-img");
  if (!dialog || typeof dialog.showModal !== "function") return;
  let opener = null;

  document.querySelectorAll("[data-lightbox]").forEach((btn) => {
    btn.addEventListener("click", () => {
      opener = btn;
      img.src = btn.dataset.lightbox;
      img.alt = btn.dataset.alt || "";
      dialog.showModal();
    });
  });

  // Clicking the dark backdrop closes it; Esc is handled by <dialog>.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    img.removeAttribute("src");
    opener?.focus();
  });
}

/* ---------- start ---------- */
initNav();
document.querySelectorAll("[data-tabs]").forEach((c) => {
  if (!c.closest("#findings")) initTabs(c);
});
initDeepLinks();
highlight();
initLightbox();
initChat();

fetch(DATA_URL)
  .then((res) => {
    if (!res.ok) throw new Error(`${DATA_URL} returned ${res.status}`);
    return res.json();
  })
  .then((data) => {
    bindNumbers(data);
    renderProfile(data);
    initFindings(data);
    initExplorer(data);
    initSpine(data);
  })
  .catch((err) => {
    console.error(err);
    const body = document.getElementById("ex-body");
    if (body) {
      body.innerHTML =
        '<tr><td colspan="6" class="ex-empty">The customer data could not load. Serve the site over HTTP (for example <code>python -m http.server</code> inside docs/) and reload.</td></tr>';
    }
  });
