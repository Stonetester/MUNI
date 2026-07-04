"""
Account statement PDF parser.
Supports: EverBank (HYSA/savings), John Hancock (401k), Charles Schwab (IRA/brokerage),
          Fidelity NetBenefits (401k).
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
class ParsedHolding:
    """One fund/stock position pulled from a statement's holdings table."""
    ticker: str                       # symbol if present, else a short slug of the name
    fund_name: str                    # full human-readable name
    value: Optional[float]            # current market value ($)
    weight_percent: Optional[float] = None   # % of account, if the statement gives it


@dataclass
class ParsedStatement:
    institution: str                  # "EverBank" | "John Hancock" | "Schwab"
    account_type_hint: str            # "hysa" | "retirement_401k" | "ira"
    account_label: str                # human-readable, e.g. "EverBank Performance Savings"
    statement_date: Optional[date]
    ending_balance: Optional[float]
    account_number_hint: Optional[str]  # last 4 digits if found
    holdings: list = None             # list[ParsedHolding] — funds/stocks in the account
    personal_rate_of_return: Optional[float] = None  # stated PRR for the period, if any (Fidelity)
    period_contributions: Optional[float] = None     # money added THIS period (deposits + employer);
                                                     # netted out of returns so deposits aren't "gains"
    employer_contributions: Optional[float] = None   # employer-paid subset of period_contributions,
                                                     # when the statement itemizes it (Fidelity/JH)

    def __post_init__(self):
        if self.holdings is None:
            self.holdings = []


def _parse_money(raw: str) -> Optional[float]:
    cleaned = re.sub(r"[,$\s]", "", raw)
    try:
        return float(cleaned)
    except ValueError:
        return None


def _sum_period_contributions(text: str, institution: str) -> Optional[float]:
    """Money the account holder/employer ADDED this statement period.

    Netting this out of the balance change is what turns a garbage "2700%/yr"
    (mostly deposits) into a real investment return. We take the PERIOD column
    (the first number after each label), not YTD/inception.
    """
    total = 0.0
    found = False

    if institution == "Schwab":
        # 'Deposits 375.00 675.00'  -> period = first number
        m = re.search(r"\bDeposits\s+([\d,]+\.\d{2})", text)
        if m:
            total += _parse_money(m.group(1)) or 0.0
            found = True

    elif institution == "Fidelity":
        for label in (r"Your Contributions", r"Employer Contributions"):
            m = re.search(label + r"\s+\$([\d,]+\.\d{2})", text)
            if m:
                total += _parse_money(m.group(1)) or 0.0
                found = True

    elif institution == "John Hancock":
        # Each line: '<LABEL> <period> <ytd> <inception>' -> period = first number.
        for label in (r"EE ELECTIVE DEFERRAL", r"SAFE HARBOR NON-ELECTIVE CONTR",
                      r"ER PROFIT SHARING", r"Transfers into the plan"):
            m = re.search(label + r"\s+([\d,]+\.\d{2})", text)
            if m:
                total += _parse_money(m.group(1)) or 0.0
                found = True

    return round(total, 2) if found else None


def _sum_employer_contributions(text: str, institution: str) -> Optional[float]:
    """The EMPLOYER-paid portion of this period's contributions, when itemized.

    Fidelity prints an explicit "Employer Contributions" line; John Hancock itemizes the
    employer side as SAFE HARBOR / PROFIT SHARING lines. Schwab (IRA/brokerage) and
    EverBank have no employer money — return None, not 0, so callers can tell "statement
    doesn't itemize it" apart from "employer contributed nothing".

    Storing this on the snapshot is what lets the app MEASURE the employer 401k match for
    someone whose paystub doesn't print it, instead of trusting a manual profile percent.
    """
    total = 0.0
    found = False

    if institution == "Fidelity":
        m = re.search(r"Employer Contributions\s+\$([\d,]+\.\d{2})", text)
        if m:
            total += _parse_money(m.group(1)) or 0.0
            found = True

    elif institution == "John Hancock":
        for label in (r"SAFE HARBOR NON-ELECTIVE CONTR", r"ER PROFIT SHARING"):
            m = re.search(label + r"\s+([\d,]+\.\d{2})", text)
            if m:
                total += _parse_money(m.group(1)) or 0.0
                found = True

    return round(total, 2) if found else None


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
        holdings=_john_hancock_holdings(text),
        period_contributions=_sum_period_contributions(text, "John Hancock"),
        employer_contributions=_sum_employer_contributions(text, "John Hancock"),
    )


def _slug_ticker(name: str) -> str:
    """John Hancock / Fidelity list fund NAMES, not tickers. Make a stable slug so
    holdings match across statements. Uses initials of each word PLUS a compact tail
    so similar names ('iShares MSCI EAFE Value ETF' vs '...Growth ETF') don't collide."""
    words = re.findall(r"[A-Za-z0-9]+", name.upper())
    if not words:
        return "FUND"
    initials = "".join(w[0] for w in words)
    tail = re.sub(r"[^A-Za-z0-9]", "", name).upper()[-6:]
    return (initials + tail)[:16]


