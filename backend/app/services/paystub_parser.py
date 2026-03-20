"""
Paystub PDF parser using pdfplumber.
Tuned for Paylocity format (Air Combat Effectiveness Consulting).
Falls back to pytesseract for scanned/image PDFs.
"""
from __future__ import annotations

import re
import logging
from datetime import datetime, date
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def _parse_money(raw: str) -> float:
    """Convert '$1,234.56' or '1234.56' to float."""
    try:
        return float(re.sub(r"[,$\s]", "", raw))
    except (ValueError, TypeError):
        return 0.0


def _parse_date_str(raw: str) -> Optional[date]:
    """Parse 'March 6, 2026' or 'February 16, 2026' style dates."""
    if not raw:
        return None
    raw = raw.strip()
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _extract_with_pdfplumber(pdf_path: str) -> str:
    """Extract all text from a PDF using pdfplumber."""
    import pdfplumber
    text_parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                text_parts.append(t)
    return "\n".join(text_parts)


def _extract_with_tesseract(pdf_path: str) -> str:
    """Fallback OCR for scanned PDFs."""
    try:
        from pdf2image import convert_from_path
        import pytesseract
        pages = convert_from_path(pdf_path, dpi=300)
        return "\n".join(pytesseract.image_to_string(p) for p in pages)
    except ImportError:
        raise RuntimeError(
            "Tesseract fallback requires: pip install pdf2image pytesseract "
            "and Tesseract binary (winget install UB-Mannheim.TesseractOCR)"
        )


def _re_val(pattern: str, text: str, group: int = 1, flags: int = 0) -> str:
    """Return first regex match group or empty string."""
    m = re.search(pattern, text, re.MULTILINE | flags)
    return m.group(group).strip() if m else ""


