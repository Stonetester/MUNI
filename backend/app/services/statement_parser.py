"""
Account statement PDF parser.
Supports: EverBank (HYSA/savings), John Hancock (401k), Charles Schwab (IRA/brokerage).
Returns institution, account type hint, statement date, and ending balance.
"""
from __future__ import annotations

import re
import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class ParsedStatement:
    institution: str                  # "EverBank" | "John Hancock" | "Schwab"
    account_type_hint: str            # "hysa" | "retirement_401k" | "ira"
    account_label: str                # human-readable, e.g. "EverBank Performance Savings"
    statement_date: Optional[date]
    ending_balance: Optional[float]
    account_number_hint: Optional[str]  # last 4 digits if found


def _parse_money(raw: str) -> Optional[float]:
    cleaned = re.sub(r"[,$\s]", "", raw)
    try:
        return float(cleaned)
    except ValueError:
        return None


def _extract_text(pdf_path: str) -> str:
    import pdfplumber
    parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                parts.append(t)
    return "\n".join(parts)


# ── EverBank ──────────────────────────────────────────────────────────────────

def _parse_everbank(text: str) -> Optional[ParsedStatement]:
    """
    Statement header: 'EverBank Performance Savings 1245242512'
    Date line:        'July 31, 2025'
    Balance line:     '07-31 Ending totals   6,003.00   .00   $6,003.00'
    Also works from summary:  'EverBank Performance Savings 1245242512  $6,003.00'
    """
    if "EverBank" not in text and "everbank" not in text.lower():
        return None

    # Statement date — format: "Month DD, YYYY"
    stmt_date = None
    date_match = re.search(
        r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b",
        text,
    )
    if date_match:
        for fmt in ("%B %d, %Y",):
            try:
                stmt_date = datetime.strptime(date_match.group(0), fmt).date()
                break
            except ValueError:
                pass

    # Ending balance — prefer "Ending totals" row last dollar figure
    balance = None
    ending_row = re.search(r"Ending totals\s+[\d,]+\.\d{2}\s+[\d,.]+\s+\$([\d,]+\.\d{2})", text)
    if ending_row:
        balance = _parse_money(ending_row.group(1))

    # Fallback: "Ending Account Value" or summary line "$X,XXX.XX" near EverBank name
    if balance is None:
        summary = re.search(
            r"EverBank Performance Savings\s+\d+\s+\$([\d,]+\.\d{2})", text
        )
        if summary:
            balance = _parse_money(summary.group(1))

    # Account number last 4
    acct_match = re.search(r"\b(\d{10})\b", text)
    acct_hint = acct_match.group(1)[-4:] if acct_match else None

    return ParsedStatement(
        institution="EverBank",
        account_type_hint="hysa",
        account_label="EverBank Performance Savings",
        statement_date=stmt_date,
        ending_balance=balance,
        account_number_hint=acct_hint,
    )


# ── John Hancock (401k) ───────────────────────────────────────────────────────

def _parse_john_hancock(text: str) -> Optional[ParsedStatement]:
    """
    Key line: 'Total Value on 12/31/2024  $35,028.27'
    Period line: 'October 01, 2024 - December 31, 2024'
    """
    if "John Hancock" not in text and "johnhancock" not in text.lower():
        return None

    # Ending balance — 'Total Value on MM/DD/YYYY  $XX,XXX.XX'
    balance = None
    stmt_date = None

    # "Total Value on12/31/2024 $35,028.27" — pdfplumber may omit spaces
    # There are two such lines (beginning + ending); take the LAST one (ending)
    tv_matches = re.findall(
        r"Total Value on\s*(\d{1,2}/\d{1,2}/\d{4})\s+\$([\d,]+\.\d{2})", text
    )
    if tv_matches:
        last = tv_matches[-1]
        try:
            stmt_date = datetime.strptime(last[0], "%m/%d/%Y").date()
        except ValueError:
            pass
        balance = _parse_money(last[1])

    # Fallback: 'Your retirement account value as of MM/DD/YYYY  $XX,XXX.XX'
    if balance is None:
        acct_val = re.search(
            r"retirement account value as of\s*(\d{1,2}/\d{1,2}/\d{4})\s+\$([\d,]+\.\d{2})",
            text, re.IGNORECASE,
        )
        if acct_val:
            try:
                stmt_date = datetime.strptime(acct_val.group(1), "%m/%d/%Y").date()
            except ValueError:
                pass
            balance = _parse_money(acct_val.group(2))

    # Fallback: period end date from 'October 01, 2024 - December 31, 2024'
    if stmt_date is None:
        period_match = re.search(
            r"-\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})",
            text,
        )
        if period_match:
            try:
                stmt_date = datetime.strptime(
                    f"{period_match.group(1)} {period_match.group(2)}, {period_match.group(3)}",
                    "%B %d, %Y",
                ).date()
            except ValueError:
                pass

    # Fallback: 'your account balance is $XX as of Month DD, YYYY'
    if stmt_date is None:
        bal_date = re.search(
            r"as of\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})",
            text, re.IGNORECASE,
        )
        if bal_date:
            try:
                stmt_date = datetime.strptime(
                    f"{bal_date.group(1)} {bal_date.group(2)}, {bal_date.group(3)}",
                    "%B %d, %Y",
                ).date()
            except ValueError:
                pass

    # Ending balance from summary section: 'Ending balance $35,028.27'
    if balance is None:
        eb_match = re.search(r"Ending balance\s+\$([\d,]+\.\d{2})", text)
        if eb_match:
            balance = _parse_money(eb_match.group(1))

    return ParsedStatement(
        institution="John Hancock",
        account_type_hint="retirement_401k",
        account_label="John Hancock 401(k)",
        statement_date=stmt_date,
        ending_balance=balance,
        account_number_hint=None,
    )


