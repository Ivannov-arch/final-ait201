"""Generate publication-grade vector figures for the FreshGuard LaTeX Report.
All values are strictly sourced from the executed project evaluation reports.
"""

import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap

OUT_DIR = os.path.join("report", "figures")
os.makedirs(OUT_DIR, exist_ok=True)

# Global academic typography & styling
plt.rcParams.update({
    "font.family": "serif",
    "font.size": 9.5,
    "axes.titlesize": 10.5,
    "axes.titleweight": "bold",
    "axes.labelsize": 9.5,
    "axes.edgecolor": "#334155",
    "axes.linewidth": 0.8,
    "xtick.labelsize": 8.5,
    "ytick.labelsize": 8.5,
    "legend.fontsize": 8.5,
    "figure.dpi": 300,
    "savefig.bbox": "tight",
    "savefig.pad_inches": 0.08,
})

NAVY = "#0F294A"
BLUE = "#1D4ED8"
TEAL = "#0F766E"
EMERALD = "#15803D"
AMBER = "#D97706"
CRIMSON = "#B91C1C"
SLATE = "#475569"
LIGHT_GRAY = "#E2E8F0"


def fig1_confusion_matrices():
    classes = ["HIGH", "LOW", "MOD"]
    cm_xgb = np.array([
        [5093, 2186, 129],
        [ 617, 6882, 127],
        [1640, 1173, 129],
    ])
    cm_base = np.array([
        [4369, 1267, 1772],
        [4572,  585, 2469],
        [1970,  127,  845],
    ])

    fig, axes = plt.subplots(1, 2, figsize=(8.2, 3.5))
    cmap_xgb = LinearSegmentedColormap.from_list("navy_map", ["#F8FAFC", "#BFDBFE", "#1D4ED8", "#0F294A"])
    cmap_base = LinearSegmentedColormap.from_list("slate_map", ["#F8FAFC", "#FDE68A", "#D97706", "#9A3412"])

    for ax, cm, title, cmap in [
        (axes[0], cm_xgb, "(a) XGBoost Classifier (Acc: 67.33%, F1-macro: 0.513)", cmap_xgb),
        (axes[1], cm_base, "(b) DTE Rule Baseline (Acc: 32.26%, F1-macro: 0.270)", cmap_base),
    ]:
        row_pct = cm / cm.sum(axis=1, keepdims=True) * 100.0
        im = ax.imshow(row_pct, cmap=cmap, vmin=0, vmax=100, aspect="auto")
        ax.set_xticks(range(3))
        ax.set_yticks(range(3))
        ax.set_xticklabels(classes)
        ax.set_yticklabels(classes)
        ax.set_xlabel("Predicted Class")
        ax.set_ylabel("Actual Class")
        ax.set_title(title, pad=8, fontsize=9.2)

        for i in range(3):
            for j in range(3):
                val = cm[i, j]
                pct = row_pct[i, j]
                color = "white" if pct > 52 else "#0F172A"
                ax.text(j, i, f"{val:,}\n({pct:.1f}%)", ha="center", va="center",
                        color=color, fontsize=8, fontweight="bold" if i == j else "normal")

    plt.tight_layout(w_pad=2.0)
    fig.savefig(os.path.join(OUT_DIR, "fig1_spoilage_cm_comparison.pdf"))
    plt.close(fig)


