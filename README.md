# QuantPorto — Portfolio Builder & Rebalancer (Rp10 Miliar Pertama Edition)

Reverse-engineered quantitative portfolio web application inspired by [Cara Dapet Rp10 MILIAR PERTAMA](https://www.youtube.com/watch?v=O8PShy9d484) by **Leon Hartono (The Overpost)** & quant strategist **Sander**.

A client-side Single-Page Application (`React 19 + TypeScript + Vite + Tailwind CSS v4 + Recharts`) equipped with client-side quantitative optimization, dynamic rebalancing, DCA intelligence, privacy-first lockscreen authentication, and automated market data updates via GitHub Actions.

---

## Key Modules & Features

### 1. Portfolio Builder & Quant Solver Lab
- **15 Optimal Portfolios (+10 Dominated Presets)**:
  - Video preset allocations, Risk Tier classification (*Super High Risk*, *High Risk*, *Medium Risk*, *Low Risk*), and capital weights across the 8 core benchmark instruments (`RDPU`, `RDPT`, `BBCA`, `GLD`, `SPY`, `QQQ`, `BTC`, `ETH`).
  - Toggle "+10 Porto Tereliminasi" to examine why benchmark strategies (e.g. *All-In S&P 500*, *All-In QQQ*) are Pareto-dominated by risk budgeting approaches.
- **Dynamic Client-Side Quant Solvers & Metrics Engines**:
  - **Risk Parity (Equal Risk Contribution)**: Balances marginal risk contribution equally across any selected subset of assets.
  - **Risk Budgeting (Conviction Tilt)**: Select conviction assets (`BTC`, `ETH`, `QQQ`, `SPY`, `GLD`, `BBCA`) with an interactive risk budget slider (5% – 99%) allocating target risk share.
  - **Covariance Solver (Default)** & **5Y IDR Backtest**: Uses Spinu Cyclical Coordinate Descent on a positive-definite covariance matrix built from measured 5-year weekly IDR return history (`src/data/market-history.json`), paired with monthly-rebalanced portfolio backtesting (re-centered to each asset's editable CAGR assumption).
  - **Video Replica Mode (Opt-in)**: Optional comparison mode preserving the video's original table figures and legacy heuristic curves.
- **Custom Asset Universe & Synthetic Builder**:
  - Expanded Indonesian banking tickers (`BMRI`, `BBRI`, `BBNI`, `NISP`), US ETFs (`SCHD`, `SMH`), and crypto (`SOL`).
  - Live Yahoo Finance 5Y ticker lookup + synthetic asset modeling.
- **Correlation Matrix & Smart Recommender**:
  - Interactive cross-asset correlation matrix using measured 5Y weekly IDR correlations (with category priors clearly labeled when an asset lacks 1Y history), highlighting optimal hedging pairs.
  - Questionnaire-driven portfolio recommendation modal matching investor risk profile and time horizon.

### 2. Portfolio Rebalancer & Stress-Tester
- **Flexible Asset Tracking**:
  - Input holdings via **Nominal Value (`Rp`)** or **Units / IDX Lots × Price** with automated `USD/IDR` conversion and sanity checks against the weekly market snapshot for proxy-fetched prices.
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

### 4. Local-Only Storage, UI Privacy Curtain & Guest Mode
- **Local-Only Storage**: All financial holdings and portfolios remain in the client browser (`localStorage`), with no backend server.
- **UI Lock Screen (Privacy Curtain)**: PBKDF2-SHA256 / SHA-256 password lockscreen (`VITE_APP_PASSWORD_HASH` + optional `VITE_APP_PASSWORD_SALT`) with optional WebAuthn / biometric prompt and auto-lock timeout. **Note:** This is a client-side privacy curtain against casual shoulder-surfing, not at-rest encryption — `localStorage` data is unencrypted and password hashes are bundled into the client build.
- **Optional Guest Mode (`VITE_APP_GUEST_PASSWORD_HASH`)**: Single-input auto-detection on the lockscreen (Owner checked first, then optional Guest). Guest sessions run in an isolated ephemeral `sessionStorage` sandbox (never reading, writing, or resetting Owner `localStorage` keys), wipe automatically on lock or tab close, hide biometric controls, and disable Owner-only utilities (Saved Bookmarks, JSON Backup/Transfer, Quick Copy Config, Broker Order Slips, and PDF/PNG Factsheet) with lock indicators while keeping all 3 analysis tabs, Share URLs, Holdings Text Import, and Live Price/Sentiment refresh interactive. Generate a self-contained PBKDF2 token via:
  ```bash
  node -e "const c=require('crypto'),s=c.randomBytes(16).toString('hex'),h=c.pbkdf2Sync(process.argv[1],s,100000,32,'sha256').toString('hex');console.log('pbkdf2:100000:'+s+':'+h)" "your-guest-password"
  ```

---

## Tech Stack

- **Core**: React 19, TypeScript, Vite 6
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`), `clsx`, `tailwind-merge`
- **Charts & UI**: Recharts, Lucide React, Driver.js (interactive onboarding tour)
- **Exports**: HTML2Canvas, HTML2Canvas-Pro
- **Testing**: Vitest (unit tests across quant math, backtest, price sanity checks, auth, and rebalancing logic)

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
# Set VITE_APP_PASSWORD_HASH (and optional VITE_APP_PASSWORD_SALT) in .env (default in .env.example is SHA-256 of 'quantporto2026')

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

- `.github/workflows/deploy-pages.yml`: Automated CI/CD pipeline deploying static production builds to **GitHub Pages** upon pushing to `master`.
- `.github/workflows/update-market-data.yml`: Scheduled weekly workflow executing `scripts/fetch_market_data.py` to refresh 5-year benchmark metrics (`public/data/market-data.json`) and aligned weekly IDR return history (`src/data/market-history.json`).