# ── Charles Schwab (IRA / Brokerage) ─────────────────────────────────────────

def _parse_schwab(text: str) -> Optional[ParsedStatement]:
    """
    Key line: 'Ending Account Value as of 01/31  $3,572.95'
    Period:   'Statement Period January 1-31, 2026'
    Account:  'ROTH CONTRIBUTORY IRA' or 'Brokerage'
    """
    if "Schwab" not in text and "schwab" not in text.lower():
        return None

    # Determine account label
    if "ROTH" in text.upper():
        acct_label = "Schwab Roth IRA"
        acct_type = "ira"
    elif "IRA" in text.upper():
        acct_label = "Schwab IRA"
        acct_type = "ira"
    else:
        acct_label = "Schwab Brokerage"
        acct_type = "brokerage"

    # Ending balance and date — pdfplumber may strip spaces, so try both spaced and compact forms
    balance = None
    stmt_date = None

    # 'Ending Account Value as of 01/31  $3,572.95' (spaced) or 'EndingAccountValueasof01/31' (compact)
    eav_match = re.search(
        r"Ending\s*Account\s*Value\s*as\s*of\s*\d{1,2}/\d{1,2}\s+Beginning",
        text, re.IGNORECASE,
    )
    # Grab the dollar amount from 'Ending Account Value  $X,XXX.XX  $X,XXX.XX'
    eav_bal = re.search(
        r"Ending\s*Account\s*Value\s+\$([\d,]+\.\d{2})", text, re.IGNORECASE
    )
    if eav_bal:
        balance = _parse_money(eav_bal.group(1))

    # Statement period: 'January1-31,2026' (compact) or 'January 1-31, 2026' (spaced)
    period_match = re.search(
        r"(January|February|March|April|May|June|July|August|September|October|November|December)\s*\d+-(\d+),\s*(\d{4})",
        text,
    )
    if period_match:
        month_name = period_match.group(1)
        day = period_match.group(2)
        year = period_match.group(3)
        try:
            stmt_date = datetime.strptime(f"{month_name} {day}, {year}", "%B %d, %Y").date()
        except ValueError:
            pass

    # Account number last 4
    acct_match = re.search(r"Account Number\s+[\dX]+-(\d{4})", text)
    acct_hint = acct_match.group(1) if acct_match else None

    return ParsedStatement(
        institution="Schwab",
        account_type_hint=acct_type,
        account_label=acct_label,
        statement_date=stmt_date,
        ending_balance=balance,
        account_number_hint=acct_hint,
    )


# ── Public entry point ─────────────────────────────────────────────────────────

def parse_statement(pdf_path: str) -> ParsedStatement:
    """Parse an account statement PDF and return extracted data."""
    text = _extract_text(pdf_path)

    for parser in (_parse_everbank, _parse_john_hancock, _parse_schwab):
        result = parser(text)
        if result is not None:
            return result

    # Unknown institution — return empty shell so UI can still proceed
    return ParsedStatement(
        institution="Unknown",
        account_type_hint="other",
        account_label="Unknown Institution",
        statement_date=None,
        ending_balance=None,
        account_number_hint=None,
    )
