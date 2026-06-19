"""
Bulk-import account statement PDFs into MUNI: balance snapshots + investment holdings.

Maps each statement folder to a MUNI account, parses every PDF (oldest -> newest so
the holdings/weights end up reflecting the latest statement), and applies it via the
same service the /statements/apply endpoint uses.

Usage (from backend/ with venv active):
    python import/import_statements.py --root "C:/Users/keato/Documents/Account Statements" [--dry-run]

Edit FOLDER_TO_ACCOUNT below to match your account ids (see `accounts` table).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal               # noqa: E402
from app.models.user import User                    # noqa: E402
from app.services.statement_parser import parse_statement  # noqa: E402
from app.services.statement_apply import apply_parsed_statement  # noqa: E402


# folder (relative to --root, case-insensitive) -> (account_id, owner_username)
FOLDER_TO_ACCOUNT = {
    "johnhancock": (1, "keaton"),
    "everbank": (2, "keaton"),
    "schwab": (3, "keaton"),
    "katherine/fidelity": (6, "katherine"),
    "katherine/schwab": (5, "katherine"),
}


def _match_folder(pdf: Path, root: Path) -> tuple[int, str] | None:
    rel = pdf.relative_to(root).as_posix().lower()
    # longest folder key first so 'katherine/schwab' beats 'schwab'
    for key in sorted(FOLDER_TO_ACCOUNT, key=len, reverse=True):
        if rel.startswith(key + "/") or ("/" + key + "/") in ("/" + rel):
            return FOLDER_TO_ACCOUNT[key]
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    root = Path(args.root)
    pdfs = sorted(p for p in root.rglob("*.pdf")) + sorted(p for p in root.rglob("*.PDF"))
    pdfs = sorted(set(pdfs))

    db = SessionLocal()
    users = {u.username: u for u in db.query(User).all()}

    # Parse all, group by account, sort by statement date (oldest first).
    parsed = []
    for pdf in pdfs:
        m = _match_folder(pdf, root)
        if not m:
            print(f"SKIP (no account mapping): {pdf.relative_to(root)}")
            continue
        acct_id, owner = m
        try:
            r = parse_statement(str(pdf))
        except Exception as e:
            print(f"ERROR parsing {pdf.name}: {e}")
            continue
        if not r.statement_date:
            print(f"SKIP (no date): {pdf.relative_to(root)} [{r.institution}]")
            continue
        parsed.append((acct_id, owner, r, pdf))

    parsed.sort(key=lambda t: (t[0], t[2].statement_date))

    for acct_id, owner, r, pdf in parsed:
        hold = [
            {"ticker": h.ticker, "fund_name": h.fund_name, "value": h.value, "weight_percent": h.weight_percent}
            for h in (r.holdings or [])
        ]
        line = (f"acct {acct_id} ({owner}) <- {pdf.name}: {r.institution} {r.statement_date} "
                f"bal=${r.ending_balance} holdings={len(hold)}"
                + (f" PRR={r.personal_rate_of_return}%" if r.personal_rate_of_return is not None else ""))
        if args.dry_run:
            print("[dry] " + line)
            continue
        res = apply_parsed_statement(
            db, users[owner], acct_id, r.statement_date.isoformat(),
            r.ending_balance, hold, r.period_contributions,
        )
        print(line + f"  -> snap={'y' if res['snapshot'] else 'n'} "
                     f"+{res['holdings_created']} ~{res['holdings_upserted']}")

    db.close()


if __name__ == "__main__":
    main()
