"""
Wide-format (monthly summary) CSV importer.

Expected layout:
  Row 0 (optional): blank
  Row 1 (header):   "Months", "September2024", "October2024", ...
  Row 2+:           "Row Label", value1, value2, ...

Columns that don't parse as month names (e.g. trailing totals) are silently skipped.
Each non-empty, non-zero cell becomes one transaction on the last day of that month.

Kind inference from row label:
  income  → contains: income, revenue, pay, salary, freelance, earning, wage
  expense → contains: expense, cost, spend, bill, payment, fee, rent, tax
  unknown → everything else (user must confirm in UI)
"""
from __future__ import annotations

import calendar
import io
import logging
import re
from dataclasses import dataclass
from datetime import date
from typing import Dict, List, Optional, Tuple

import pandas as pd

logger = logging.getLogger(__name__)

MONTH_MAP: Dict[str, int] = {
    "january": 1, "jan": 1,
    "february": 2, "feb": 2,
    "march": 3, "mar": 3,
    "april": 4, "apr": 4,
    "may": 5,
    "june": 6, "jun": 6,
    "july": 7, "jul": 7,
    "august": 8, "aug": 8,
    "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10,
    "november": 11, "nov": 11,
    "december": 12, "dec": 12,
}

INCOME_WORDS = ("income", "revenue", "pay", "salary", "freelance", "earning", "wage", "receipt")
EXPENSE_WORDS = ("expense", "cost", "spend", "bill", "payment", "fee", "rent", "tax")


@dataclass
class WidePreviewRow:
    description: str       # row label, e.g. "CFH Income"
    date: str              # ISO date string, last day of month
    month_label: str       # human-readable, e.g. "Sep 2024"
    amount: float          # always positive; sign applied at commit based on kind
    inferred_kind: str     # "income" | "expense" | "unknown"


def _parse_month_col(raw: str) -> Optional[date]:
    """Parse 'September2024', 'Oct2024', 'January 2025' → last day of that month."""
    raw = raw.strip()
    if not raw:
        return None
    m = re.match(r"([A-Za-z]+)\s*(\d{4})", raw)
    if not m:
        return None
    month_num = MONTH_MAP.get(m.group(1).lower())
    if not month_num:
        return None
    year = int(m.group(2))
    last_day = calendar.monthrange(year, month_num)[1]
    return date(year, month_num, last_day)


def _infer_kind(label: str) -> str:
    lower = label.lower()
    if any(w in lower for w in INCOME_WORDS):
        return "income"
    if any(w in lower for w in EXPENSE_WORDS):
        return "expense"
    return "unknown"


def _parse_cell(raw: str) -> Optional[float]:
    s = str(raw).strip().replace(",", "").replace("$", "").replace("(", "-").replace(")", "")
    if not s or s.lower() == "nan":
        return None
    try:
        import math
        v = float(s)
        if math.isnan(v) or math.isinf(v) or v == 0:
            return None
        return v
    except ValueError:
        return None


def parse_wide_format(content: bytes) -> Tuple[List[WidePreviewRow], List[str]]:
    """Parse wide-format CSV/XLSX. Returns (preview_rows, error_messages)."""
    errors: List[str] = []

    # Load with no header so we can scan for the month header row
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            df = pd.read_csv(io.BytesIO(content), dtype=str, encoding=encoding, header=None)
            break
        except Exception:
            continue
    else:
        return [], ["Could not decode file — try saving as UTF-8 CSV"]

    # Locate the header row: first row whose first non-blank cell is "Months"/"Month"/
    # or that contains >= 3 parseable month columns
    header_idx: Optional[int] = None
    for i in range(min(5, len(df))):
        row = df.iloc[i]
        cells = [str(v).strip() for v in row]
        first_nonempty = next((c for c in cells if c and c.lower() != "nan"), "")
        if first_nonempty.lower() in ("months", "month", "date", "period"):
            header_idx = i
            break
        month_hits = sum(1 for c in cells[1:] if _parse_month_col(c) is not None)
        if month_hits >= 3:
            header_idx = i
            break

    if header_idx is None:
        return [], ["No header row with month names found (expected a row starting with 'Months')"]

    header = df.iloc[header_idx]

    # Build col_index → month_date mapping; skip cols with no valid month header
    col_dates: Dict[int, date] = {}
    for ci in range(1, len(header)):
        raw = str(header.iloc[ci]).strip()
        if raw and raw.lower() != "nan":
            d = _parse_month_col(raw)
            if d:
                col_dates[ci] = d

    if not col_dates:
        return [], ["No valid month columns found — expected headers like 'September2024'"]

    preview: List[WidePreviewRow] = []

    for ri in range(header_idx + 1, len(df)):
        row = df.iloc[ri]
        label = str(row.iloc[0]).strip()
        if not label or label.lower() == "nan":
            continue

        kind = _infer_kind(label)

        for ci, month_date in col_dates.items():
            if ci >= len(row):
                continue
            amount = _parse_cell(str(row.iloc[ci]))
            if amount is None:
                continue

            preview.append(WidePreviewRow(
                description=label,
                date=month_date.isoformat(),
                month_label=month_date.strftime("%b %Y"),
                amount=abs(amount),    # always positive; sign applied at commit
                inferred_kind=kind,
            ))

    if not preview:
        errors.append("No transaction data found after the header row")

    return preview, errors