def fig2_feature_importance():
    features = [
        "days_until_expiry",
        "daily_demand",
        "stock_pressure",
        "category_Frozen_Meals",
        "is_weekend",
        "shelf_life_days",
        "day_of_week",
        "initial_quantity",
        "Other 11 Features (Avg)",
    ][::-1]
    scores = [0.1773, 0.1644, 0.1386, 0.1266, 0.0758, 0.0708, 0.0576, 0.0289, 0.0145][::-1]
    colors_bar = [
        SLATE,      # Other
        SLATE,      # initial_quantity
        AMBER,      # day_of_week
        NAVY,       # shelf_life_days
        AMBER,      # is_weekend
        CRIMSON,    # Frozen_Meals
        TEAL,       # stock_pressure
        TEAL,       # daily_demand
        NAVY,       # days_until_expiry
    ]

    fig, ax = plt.subplots(figsize=(6.8, 3.6))
    y_pos = np.arange(len(features))
    bars = ax.barh(y_pos, [s * 100 for s in scores], color=colors_bar, edgecolor="#1E293B", linewidth=0.5, height=0.65)
    ax.set_yticks(y_pos)
    ax.set_yticklabels(features)
    ax.set_xlabel("Relative Gain Importance (%)")
    ax.set_title("XGBoost Spoilage Classifier — Feature Importance Breakdown (19 Features)")
    ax.set_xlim(0, 21.5)
    ax.grid(axis="x", linestyle="--", alpha=0.45, color="#94A3B8")
    ax.set_axisbelow(True)

    for bar, s in zip(bars, scores):
        ax.text(bar.get_width() + 0.35, bar.get_y() + bar.get_height()/2,
                f"{s*100:.2f}%", va="center", ha="left", fontsize=8, fontweight="bold", color="#0F172A")

    # Legend patches
    from matplotlib.patches import Patch
    legend_handles = [
        Patch(facecolor=NAVY, edgecolor="#1E293B", label="Expiry & Shelf-Life (24.8%)"),
        Patch(facecolor=TEAL, edgecolor="#1E293B", label="Demand & Velocity (30.3%)"),
        Patch(facecolor=CRIMSON, edgecolor="#1E293B", label="Category Outlier (12.7%)"),
        Patch(facecolor=AMBER, edgecolor="#1E293B", label="Temporal Cycle (13.3%)"),
    ]
    ax.legend(handles=legend_handles, loc="lower right", frameon=True, facecolor="white", edgecolor=LIGHT_GRAY, fontsize=7.8)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    plt.tight_layout()
    fig.savefig(os.path.join(OUT_DIR, "fig2_spoilage_feature_importance.pdf"))
    plt.close(fig)


def fig3_tier2_alpha_tradeoff():
    alphas = np.array([0.00, 0.05, 0.10, 0.15, 0.20])
    acc = np.array([67.33, 67.19, 67.14, 67.00, 66.57])
    f1m = np.array([51.27, 50.70, 50.60, 50.36, 49.85])
    rec_high = np.array([68.75, 70.13, 71.46, 72.62, 73.70])

    fig, ax1 = plt.subplots(figsize=(6.6, 3.2))
    l1, = ax1.plot(alphas, rec_high, marker="o", linewidth=2.2, color=CRIMSON, label="Recall (HIGH Risk) [Left]")
    ax1.set_xlabel(r"Tier-2 Escalation Strength ($\alpha$)")
    ax1.set_ylabel("HIGH-Risk Recall (%)", color=CRIMSON, fontweight="bold")
    ax1.tick_params(axis="y", labelcolor=CRIMSON)
    ax1.set_ylim(67.5, 75.0)
    ax1.grid(True, linestyle="--", alpha=0.45, color="#94A3B8")

    ax2 = ax1.twinx()
    l2, = ax2.plot(alphas, acc, marker="s", linewidth=2.0, linestyle="-", color=NAVY, label="Overall Accuracy [Right]")
    l3, = ax2.plot(alphas, f1m, marker="^", linewidth=1.8, linestyle="--", color=TEAL, label="Macro-F1 (%) [Right]")
    ax2.set_ylabel("Accuracy & Macro-F1 (%)", color=NAVY, fontweight="bold")
    ax2.tick_params(axis="y", labelcolor=NAVY)
    ax2.set_ylim(48.5, 69.5)

    # Highlight shipped alpha = 0.10
    ax1.axvline(0.10, color=AMBER, linestyle=":", linewidth=1.6)
    ax1.annotate("Shipped Policy\n($\\alpha = 0.10$)\n+2.71 pp Recall\n-0.19 pp Acc",
                 xy=(0.10, 71.46), xytext=(0.118, 72.3),
                 fontsize=7.8, fontweight="bold", color="#78350F",
                 bbox=dict(boxstyle="round,pad=0.3", facecolor="#FEF3C7", edgecolor=AMBER, lw=0.8),
                 arrowprops=dict(arrowstyle="->", color=AMBER, lw=1.1))

    ax1.set_title("Tier-2 Exponential Time-Decay Escalation: Recall vs. Accuracy Trade-Off")
    lines = [l1, l2, l3]
    ax1.legend(lines, [l.get_label() for l in lines], loc="lower left", frameon=True, facecolor="white", edgecolor=LIGHT_GRAY, fontsize=7.8)
    ax1.spines["top"].set_visible(False)
    ax2.spines["top"].set_visible(False)

    plt.tight_layout()
    fig.savefig(os.path.join(OUT_DIR, "fig3_tier2_alpha_tradeoff.pdf"))
    plt.close(fig)