def _john_hancock_holdings(text: str) -> list:
    """Pull funds from JH 'What investment options make up your account' table.

    Each line:  <fund name> <cur%> <ongoing%> <units1> <units2> <unitval1> <unitval2> <val1> <val2>
    e.g.  '500 Index Fund 20.42 0.00 132.697495 132.508703 100.543527 103.211000 13,341.88 13,676.37'
    We want the fund name, the current %, and the LAST value (current value).
    """
    start = re.search(r"What investment options make up your account", text)
    if not start:
        return []
    end = re.search(r"Total account\b", text[start.end():])
    block = text[start.end(): start.end() + (end.start() if end else 6000)]

    holdings = []
    # name then 8 numeric columns; allow $ on unit values; commas in values.
    # The cur%/ongoing% columns may carry a literal '%' (e.g. '20.30%'); fund names may
    # start with a digit ('500 Index Fund'); both happen on the two biggest holdings.
    pat = re.compile(
        r"^([A-Za-z0-9][A-Za-z0-9 .&'/-]+?)\s+"
        r"(\d{1,3}\.\d{2})%?\s+(\d{1,3}\.\d{2})%?\s+"       # cur%, ongoing% (optional %)
        r"([\d.]+)\s+([\d.]+)\s+"                            # units1, units2
        r"\$?([\d,.]+)\s+\$?([\d,.]+)\s+"                    # unitval1, unitval2
        r"\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})\s*$",      # val1, val2 (current = last; $ optional)
        re.MULTILINE,
    )
    seen = set()
    for m in pat.finditer(block):
        name = m.group(1).strip()
        low = name.lower()
        # Skip the allocation-strategy subtotals and the grand-total row, but NOT real
        # funds whose names happen to start with these words (e.g. "Total Stock Market
        # Index Fund"). Those bare strategy rows have no numeric columns after them and
        # so won't match `pat` anyway; the explicit guards here are the exact subtotals.
        if low in ("growth", "aggressive growth", "total account value", "total account"):
            continue
        cur_pct = float(m.group(2))
        cur_val = _parse_money(m.group(9))
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        holdings.append(ParsedHolding(
            ticker=_slug_ticker(name),
            fund_name=name,
            value=cur_val,
            weight_percent=cur_pct or None,
        ))
    return holdings


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

    # 'Ending Account Value  $X,XXX.XX' (spaced) or compact where balance is on the next line:
    #   'EndingAccountValueasof02/28 BeginningAccountValueasof02/01\n$8,054.47'
    # Newer format: the balance follows within ~150 non-$ chars of "Ending Account Value"
    eav_bal = re.search(
        r"Ending\s*Account\s*Value[^\$]{0,150}\$([\d,]+\.\d{2})",
        text, re.IGNORECASE | re.DOTALL,
    )
    if eav_bal:
        balance = _parse_money(eav_bal.group(1))

    # Older format: "EndingAccountValue BeginningAccountValue ...\nasofMM/DD ...\n$X,XXX.XX"
    # The literal "($)" in "Change($)" stops the above pattern; fall back to "EndingValue $X"
    if balance is None:
        ev_bal = re.search(r"EndingValue\s+\$([\d,]+\.\d{2})", text, re.IGNORECASE)
        if ev_bal:
            balance = _parse_money(ev_bal.group(1))

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

    # Account number last 4 — compact "AccountNumber\n1764-4800" or spaced "Account Number  XXXX-4800"
    acct_match = re.search(r"Account\s*Number\s+[\dX]+-(\d{4})", text)
    if not acct_match:
        # Fallback: first ####-#### pattern in the document
        acct_match2 = re.search(r"\b\d{4}-(\d{4})\b", text)
        acct_hint = acct_match2.group(1) if acct_match2 else None
    else:
        acct_hint = acct_match.group(1)

    return ParsedStatement(
        institution="Schwab",
        account_type_hint=acct_type,
        account_label=acct_label,
        statement_date=stmt_date,
        ending_balance=balance,
        account_number_hint=acct_hint,
        holdings=_schwab_holdings(text),
        period_contributions=_sum_period_contributions(text, "Schwab"),
    )