def parse_paylocity(text: str) -> dict:
    """
    Parse Paylocity paystub text into a structured dict.
    All numeric fields default to 0.0 if not found.
    """
    d: dict = {}

    # --- Header ---
    d["voucher_number"] = _re_val(r"Voucher Number\s+(\d+)", text)
    d["employer"] = _re_val(r"^(.+?)\s*\n.*Earnings Statement", text, flags=re.DOTALL) or \
                    _re_val(r"^([A-Z][A-Za-z0-9 &,.-]+)\n", text)

    raw_pay_date = _re_val(r"Check Date\s+(\w+ \d+, \d{4})", text)
    raw_period_start = _re_val(r"Period Beginning\s+(\w+ \d+, \d{4})", text)
    raw_period_end = _re_val(r"Period Ending\s+(\w+ \d+, \d{4})", text)

    d["pay_date"] = _parse_date_str(raw_pay_date)
    d["period_start"] = _parse_date_str(raw_period_start)
    d["period_end"] = _parse_date_str(raw_period_end)

    # --- Net & taxable income ---
    d["net_pay"] = _parse_money(_re_val(r"Net Pay\s+([\d,]+\.\d{2})", text))
    d["fed_taxable_income"] = _parse_money(_re_val(r"Fed Taxable Income\s+([\d,]+\.\d{2})", text))
    d["salary_per_period"] = _parse_money(_re_val(r"Salary\s+\$([\d,]+\.\d{2})", text))

    # --- Earnings ---
    d["gross_pay"] = _parse_money(_re_val(r"Gross Earnings\s+[\d.]+\s+([\d,]+\.\d{2})", text))
    d["ytd_gross"] = _parse_money(_re_val(r"Gross Earnings\s+[\d.]+\s+[\d,]+\.\d{2}\s+([\d,]+\.\d{2})", text))

    d["regular_pay"] = _parse_money(_re_val(r"Regular\s+[\d.]+\s+[\d.]+\s+([\d,]+\.\d{2})", text))
    d["holiday_pay"] = _parse_money(_re_val(r"Holiday\s+[\d.]+\s+[\d.]+\s+([\d,]+\.\d{2})", text))
    d["overtime_pay"] = _parse_money(_re_val(r"Overtime\s+[\d.]+\s+[\d.]+\s+([\d,]+\.\d{2})", text))

    # Bonus / supplemental pay — Paylocity labels these several ways
    bonus_pay = _parse_money(
        _re_val(r"(?:Bonus|Supp Bonus|Performance Bonus|Annual Bonus|Supplemental)\s+[\d.]+\s+[\d.]+\s+([\d,]+\.\d{2})", text, flags=re.IGNORECASE)
        or _re_val(r"(?:Bonus|Supp Bonus|Performance Bonus|Annual Bonus|Supplemental)\s+([\d,]+\.\d{2})", text, flags=re.IGNORECASE)
    )
    d["bonus_pay"] = bonus_pay

    # Classify pay type: if there's a meaningful bonus line and little/no regular pay
    # it's a bonus paystub; if bonus is non-zero alongside regular pay it's still
    # worth flagging as "bonus" so the UI can display it correctly.
    if bonus_pay > 0:
        d["pay_type"] = "bonus"
    else:
        d["pay_type"] = "regular"

    # --- Employer 401k Safe Harbor (the "401 Safe H" line) ---
    d["employer_401k"] = _parse_money(_re_val(r"401 Safe H\s+[\d.]+\s+[\d.]+\s+([\d,]+\.\d{2})", text))
    d["ytd_401k_employer"] = _parse_money(_re_val(r"401 Safe H\s+[\d.]+\s+[\d.]+\s+[\d,]+\.\d{2}\s+([\d,]+\.\d{2})", text))

    # --- Taxes ---
    d["tax_federal"] = _parse_money(_re_val(r"\bFITW\s+([\d,]+\.\d{2})", text))
    d["ytd_federal_tax"] = _parse_money(_re_val(r"\bFITW\s+[\d,]+\.\d{2}\s+([\d,]+\.\d{2})", text))

    d["tax_state"] = _parse_money(_re_val(r"\bMD\s+([\d,]+\.\d{2})", text))
    d["ytd_state_tax"] = _parse_money(_re_val(r"\bMD\s+[\d,]+\.\d{2}\s+([\d,]+\.\d{2})", text))

    d["tax_county"] = _parse_money(_re_val(r"MD-CAL1\s+([\d,]+\.\d{2})", text))
    d["tax_social_security"] = _parse_money(_re_val(r"\bSS\s+([\d,]+\.\d{2})", text))
    d["ytd_ss"] = _parse_money(_re_val(r"\bSS\s+[\d,]+\.\d{2}\s+([\d,]+\.\d{2})", text))

    d["tax_medicare"] = _parse_money(_re_val(r"\bMED\s+([\d,]+\.\d{2})", text))
    d["ytd_medicare"] = _parse_money(_re_val(r"\bMED\s+[\d,]+\.\d{2}\s+([\d,]+\.\d{2})", text))

    d["tax_total"] = _parse_money(_re_val(r"^Taxes\s+([\d,]+\.\d{2})", text))
    d["ytd_taxes_total"] = _parse_money(_re_val(r"^Taxes\s+[\d,]+\.\d{2}\s+([\d,]+\.\d{2})", text))

    # --- Deductions ---
    d["deduction_401k"] = _parse_money(_re_val(r"\b401K\s+([\d,]+\.\d{2})", text))
    d["ytd_401k_employee"] = _parse_money(_re_val(r"\b401K\s+[\d,]+\.\d{2}\s+([\d,]+\.\d{2})", text))

    d["deduction_dental"] = _parse_money(_re_val(r"\bDental\s+([\d,]+\.\d{2})", text))
    d["deduction_vision"] = _parse_money(_re_val(r"\bVISN\s+([\d,]+\.\d{2})", text))
    d["deduction_ad_and_d"] = _parse_money(_re_val(r"\bAD&D\s+([\d,]+\.\d{2})", text))
    d["deduction_std_ltd"] = _parse_money(_re_val(r"ER STD/LTD\s+([\d,]+\.\d{2})", text))

    gtl = _parse_money(_re_val(r"\bGTL\s+([\d,]+\.\d{2})", text))
    vlife = _parse_money(_re_val(r"\bVLIFE\s+([\d,]+\.\d{2})", text))
    d["deduction_life_insurance"] = round(gtl + vlife, 2)

    d["deduction_total"] = _parse_money(_re_val(r"^Deductions\s+([\d,]+\.\d{2})", text))

    return d


def parse_paystub_pdf(pdf_path: str) -> dict:
    """
    Main entry point. Tries pdfplumber first; falls back to tesseract.
    Returns parsed dict with all fields + 'parse_method' and 'raw_text'.
    """
    parse_method = "pdfplumber"
    try:
        import pdfplumber  # noqa: F401 – just check it's available
        text = _extract_with_pdfplumber(pdf_path)
    except ImportError:
        raise RuntimeError("pdfplumber not installed. Run: pip install pdfplumber")
    except Exception as e:
        logger.warning(f"pdfplumber failed ({e}), trying tesseract")
        text = _extract_with_tesseract(pdf_path)
        parse_method = "tesseract"

    # If pdfplumber returned very little text it's probably a scanned PDF
    if len(text.strip()) < 100:
        logger.info("Very little text extracted — trying tesseract OCR fallback")
        try:
            text = _extract_with_tesseract(pdf_path)
            parse_method = "tesseract"
        except Exception:
            pass  # Stick with whatever pdfplumber gave us

    result = parse_paylocity(text)
    result["parse_method"] = parse_method
    result["raw_text_excerpt"] = text[:500]  # for debugging in the review form
    return result
