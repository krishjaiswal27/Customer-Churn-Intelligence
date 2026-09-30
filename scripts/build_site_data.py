"""Build docs/data/site_data.json from data/telco_with_predictions.csv.

Run from the repository root:
    python scripts/build_site_data.py

Prints a validation report that compares every computed value with the
reference values in BUILD_BRIEF.md section 6 and flags differences larger
than 0.3 percentage points. Computed values are always what gets written;
reference values are never substituted.
"""

from __future__ import annotations

import json
import math
import sys
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "telco_with_predictions.csv"
OUT = ROOT / "docs" / "data" / "site_data.json"

EXPECTED_ROWS = 7032
TOLERANCE_PP = 0.3  # percentage points

# Risk label thresholds, matching the DAX measure in the Power BI report.
HIGH, MEDIUM = 0.70, 0.40

# Display order for each segment. Payment method is ordered by churn rate.
SEGMENTS = {
    "contract": ("Contract", "Contract", ["Month-to-month", "One year", "Two year"]),
    "tenure": ("Tenure", "tenure_bucket", ["0-12m", "12-24m", "24m+"]),
    "payment": ("Payment method", "PaymentMethod", None),
    "spend": ("Spend tier", "spend_tier", ["Low", "Medium", "High"]),
    "internet": ("Internet service", "InternetService", ["Fiber optic", "DSL", "No"]),
}

# Reference values from BUILD_BRIEF.md section 6: (rate %, churned, customers).
# None means "not given in the brief".
REFERENCE = {
    "contract": {
        "Month-to-month": (42.7, 1655, 3875),
        "One year": (11.3, 166, 1473),
        "Two year": (2.8, 48, 1695),
    },
    "tenure": {
        "0-12m": (47.7, 1037, 2175),
        "12-24m": (28.7, 294, 1024),
        "24m+": (14.0, 538, 3833),
    },
    "payment": {
        "Electronic check": (45.3, 1071, 2365),
        "Mailed check": (19.1, 308, 1612),
        "Bank transfer (automatic)": (16.7, 258, 1544),
        "Credit card (automatic)": (15.2, 232, 1522),
    },
    "spend": {
        "High": (34.7, None, None),
        "Medium": (23.2, None, None),
        "Low": (10.9, None, None),
    },
    # The brief gives these only as rough expectations ("~42%"), so they are
    # reported for information and flagged only if more than 2 points off.
    "internet": {
        "Fiber optic": (42.0, None, None),
        "DSL": (19.0, None, None),
        "No": (7.0, None, None),
    },
}
APPROXIMATE = {"internet": 2.0}

# Model results come from notebooks/ml_shap.ipynb (held-out 20% test set).
MODEL = {
    "algorithm": "XGBoost",
    "params": {
        "n_estimators": 200,
        "max_depth": 4,
        "learning_rate": 0.1,
        "scale_pos_weight": round(5163 / 1869, 2),
    },
    "split": "80/20 stratified",
    "test_customers": 1407,
    "test_churners": 374,
    "roc_auc": 0.824,
    "accuracy": 0.73,
    "recall": 0.78,
    "precision": 0.50,
    "f1": 0.61,
    "confusion": {"tn": 739, "fp": 294, "fn": 83, "tp": 291},
    "shap_top": [
        "Contract", "tenure", "MonthlyCharges", "TotalCharges", "OnlineSecurity",
        "TechSupport", "PaymentMethod", "MultipleLines", "InternetService", "StreamingTV",
    ],
}

CONTRACT_CODES = ["Month-to-month", "One year", "Two year"]
RISK_CODES = {"High": "H", "Medium": "M", "Low": "L"}

problems: list[str] = []


def risk_label(p: float) -> str:
    if p > HIGH:
        return "High"
    if p >= MEDIUM:
        return "Medium"
    return "Low"


def check_pp(label: str, computed: float, expected: float, tolerance: float = TOLERANCE_PP) -> None:
    diff = computed - expected
    flag = abs(diff) > tolerance
    if flag:
        problems.append(f"{label}: computed {computed:.2f} vs reference {expected:.2f}")
    print(f"  {'FLAG' if flag else 'ok  '}  {label:<42} computed {computed:7.2f}  reference {expected:7.2f}  diff {diff:+.2f}")