def fig4_forecast_wape_skill():
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(8.8, 3.8), gridspec_kw={"width_ratios": [1.0, 1.45]})

    # Panel A: Multi-horizon WAPE
    horizons = ["Day +1", "Day +2", "Day +3"]
    x = np.arange(len(horizons))
    w = 0.28
    wape_val = [11.45, 11.79, 12.36]
    wape_test = [12.48, 12.84, 13.22]
    wape_base = [16.00, 16.00, 16.00]

    b1 = ax1.bar(x - w, wape_val, width=w, color=TEAL, edgecolor="#1E293B", linewidth=0.5, label="LightGBM (Val)")
    b2 = ax1.bar(x, wape_test, width=w, color=NAVY, edgecolor="#1E293B", linewidth=0.5, label="LightGBM (Test)")
    b3 = ax1.bar(x + w, wape_base, width=w, color="#CBD5E1", edgecolor="#475569", linewidth=0.5, label="7-Day Naive")

    for bars in (b1, b2, b3):
        for bar in bars:
            h = bar.get_height()
            ax1.text(bar.get_x() + bar.get_width()/2, h + 0.25, f"{h:.1f}%",
                     ha="center", va="bottom", fontsize=7.2, fontweight="bold")

    ax1.set_xticks(x)
    ax1.set_xticklabels(horizons)
    ax1.set_ylabel("WAPE (%) — Lower is Better")
    ax1.set_ylim(0, 18.8)
    ax1.set_title("(a) Direct Multi-Horizon WAPE")
    ax1.grid(axis="y", linestyle="--", alpha=0.45, color="#94A3B8")
    ax1.set_axisbelow(True)
    ax1.legend(loc="upper left", frameon=True, facecolor="white", edgecolor=LIGHT_GRAY, fontsize=7.5)
    ax1.spines["top"].set_visible(False)
    ax1.spines["right"].set_visible(False)

    # Panel B: Per-family skill at Day +1
    families = [
        "GROCERY I", "BEVERAGES", "GROCERY II", "DELI", "BREAD/BAKERY",
        "DAIRY", "PREPARED FOODS", "PRODUCE", "FROZEN FOODS", "POULTRY",
        "SEAFOOD", "LIQUOR/WINE/BEER", "EGGS", "MEATS"
    ][::-1]
    skills = [37.52, 26.85, 15.62, 15.35, 9.39, 9.17, 6.22, 2.95, -0.56, -1.27, -3.01, -7.38, -11.52, -13.60][::-1]
    bar_cols = [EMERALD if s >= 0 else CRIMSON for s in skills]

    y = np.arange(len(families))
    ax2.barh(y, skills, color=bar_cols, edgecolor="#1E293B", linewidth=0.4, height=0.68)
    ax2.axvline(0, color="#0F172A", linewidth=0.9)
    ax2.set_yticks(y)
    ax2.set_yticklabels(families, fontsize=7.5)
    ax2.set_xlabel("Forecast Skill vs. 7-Day Seasonal Naive (%)")
    ax2.set_title("(b) Per-Family Forecast Skill (Horizon +1)")
    ax2.set_xlim(-20, 46)
    ax2.grid(axis="x", linestyle="--", alpha=0.45, color="#94A3B8")
    ax2.set_axisbelow(True)

    for yi, s in zip(y, skills):
        offset = 0.8 if s >= 0 else -0.8
        ha = "left" if s >= 0 else "right"
        ax2.text(s + offset, yi, f"{s:+.1f}%", va="center", ha=ha, fontsize=7.0, fontweight="bold")

    ax2.spines["top"].set_visible(False)
    ax2.spines["right"].set_visible(False)

    plt.tight_layout(w_pad=1.6)
    fig.savefig(os.path.join(OUT_DIR, "fig4_forecast_wape_skill.pdf"))
    plt.close(fig)


