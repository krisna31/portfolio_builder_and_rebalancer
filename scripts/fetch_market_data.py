#!/usr/bin/env python3
"""
Automated Market Data Updater for QuantPorto (GitHub Pages Static Dataset)
Fetches 5-year weekly historical data for the 8 core video benchmarks + expanded IDX/US/Crypto universe
using `yfinance`, computes 5Y CAGR, Max Drawdown, Annualized Volatility, and Latest Spot Prices,
and writes to `public/data/market-data.json`.
"""
import json
import math
from datetime import datetime, timezone
from pathlib import Path

try:
    import yfinance as yf
except ImportError:
    print("Please install yfinance: pip install yfinance")
    raise

TICKER_MAP = {
    "BBCA": "BBCA.JK",
    "BMRI": "BMRI.JK",
    "BBRI": "BBRI.JK",
    "BBNI": "BBNI.JK",
    "NISP": "NISP.JK",
    "AADI": "AADI.JK",
    "ADRO": "ADRO.JK",
    "PTBA": "PTBA.JK",
    "ITMG": "ITMG.JK",
    "BREN": "BREN.JK",
    "AMMN": "AMMN.JK",
    "PANI": "PANI.JK",
    "TLKM": "TLKM.JK",
    "ASII": "ASII.JK",
    "ICBP": "ICBP.JK",
    "ANTM": "ANTM.JK",
    "UNTR": "UNTR.JK",
    "BRIS": "BRIS.JK",
    "GLD": "GLD",
    "SPY": "SPY",
    "QQQ": "QQQ",
    "SCHD": "SCHD",
    "SMH": "SMH",
    "NVDA": "NVDA",
    "VOO": "VOO",
    "BTC": "BTC-USD",
    "ETH": "ETH-USD",
    "SOL": "SOL-USD",
}


def compute_metrics(closes: list[float]) -> dict:
    if len(closes) < 4:
        return {}
    first_p = closes[0]
    last_p = closes[-1]
    if first_p <= 0 or last_p <= 0 or not math.isfinite(first_p) or not math.isfinite(last_p):
        return {}

    years = max(0.5, len(closes) / 52.0)
    try:
        cagr = ((last_p / first_p) ** (1.0 / years) - 1.0) * 100.0
    except (ZeroDivisionError, OverflowError, ValueError):
        return {}

    if not math.isfinite(cagr):
        return {}

    peak = closes[0]
    max_dd = 0.0
    weekly_returns = []
    for i in range(1, len(closes)):
        p = closes[i]
        if not math.isfinite(p) or p <= 0:
            continue
        if p > peak:
            peak = p
        if peak > 0:
            dd = ((peak - p) / peak) * 100.0
            if dd > max_dd:
                max_dd = dd
        prev = closes[i - 1]
        if prev > 0:
            weekly_returns.append((p - prev) / prev)

    if not weekly_returns:
        return {}

    mean_r = sum(weekly_returns) / len(weekly_returns)
    variance = sum((r - mean_r) ** 2 for r in weekly_returns) / max(1, len(weekly_returns) - 1)
    vol = math.sqrt(max(0.0, variance) * 52.0) * 100.0

    # Young IPO (< 3 years) conservative risk floor & shrinkage
    if years < 3.0:
        cagr = cagr * 0.65 + 15.0 * 0.35
        max_dd = max(28.0, max_dd * 1.25)
        vol = max(26.0, vol)

    if not (math.isfinite(cagr) and math.isfinite(max_dd) and math.isfinite(vol)):
        return {}

    return {
        "price": round(last_p, 2),
        "cagr5y": round(cagr, 2),
        "maxDrawdown5y": round(max_dd, 2),
        "volatility5y": round(vol, 2),
        "dataYears": round(years, 1),
    }


def main():
    out_path = Path(__file__).resolve().parent.parent / "public" / "data" / "market-data.json"
    existing = {}
    if out_path.exists():
        existing = json.loads(out_path.read_text(encoding="utf-8"))

    # Fetch USD/IDR exchange rate
    usd_idr = existing.get("usdIdrRate", 15600)
    try:
        fx_hist = yf.Ticker("IDR=X").history(period="5d")
        if not fx_hist.empty:
            rate_val = float(fx_hist["Close"].iloc[-1])
            if math.isfinite(rate_val) and rate_val > 1000:
                usd_idr = round(rate_val)
    except Exception as exc:
        print(f"Warning: Failed to fetch IDR=X: {exc}")

    assets_data = existing.get("assets", {})
    # Keep steady Indonesian Money Market & Bond Fund proxies
    assets_data.setdefault("RDPU", {"price": 1850, "cagr5y": 3.76, "maxDrawdown5y": 0.0, "volatility5y": 0.45})
    assets_data.setdefault("RDPT", {"price": 54200, "cagr5y": 6.85, "maxDrawdown5y": 3.2, "volatility5y": 4.1})

    for asset_id, yf_sym in TICKER_MAP.items():
        try:
            hist = yf.Ticker(yf_sym).history(period="5y", interval="1wk")
            closes = [float(x) for x in hist["Close"].dropna().tolist() if math.isfinite(float(x)) and float(x) > 0]
            if len(closes) >= 20:
                assets_data[asset_id] = compute_metrics(closes)
                print(f"Updated {asset_id} ({yf_sym}): {assets_data[asset_id]}")
        except Exception as exc:
            print(f"Warning: Could not update {asset_id}: {exc}")

    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "GitHub Actions Automated 5Y Rolling Market Data + Video Baseline",
        "usdIdrRate": usd_idr,
        "assets": assets_data,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2, allow_nan=False), encoding="utf-8")
    print(f"Saved market data to {out_path}")


if __name__ == "__main__":
    main()