def check_count(label: str, computed: int, expected: int | None, slack: int = 0) -> None:
    """Compare counts. `slack` allows for reference counts taken before the
    11 blank-TotalCharges rows were dropped (7,043 -> 7,032)."""
    if expected is None:
        return
    diff = computed - expected
    if diff == 0:
        status = "ok  "
    elif abs(diff) <= slack:
        status = "near"
    else:
        status = "DIFF"
        problems.append(f"{label}: computed {computed} vs reference {expected}")
    print(f"  {status}  {label:<42} computed {computed:7d}  reference {expected:7d}  diff {diff:+d}")


def main() -> int:
    df = pd.read_csv(SRC)
    print(f"Read {SRC.relative_to(ROOT)}: {len(df):,} rows, {df.shape[1]} columns")

    if len(df) != EXPECTED_ROWS:
        problems.append(f"row count is {len(df)}, expected {EXPECTED_ROWS}")
    if df["customerID"].duplicated().any():
        problems.append("duplicate customerID values")
    if df["churn_probability"].isna().any():
        problems.append("missing churn_probability values")

    # ---- headline KPIs -------------------------------------------------
    customers = int(len(df))
    churned = int(df["churn_value"].sum())
    churn_rate = churned / customers * 100
    mrr_lost = float(df.loc[df["churn_value"] == 1, "MonthlyCharges"].sum())
    high_risk = int((df["churn_probability"] > HIGH).sum())
    avg_prob = float(df["churn_probability"].mean())
    m2m_avg_charge = float(df.loc[df["Contract"] == "Month-to-month", "MonthlyCharges"].mean())

    kpis = {
        "customers": customers,
        "churned": churned,
        "churn_rate": round(churn_rate, 2),
        "mrr_lost": round(mrr_lost, 2),
        "high_risk": high_risk,
        "avg_probability": round(avg_prob, 3),
        "m2m_avg_monthly_charge": round(m2m_avg_charge, 2),
    }

    # ---- segments ------------------------------------------------------
    segments = {}
    for key, (label, column, order) in SEGMENTS.items():
        g = df.groupby(column)["churn_value"].agg(customers="count", churned="sum")
        g["rate"] = g["churned"] / g["customers"] * 100
        if order is None:
            g = g.sort_values("rate", ascending=False)
        else:
            missing = set(order) - set(g.index)
            extra = set(g.index) - set(order)
            if missing or extra:
                problems.append(f"{key}: unexpected categories (missing {missing}, extra {extra})")
            g = g.reindex([o for o in order if o in g.index] + sorted(extra))
        segments[key] = {
            "label": label,
            "column": column,
            "rows": [
                {"key": str(k), "customers": int(r.customers), "churned": int(r.churned), "rate": round(float(r.rate), 3)}
                for k, r in g.iterrows()
            ],
        }

    # ---- customers for the explorer, the hero field and the spine -------
    df["risk_level"] = df["churn_probability"].map(risk_label)
    ranked = df.sort_values(["churn_probability", "customerID"], ascending=[False, True])
    unknown_contracts = set(ranked["Contract"]) - set(CONTRACT_CODES)
    if unknown_contracts:
        problems.append(f"unknown contract values {unknown_contracts}")
    rows = [
        [
            r.customerID,
            int(r.tenure),
            CONTRACT_CODES.index(r.Contract),
            round(float(r.MonthlyCharges), 2),
            # Truncated (not rounded) to 4 decimals, and the explorer truncates to 3,
            # so a value just under a threshold (0.39998 is Low) never shows as 0.400.
            math.floor(float(r.churn_probability) * 10_000) / 10_000,
            int(r.churn_value),
            RISK_CODES[r.risk_level],
        ]
        for r in ranked.itertuples(index=False)
    ]
    risk_counts = {lvl: int((df["risk_level"] == lvl).sum()) for lvl in ("High", "Medium", "Low")}

    # Profile of the 50 highest-risk customers, to check the brief's description.
    top = ranked.head(50)
    profile = {
        "n": int(len(top)),
        "contract_mode": str(top["Contract"].mode().iat[0]),
        "contract_share": round(float((top["Contract"] == top["Contract"].mode().iat[0]).mean()), 3),
        "tenure_min": int(top["tenure"].min()),
        "tenure_median": float(top["tenure"].median()),
        "tenure_p90": float(top["tenure"].quantile(0.9)),
        "charge_p10": round(float(top["MonthlyCharges"].quantile(0.1)), 2),
        "charge_p90": round(float(top["MonthlyCharges"].quantile(0.9)), 2),
        "prob_min": round(float(top["churn_probability"].min()), 3),
        "prob_max": round(float(top["churn_probability"].max()), 3),
    }

    data = {
        "meta": {
            "source": "IBM Telco Customer Churn sample dataset",
            "file": "data/telco_with_predictions.csv",
            "rows": customers,
            "raw_rows": 7043,
            "generated": date.today().isoformat(),
            "risk_thresholds": {"high": f"> {HIGH}", "medium": f"{MEDIUM} to {HIGH}", "low": f"< {MEDIUM}"},
        },
        "kpis": kpis,
        "risk_counts": risk_counts,
        "top_profile": profile,
        "segments": segments,
        "model": MODEL,
        "customers": {
            "columns": ["id", "tenure", "contract", "monthly", "prob", "churn", "risk"],
            "contracts": CONTRACT_CODES,
            "risk": {v: k for k, v in RISK_CODES.items()},
            "order": "churn_probability descending",
            "rows": rows,
        },
    }

    # ---- validation report -------------------------------------------
    print("\nValidation against BUILD_BRIEF.md section 6")
    print(f"(FLAG = more than {TOLERANCE_PP} percentage points off; DIFF = a count that differs;")
    print(" near = customer count within 11, i.e. a reference taken before the 11 blank rows were dropped)\n")
    print("Headline numbers")
    check_count("customers", customers, 7032)
    check_count("churned", churned, 1869)
    check_pp("overall churn rate %", churn_rate, 26.6)
    print(f"  info  {'monthly revenue lost to churn':<42} computed ${mrr_lost:,.2f}  reference about $139K")
    if not 138_500 <= mrr_lost <= 139_500:
        problems.append(f"monthly revenue lost is ${mrr_lost:,.2f}, reference about $139K")
    # BUILD_BRIEF.md said 1,587; the refreshed Power BI report shows 1,704, matching the CSV.
    check_count("high-risk customers (p > 0.70)", high_risk, 1704)
    print(f"  info  {'average churn probability':<42} computed {avg_prob:.3f}  reference 0.39")
    if round(avg_prob, 2) != 0.39:
        problems.append(f"average churn probability is {avg_prob:.3f}, reference 0.39")
    print(f"  info  {'month-to-month avg monthly charge':<42} computed ${m2m_avg_charge:.2f}  reference $66.40")
    if round(m2m_avg_charge, 2) != 66.40:
        problems.append(f"month-to-month average charge is {m2m_avg_charge:.2f}, reference 66.40")

    for key, ref in REFERENCE.items():
        note = f" (approximate reference, tolerance {APPROXIMATE[key]} points)" if key in APPROXIMATE else ""
        print(f"\n{segments[key]['label']}{note}")
        by_key = {r["key"]: r for r in segments[key]["rows"]}
        for seg, (rate, n_churned, n_customers) in ref.items():
            row = by_key.get(seg)
            if row is None:
                problems.append(f"{key}: segment '{seg}' not found in the CSV")
                print(f"  MISS  {seg}")
                continue
            check_pp(f"{seg} churn rate %", row["rate"], rate, APPROXIMATE.get(key, TOLERANCE_PP))
            check_count(f"{seg} churned", row["churned"], n_churned)
            check_count(f"{seg} customers", row["customers"], n_customers, slack=11)

    c = {r["key"]: r["rate"] for r in segments["contract"]["rows"]}
    ratio = c["Month-to-month"] / c["Two year"]
    print(f"\n  info  month-to-month vs two-year churn ratio: {ratio:.1f}x (reference about 15x)")

    print("\nRisk levels (from churn_probability)")
    for lvl, n in risk_counts.items():
        print(f"  info  {lvl:<8} {n:,}")

    print("\nHighest-risk profile (top 50 by probability)")
    print(f"  info  contract: {profile['contract_mode']} ({profile['contract_share']:.0%} of top 50)")
    print(f"  info  tenure: min {profile['tenure_min']}, median {profile['tenure_median']:.0f}, 90th pct {profile['tenure_p90']:.0f} months")
    print(f"  info  monthly charge: 10th-90th pct ${profile['charge_p10']:.2f} to ${profile['charge_p90']:.2f}")
    print(f"  info  probability: {profile['prob_min']:.3f} to {profile['prob_max']:.3f}")
    print("  reference: month-to-month, tenure 1-3 months, about $85-105/month, probability 0.97-0.99")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"\nWrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")

    if problems:
        print(f"\n{len(problems)} item(s) did not reproduce:")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("\nAll reference values reproduced within tolerance.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