def fig5_recovery_funnel():
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(8.4, 3.3), gridspec_kw={"width_ratios": [1.0, 1.25]})

    # Panel A: Rule Engine Routing (990 lots)
    routes = ["Normal Sale\n(0% Disc.)", "Dynamic\nMarkdown\n(15–40%)", "Closed NGO\nDonation\n(Cap ≤ 30%)"]
    counts = [741, 166, 83]
    shares = [74.8, 16.8, 8.4]
    cols = [NAVY, AMBER, TEAL]

    bars = ax1.bar(routes, counts, color=cols, edgecolor="#1E293B", linewidth=0.6, width=0.55)
    for bar, c, sh in zip(bars, counts, shares):
        ax1.text(bar.get_x() + bar.get_width()/2, c + 18, f"{c} lots\n({sh:.1f}%)",
                 ha="center", va="bottom", fontsize=8, fontweight="bold")
    ax1.set_ylabel("Number of Inventory Lots")
    ax1.set_ylim(0, 880)
    ax1.set_title("(a) Rule Engine Clearance Split (990 Lots)")
    ax1.grid(axis="y", linestyle="--", alpha=0.45, color="#94A3B8")
    ax1.set_axisbelow(True)
    ax1.spines["top"].set_visible(False)
    ax1.spines["right"].set_visible(False)

    # Panel B: 2,644-Event Discrete Simulation Funnel
    stages = ["Received", "Active FEFO", "Markdown", "Dispatched\n(Rescued)", "Wasted\n(Landfill)"][::-1]
    ev_counts = [990, 990, 332, 289, 43][::-1]
    ev_cols = [CRIMSON, EMERALD, AMBER, BLUE, NAVY]

    y = np.arange(len(stages))
    bars2 = ax2.barh(y, ev_counts, color=ev_cols, edgecolor="#1E293B", linewidth=0.6, height=0.62)
    for bar, c in zip(bars2, ev_counts):
        pct = c / 990.0 * 100.0
        ax2.text(c + 18, bar.get_y() + bar.get_height()/2, f"{c} ({pct:.1f}%)",
                 va="center", ha="left", fontsize=8, fontweight="bold")
    ax2.set_yticks(y)
    ax2.set_yticklabels(stages)
    ax2.set_xlabel("Event Count (Total Ledger: 2,644 Events)")
    ax2.set_xlim(0, 1210)
    ax2.set_title("(b) Simulated Retail Lifecycle Funnel (87% Terminal Rescue)")
    ax2.grid(axis="x", linestyle="--", alpha=0.45, color="#94A3B8")
    ax2.set_axisbelow(True)
    ax2.spines["top"].set_visible(False)
    ax2.spines["right"].set_visible(False)

    plt.tight_layout(w_pad=1.8)
    fig.savefig(os.path.join(OUT_DIR, "fig5_recovery_funnel.pdf"))
    plt.close(fig)


if __name__ == "__main__":
    fig1_confusion_matrices()
    fig2_feature_importance()
    fig3_tier2_alpha_tradeoff()
    fig4_forecast_wape_skill()
    fig5_recovery_funnel()
    print("[SUCCESS] Generated all 5 publication-grade PDF figures in report/figures/")
