# QuantPorto — Portfolio Builder & Rebalancer (Rp10 Miliar Pertama Edition)

Reverse-engineered quantitative portfolio web application inspired by [Cara Dapet Rp10 MILIAR PERTAMA](https://www.youtube.com/watch?v=O8PShy9d484) by **Leon Hartono (The Overpost)** & quant strategist **Sander**.

A client-side Single-Page Application (`React 19 + TypeScript + Vite + Tailwind CSS v4 + Recharts`) equipped with client-side quantitative optimization, dynamic rebalancing, DCA intelligence, privacy-first lockscreen authentication, and automated market data updates via GitHub Actions.

---

## Key Modules & Features

### 1. Portfolio Builder & Quant Solver Lab
- **15 Optimal Portfolios (+10 Dominated Presets)**:
  - Exact CAGR (%), Max Drawdown (%), Risk Tier classification (*Super High Risk*, *High Risk*, *Medium Risk*, *Low Risk*), and capital weights across the 8 core benchmark instruments (`RDPU`, `RDPT`, `BBCA`, `GLD`, `SPY`, `QQQ`, `BTC`, `ETH`).
  - Toggle "+10 Porto Tereliminasi" to examine why benchmark strategies (e.g. *All-In S&P 500*, *All-In QQQ*) are Pareto-dominated by risk budgeting approaches.
- **Dynamic Client-Side Quant Solvers**:
  - **Risk Parity (Equal Risk Contribution)**: Balances portfolio volatility equally across any selected subset of assets.
  - **Risk Budgeting (Conviction Tilt)**: Select conviction assets (`BTC`, `ETH`, `QQQ`, `SPY`, `GLD`, `BBCA`) with an interactive risk budget slider (20% – 95%) mapping capital weight to risk share.
  - Dual solver engines: Video-calibrated heuristic solver and exact Covariance Matrix Solver (Spinu Cyclical Coordinate Descent).
- **Custom Asset Universe & Synthetic Builder**:
  - Expanded Indonesian banking tickers (`BMRI`, `BBRI`, `BBNI`, `NISP`), US ETFs (`SCHD`, `SMH`), and crypto (`SOL`).
  - Live Yahoo Finance 5Y ticker lookup + synthetic asset modeling.
- **Correlation Matrix & Smart Recommender**:
  - Interactive cross-asset correlation matrix highlighting optimal hedging pairs.
  - Questionnaire-driven portfolio recommendation modal matching investor risk profile and time horizon.

### 2. Portfolio Rebalancer & Stress-Tester
- **Flexible Asset Tracking**:
  - Input holdings via **Nominal Value (`Rp`)** or **Units / IDX Lots × Price** with automated `USD/IDR` conversion.
  - Unstructured text and CSV import (`HoldingsTextImportModal`) for quick sync from brokerage notes.
- **Rebalancing Modes**:
  - **Sell + Buy (Full Rebalance)**: Trims overweight assets to buy underweight ones and deploys fresh cash.
  - **Buy-Only (DCA Mode)**: Preserves existing holdings and directs new capital exclusively to underweight assets.
  - **Fixed Budget Auto-Subtraction**: Dynamically accounts for allocated capital against available cash.
- **Smart DCA Advisor & Tactical Indicators**:
  - CoinMarketCap and live Fear & Greed index valuation signals to optimize dollar-cost averaging timing.
- **Market Crash & Bull Run Simulator**:
  - Scenario stress-testing: Bull runs (e.g. BTC/ETH 3x), crypto crashes (-50%), macro liquidity crunches, and custom asset shocks (-80% to +300%).
- **Export & Execution**:
  - Generates broker execution tickets in IDR, USD, and IDX lots (100 shares/lot).
  - One-click copy, broker slip modal, portfolio factsheet preview, and JSON/CSV backup data transfer.

### 3. Rp10 Miliar Pertama Wealth Roadmap
- Interactive compounding trajectory simulator projecting time to reach Rp10 Billion (or custom targets).
- Configurable monthly contributions, annual income step-up percentages, target milestone chips, and withdrawal scenarios.

### 4. Privacy & Client-Side Security
- **Local-Only Storage**: All financial holdings and portfolios remain in the client browser (`localStorage`).
- **Access Protection**: SHA-256 hashed password lockscreen with optional WebAuthn / biometric authentication and configurable auto-lock timeout.

---

## Tech Stack

- **Core**: React 19, TypeScript, Vite 6
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`), `clsx`, `tailwind-merge`
- **Charts & UI**: Recharts, Lucide React, Driver.js (interactive onboarding tour)
- **Exports**: HTML2Canvas, HTML2Canvas-Pro
- **Testing**: Vitest (260+ unit tests across quant math, auth, and rebalancing logic)

---

## Local Development & Setup

### Prerequisites
- Node.js 20+
- npm or pnpm

### Getting Started

```bash
# 1. Clone repository
git clone https://github.com/krisna31/portfolio_builder_and_rebalancer.git
cd portfolio_builder_and_rebalancer

# 2. Configure environment variables
cp .env.example .env
# Set VITE_APP_PASSWORD_HASH in .env (default in .env.example is SHA-256 of 'quantporto2026')

# 3. Install dependencies
npm install

# 4. Run tests
npm test

# 5. Start development server
npm run dev
```

### Production Build

```bash
npm run build
npm run preview
```

---

## GitHub Actions & Automation

- `.github/workflows/deploy.yml`: Automated CI/CD pipeline deploying static production builds to **GitHub Pages** upon pushing to `master`.
- `.github/workflows/update-market-data.yml`: Scheduled weekly workflow executing `scripts/fetch_market_data.py` to refresh 5-year benchmark price history in `public/data/market-data.json`.
