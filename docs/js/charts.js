// Findings chart: churn rate by segment, one Chart.js bar chart that swaps
// data when the segment tab changes. Ink bars; the highest rate is red.

const INK = "#000000";
const CHURN = "#c8261b";
const GRAPHITE = "#5c5c5c";
const GRID = "#e6e6e6";
const FONT = '"Host Grotesk", "Helvetica Neue", Arial, sans-serif';

const LABELS = {
  contract: { "Month-to-month": "month-to-month", "One year": "one year", "Two year": "two year" },
  tenure: { "0-12m": "up to 12 months", "12-24m": "13–24 months", "24m+": "over 24 months" },
  payment: {
    "Electronic check": "electronic check",
    "Mailed check": "mailed check",
    "Bank transfer (automatic)": "bank transfer (automatic)",
    "Credit card (automatic)": "credit card (automatic)",
  },
  spend: { Low: "low, under $35", Medium: "medium, $35–65", High: "high, over $65" },
  internet: { "Fiber optic": "fiber optic", DSL: "DSL", No: "no internet" },
};

const pct = (v) => `${v.toFixed(1)}%`;
const int = (v) => v.toLocaleString("en-US");

function insightFor(key, rows) {
  const by = Object.fromEntries(rows.map((r) => [r.key, r.rate]));
  switch (key) {
    case "contract":
      return `Month-to-month customers churn at ${pct(by["Month-to-month"])}, about ${Math.round(
        by["Month-to-month"] / by["Two year"]
      )} times the two-year rate of ${pct(by["Two year"])}.`;
    case "tenure":
      return `Almost half of customers in their first year leave (${pct(by["0-12m"])}). After two years the rate falls to ${pct(by["24m+"])}.`;
    case "payment":
      return `Electronic check customers churn at ${pct(by["Electronic check"])}, about ${Math.round(
        by["Electronic check"] / by["Credit card (automatic)"]
      )} times the rate for automatic card payments (${pct(by["Credit card (automatic)"])}).`;
    case "spend":
      return `High spenders churn most: ${pct(by.High)} against ${pct(by.Low)} for low spenders. The losses fall on the most valuable customers.`;
    case "internet":
      return `Fiber optic customers churn at ${pct(by["Fiber optic"])}, more than twice the DSL rate of ${pct(by.DSL)}. Customers without internet service churn at ${pct(by.No)}.`;
    default:
      return "";
  }
}

// Prints each bar's value at its end, so reading the chart never depends on hover.
const valueLabels = {
  id: "valueLabels",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    const data = chart.data.datasets[0].data;
    ctx.save();
    ctx.font = `500 13px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.textBaseline = "middle";
    meta.data.forEach((bar, i) => {
      ctx.fillText(pct(data[i]), bar.x + 8, bar.y);
    });
    ctx.restore();
  },
};

export function createFindings(data, els) {
  const { canvas, insight, tbody, caption } = els;
  const segments = data.segments;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let chart = null;
  let current = "contract";

  function rowsFor(key) {
    return segments[key].rows;
  }

  function config(key) {
    const rows = rowsFor(key);
    const rates = rows.map((r) => r.rate);
    const max = Math.max(...rates);
    const axisMax = Math.max(20, Math.ceil((max + 9) / 10) * 10);
    return {
      labels: rows.map((r) => LABELS[key][r.key] || r.key),
      rates,
      colors: rates.map((r) => (r === max ? CHURN : INK)),
      axisMax,
      rows,
    };
  }

  function describe(key) {
    const rows = rowsFor(key);
    const parts = rows.map((r) => `${LABELS[key][r.key] || r.key} ${pct(r.rate)}`);
    canvas.setAttribute(
      "aria-label",
      `Bar chart of churn rate by ${segments[key].label.toLowerCase()}: ${parts.join(", ")}.`
    );
    insight.textContent = insightFor(key, rows);
    caption.textContent = `Churn by ${segments[key].label.toLowerCase()}`;
    tbody.innerHTML = rows
      .map(
        (r) =>
          `<tr><th scope="row">${LABELS[key][r.key] || r.key}</th><td class="r">${int(r.customers)}</td><td class="r">${int(
            r.churned
          )}</td><td class="r">${pct(r.rate)}</td></tr>`
      )
      .join("");
  }

  function build() {
    const Chart = window.Chart;
    if (!Chart) return false;
    const c = config(current);
    const thin = window.innerWidth < 768;
    chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: c.labels,
        datasets: [{ data: c.rates, backgroundColor: c.colors, hoverBackgroundColor: c.colors, barThickness: thin ? 22 : 28, borderRadius: 0 }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: reduce ? false : { duration: 700, easing: "easeOutCubic" },
        layout: { padding: { right: 8 } },
        scales: {
          x: {
            min: 0,
            max: c.axisMax,
            border: { display: false },
            grid: { color: GRID, drawTicks: false },
            ticks: { color: GRAPHITE, font: { family: FONT, size: 13 }, padding: 8, callback: (v) => `${v}%`, stepSize: thin ? 20 : 10, maxRotation: 0 },
          },
          y: {
            border: { color: INK },
            grid: { display: false },
            ticks: { color: INK, font: { family: FONT, size: thin ? 13 : 15 }, padding: 10 },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: INK,
            titleColor: "#ffffff",
            bodyColor: "#ffffff",
            titleFont: { family: FONT, size: 14, weight: "500" },
            bodyFont: { family: FONT, size: 13 },
            padding: 12,
            cornerRadius: 0,
            displayColors: false,
            callbacks: {
              label: (ctx) => {
                const r = rowsFor(current)[ctx.dataIndex];
                return [`churn rate ${pct(r.rate)}`, `${int(r.churned)} churned of ${int(r.customers)} customers`];
              },
            },
          },
        },
      },
      plugins: [valueLabels],
    });
    return true;
  }

  function show(key) {
    current = key;
    describe(key);
    if (!chart) return;
    const c = config(key);
    chart.data.labels = c.labels;
    chart.data.datasets[0].data = c.rates;
    chart.data.datasets[0].backgroundColor = c.colors;
    chart.data.datasets[0].hoverBackgroundColor = c.colors;
    chart.options.scales.x.max = c.axisMax;
    chart.update();
  }

  describe(current);

  // Draw the chart when the section first comes into view, so its entrance is seen.
  const start = () => {
    if (chart) return;
    if (!build()) {
      // Chart.js did not load: show the data table instead of an empty box.
      els.fallback();
      return;
    }
    if (document.fonts) document.fonts.ready.then(() => chart && chart.update("none"));
  };

  if ("IntersectionObserver" in window && !reduce) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          start();
        }
      },
      { rootMargin: "0px 0px -20% 0px" }
    );
    io.observe(canvas);
  } else {
    start();
  }

  return { show };
}
