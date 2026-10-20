# QuantPorto — Portfolio Builder & Rebalancer (Rp10 Miliar Pertama Edition)

Reverse-engineered quantitative web application based on [Cara Dapet Rp10 MILIAR PERTAMA](https://www.youtube.com/watch?v=O8PShy9d484) by **Leon Hartono (The Overpost)** & quant strategist **Sander**.

Built as a static Single-Page Application (`Vite + React + TypeScript + Tailwind CSS + Recharts`) ready for **GitHub Pages** deployment with an automated **GitHub Actions** 5-year market data updater.

---

## Core Features

### 1. Portfolio Builder & Quant Solver Lab
- **The 15 Optimal Portfolios (Plus 10 Dominated Presets)**:
  - Exact CAGR (%), Max Drawdown (%), Risk Tier classification (*Super High Risk*, *High Risk*, *Medium Risk*, *Low Risk*), and capital weights across the **8 Core Benchmark Instruments** (`RDPU`, `RDPT`, `BBCA`, `GLD`, `SPY`, `QQQ`, `BTC`, `ETH`).
  - Toggle **"+10 Porto Tereliminasi"** to inspect the full 25-portfolio matrix and see why strategies like *All-In S&P 500* or *All-In QQQ* are Pareto-dominated by *Risk Budgeting 70%* (`10:16` in the video).
- **Dynamic Client-Side Quant Solver**:
  - **Risk Parity (Equal Risk Contribution)**: Automatically balances risk equally across any selected subset of assets.
  - **Risk Budgeting (Conviction Tilt)**: Choose your high-conviction asset (e.g., `BTC`, `ETH`, `QQQ`, `SPY`, `GLD`, `BBCA`) and drag the **Risk Budget Slider (20% – 95%)** to compute exact capital weights (`Bobot %`) vs. risk contributions (`Risk Share %`).
  - Supports switching between the **Video Calibrated Solver** and the **Exact Covariance Matrix Solver (Spinu Cyclical Coordinate Descent)**.
- **Custom Asset Universe**:
  - Includes expanded Indonesian banking peers (`BMRI`, `BBRI`, `BBNI`, `NISP`), US ETFs (`SCHD`, `SMH`), and Crypto (`SOL`).
  - Live **Yahoo Finance 5Y Ticker Lookup** + **Synthetic Custom Asset Builder**.
- **Makmur RDPT Alpha Promo (+3%) Toggle**:
  - Simulates the alpha concept from `05:04` (boosting bond yield by +3% at identical risk).

### 2. Portfolio Rebalancer & Market Crash Simulator
- **Flexible Holdings Input**:
  - Track positions by **Nominal Value (`Rp`)** or **Units / IDX Lots × Live Price** with automatic `USD/IDR` conversion.
  - One-click **"Load Contoh Video Rp 1 Miliar (BTC 90%)"** (`14:58`) and **"Diversifikasi Sub-Bank (BBCA/BMRI/BBRI/NISP)"** (`14:17`).
- **Two Rebalancing Modes**:
  - **Sell + Buy (Full Rebalance)**: Sell overweight winners to buy underweight dips + deploy any new cash.
  - **Buy-Only (DCA Injection)**: Never sell existing holdings; route new monthly savings exclusively into the most underweight assets.
- **Interactive "What-If Market Crash & Bull Run" Stress-Tester (`15:18 – 16:08`)**:
  - One-click presets for **Video Scenario 1 (BTC & ETH 3x Bull Run, BBCA -10%)**, **Video Scenario 2 (Crypto Crash -50% Buy The Dip)**, **Global Crisis**, or custom per-asset shock sliders (`-80%` to `+300%`).
- **Trade Execution Tickets & CSV Export**:
  - Outputs exact `BUY` / `SELL` / `HOLD` orders in **IDR**, **USD**, **Units**, and **IDX Lots (100 shares/lot)**.

### 3. Rp10 Miliar Pertama Compounding Roadmap
- Interactive wealth simulator calculating exact **Years & Months to Rp 10 Billion** (or custom goal) across `Rp 5 Jt/bln`, `Rp 10 Jt/bln`, `Rp 20 Jt/bln`, or custom DCA + annual income step-up.

---

## Local Development & Testing

```bash
# Install dependencies
npm install

# Run unit tests (Quant Solver, Rebalancer, Wealth Simulator)
npm test

# Start local dev server
npm run dev

# Build static production bundle for GitHub Pages
npm run build
```

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. Go to **Settings ➔ Pages** and set **Source** to **GitHub Actions**.
3. Both workflows are pre-configured in `.github/workflows/`:
   - `deploy.yml`: Automatically builds and deploys the app to GitHub Pages on every push.
   - `update-market-data.yml`: Runs weekly (and via manual trigger) using `scripts/fetch_market_data.py` (`yfinance`) to refresh `public/data/market-data.json`.