def _schwab_holdings(text: str) -> list:
    """Pull positions from the Schwab 'Top Account Holdings This Period' table.

    Lines look like:
        SWPPX SCHWABS&P500INDEX 1,474.22 37%
        VOO VANGUARDS&P500ETF 1,262.08 32%
        SWISX SCHWABINTERNATIONALINDE... 748.94 19%
        CHARLESSCHWABBANK 472.93 12%      <- cash sweep, no symbol; skip
    The block is bounded by 'Top Account Holdings' .. 'Gain or (Loss) Summary'.
    """
    start = re.search(r"Top Account Holdings", text)
    if not start:
        return []
    end = re.search(r"Gain or \(Loss\)|Positions - Summary", text[start.end():])
    block = text[start.end(): start.end() + (end.start() if end else 4000)]

    holdings = []
    # SYMBOL (uppercase/digits) then description then  value  percent%
    pat = re.compile(
        r"^([A-Z]{2,6})\s+(.+?)\s+([\d,]+\.\d{2})\s+(\d{1,3})%\s*$",
        re.MULTILINE,
    )
    for m in pat.finditer(block):
        sym, desc, val, pct = m.group(1), m.group(2).strip(), m.group(3), m.group(4)
        if sym in ("CUSIP", "SYMBOL"):
            continue
        holdings.append(ParsedHolding(
            ticker=sym,
            fund_name=desc.replace("...", "").strip(),
            value=_parse_money(val),
            weight_percent=float(pct),
        ))

    # Cash sweep row has no symbol — e.g. 'CHARLESSCHWABBANK 472.93 12%'. Capture it as
    # CASH so the holdings total reconciles with the account balance.
    cash = re.search(r"^([A-Z][A-Z &]+BANK)\s+([\d,]+\.\d{2})\s+(\d{1,3})%\s*$", block, re.MULTILINE)
    if cash:
        holdings.append(ParsedHolding(
            ticker="CASH",
            fund_name="Cash & Bank Sweep",
            value=_parse_money(cash.group(2)),
            weight_percent=float(cash.group(3)),
        ))
    return holdings


# ── Fidelity NetBenefits (401k) ───────────────────────────────────────────────

def _parse_fidelity(text: str) -> Optional[ParsedStatement]:
    """
    Fidelity NetBenefits 401(k) quarterly statement (HTML→PDF export).
    Key lines:
      Statement Period: 07/01/2025 to 09/30/2025
      Ending Balance $5,017.96
    """
    if "Fidelity" not in text and "fidelity" not in text.lower():
        return None

    # Statement date — end of period: "Statement Period: MM/DD/YYYY to MM/DD/YYYY"
    stmt_date = None
    period_match = re.search(
        r"Statement Period:\s+\S+\s+to\s+(\d{1,2}/\d{1,2}/\d{4})",
        text,
    )
    if period_match:
        try:
            stmt_date = datetime.strptime(period_match.group(1), "%m/%d/%Y").date()
        except ValueError:
            pass

    # Ending balance: "Ending Balance $5,017.96"
    balance = None
    eb_match = re.search(r"Ending Balance\s+\$?([\d,]+\.\d{2})", text)
    if eb_match:
        balance = _parse_money(eb_match.group(1))

    # Fidelity prints a stated time-weighted "Personal Rate of Return" for the period.
    prr = None
    prr_match = re.search(r"Personal Rate of Return\s*This Period\s*(-?\d{1,3}\.\d)%", text)
    if prr_match:
        prr = float(prr_match.group(1))

    return ParsedStatement(
        institution="Fidelity",
        account_type_hint="retirement_401k",
        account_label="Fidelity 401(k)",
        statement_date=stmt_date,
        ending_balance=balance,
        account_number_hint=None,
        holdings=_fidelity_holdings(text),
        personal_rate_of_return=prr,
        period_contributions=_sum_period_contributions(text, "Fidelity"),
        employer_contributions=_sum_employer_contributions(text, "Fidelity"),
    )


def _fidelity_holdings(text: str) -> list:
    """Pull funds from the Fidelity 'Market Value of Your Account' table.

    Lines (pdfplumber wraps the name across the price/value columns):
        TRP Retire
        2055 I 217.699 326.993 $23.05 $22.75 $5,017.96 $7,439.09
    We anchor on a row that ends with two share counts, two $prices, two $values
    and take the LAST value as current.  Name may be on the preceding line.
    """
    start = re.search(r"Market Value of Your Account", text)
    if not start:
        return []
    end = re.search(r"Account Totals|Remember that", text[start.end():])
    block = text[start.end(): start.end() + (end.start() if end else 3000)]
    lines = [ln.rstrip() for ln in block.splitlines() if ln.strip()]

    holdings = []
    row_pat = re.compile(
        r"^(.*?)([\d,]+\.\d{2,3})\s+([\d,]+\.\d{2,3})\s+"     # shares1 shares2
        r"\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})\s+"            # price1 price2
        r"\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})\s*$"           # value1 value2 (current=last)
    )
    for idx, ln in enumerate(lines):
        m = row_pat.match(ln)
        if not m:
            continue
        name = m.group(1).strip()
        # Name often spills onto the previous line ("TRP Retire" / "2055 I ...")
        if (not name or len(name) < 3) and idx > 0:
            name = (lines[idx - 1].strip() + " " + name).strip()
        if not name or name.lower().startswith(("blended", "account totals", "tier")):
            continue
        cur_val = _parse_money(m.group(7))
        holdings.append(ParsedHolding(
            ticker=_slug_ticker(name),
            fund_name=name,
            value=cur_val,
            weight_percent=None,
        ))
    return holdings


# ── Public entry point ─────────────────────────────────────────────────────────

def parse_statement(pdf_path: str) -> ParsedStatement:
    """Parse an account statement PDF and return extracted data."""
    text = _extract_text(pdf_path)

    for parser in (_parse_everbank, _parse_john_hancock, _parse_fidelity, _parse_schwab):
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
