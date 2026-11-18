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


USD_ASSETS = {"GLD", "SPY", "QQQ", "SCHD", "SMH", "NVDA", "VOO", "BTC", "ETH", "SOL"}

# Interior gaps (e.g. IDX Lebaran closures) are forward-filled up to this many weeks.
MAX_FORWARD_FILL_WEEKS = 3


def weekly_closes_by_monday(hist) -> dict[str, float]:
    """Maps the ISO Monday (YYYY-MM-DD) of each weekly bar to its adjusted close."""
    out: dict[str, float] = {}
    for ts, close in hist["Close"].dropna().items():
        value = float(close)
        if not math.isfinite(value) or value <= 0:
            continue
        day = ts.date()
        monday = day.fromordinal(day.toordinal() - day.weekday())
        out[monday.isoformat()] = value
    return out


def build_history(closes_by_asset: dict[str, dict[str, float]], fx_by_week: dict[str, float]) -> dict:
    """
    Builds an aligned weekly return history in IDR terms.

    - The grid is the set of completed weeks covered by the USD/IDR series.
    - USD assets are converted to IDR with the same-week USD/IDR close, so returns include FX moves
      (what an Indonesian investor actually experiences).
    - returns[asset][i] is the simple return from weekStarts[i] to weekStarts[i + 1];
      it is null before the asset's first available close.
    """
    today = datetime.now(timezone.utc).date()
    current_monday = today.fromordinal(today.toordinal() - today.weekday()).isoformat()
    grid = sorted(week for week in fx_by_week if week < current_monday)

    returns: dict[str, list] = {}
    for asset_id, closes in closes_by_asset.items():
        series: list = []
        filled: list = []
        last_value = None
        stale_weeks = 0
        for week in grid:
            raw = closes.get(week)
            if raw is not None:
                value = raw * fx_by_week[week] if asset_id in USD_ASSETS else raw
                last_value = value
                stale_weeks = 0
            elif last_value is not None and stale_weeks < MAX_FORWARD_FILL_WEEKS:
                stale_weeks += 1
                value = last_value
            else:
                value = None
            filled.append(value)
        for i in range(1, len(filled)):
            prev, cur = filled[i - 1], filled[i]
            series.append(round(cur / prev - 1.0, 6) if prev and cur else None)
        # Interior nulls would silently break the backtest window; drop assets with broken series.
        first = next((i for i, r in enumerate(series) if r is not None), None)
        if first is None or any(r is None for r in series[first:]):
            print(f"Warning: skipping history for {asset_id} (gaps longer than {MAX_FORWARD_FILL_WEEKS} weeks)")
            continue
        returns[asset_id] = series

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "currency": "IDR",
        "frequency": "weekly",
        "source": "Yahoo Finance adjusted weekly closes via yfinance; USD assets converted with IDR=X",
        "weekStarts": grid,
        "returns": returns,
    }


def main():
    repo_root = Path(__file__).resolve().parent.parent
    out_path = repo_root / "public" / "data" / "market-data.json"
    history_path = repo_root / "src" / "data" / "market-history.json"
    existing = {}
    if out_path.exists():
        existing = json.loads(out_path.read_text(encoding="utf-8"))

    # Fetch USD/IDR exchange rate (latest spot + 5Y weekly series for currency conversion)
    usd_idr = existing.get("usdIdrRate", 15600)
    fx_by_week: dict[str, float] = {}
    try:
        fx_hist = yf.Ticker("IDR=X").history(period="5y", interval="1wk")
        if not fx_hist.empty:
            fx_by_week = {w: v for w, v in weekly_closes_by_monday(fx_hist).items() if v > 1000}
            rate_val = float(fx_hist["Close"].iloc[-1])
            if math.isfinite(rate_val) and rate_val > 1000:
                usd_idr = round(rate_val)
    except Exception as exc:
        print(f"Warning: Failed to fetch IDR=X: {exc}")

    assets_data = existing.get("assets", {})
    # Keep steady Indonesian Money Market & Bond Fund proxies
    assets_data.setdefault("RDPU", {"price": 1850, "cagr5y": 3.76, "maxDrawdown5y": 0.0, "volatility5y": 0.45})
    assets_data.setdefault("RDPT", {"price": 54200, "cagr5y": 6.85, "maxDrawdown5y": 3.2, "volatility5y": 4.1})

    closes_by_asset: dict[str, dict[str, float]] = {}
    for asset_id, yf_sym in TICKER_MAP.items():
        try:
            hist = yf.Ticker(yf_sym).history(period="5y", interval="1wk")
            closes = [float(x) for x in hist["Close"].dropna().tolist() if math.isfinite(float(x)) and float(x) > 0]
            if len(closes) >= 20:
                assets_data[asset_id] = compute_metrics(closes)
                closes_by_asset[asset_id] = weekly_closes_by_monday(hist)
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

    # Fail loudly instead of committing a hollow history file that would silently disable the backtest.
    if len(fx_by_week) < 104 or not closes_by_asset:
        raise SystemExit("Refusing to write market history: USD/IDR or asset series unavailable.")
    history = build_history(closes_by_asset, fx_by_week)
    history_path.parent.mkdir(parents=True, exist_ok=True)
    history_path.write_text(json.dumps(history, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    print(f"Saved weekly IDR return history for {len(history['returns'])} assets to {history_path}")


if __name__ == "__main__":
    main()
