"""
check_dupes.py — find and optionally remove duplicate transactions.

Checks two kinds of duplicates:
  1. Content dupes: same (date + description + amount) regardless of source
  2. Tab-name dupes: transactions from two tabs that represent the same
     calendar month (e.g. import_source="sheets:APR24" vs "sheets:APR2024")

Usage:
    python check_dupes.py              # dry-run report only
    python check_dupes.py --fix        # delete duplicates (keeps best copy)
    python check_dupes.py --user keaton
    python check_dupes.py --fix --user keaton
"""

import argparse
import hashlib
import re
import sys
from collections import defaultdict
from pathlib import Path

# -- Bootstrap SQLAlchemy so we can import app models --------------------------
ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DB_PATH = ROOT / "finance.db"
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
Session = sessionmaker(bind=engine)

from app.models.transaction import Transaction  # noqa: E402
from app.models.user import User                # noqa: E402


# -- Month-key normalizer (same logic as google_sheets_sync.py) ----------------
_MONTH_ABBR = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

def _tab_to_month_key(tab_name: str):
    """'APR24' -> '2024-04', 'APR2024' -> '2024-04', None if no match."""
    m = re.match(
        r"^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*[\s\-_]*(\d{2,4})$",
        tab_name.strip(),
        re.IGNORECASE,
    )
    if not m:
        return None
    month_num = _MONTH_ABBR.get(m.group(1).lower()[:3])
    if not month_num:
        return None
    year_str = m.group(2)
    year = (2000 + int(year_str)) if len(year_str) == 2 else int(year_str)
    return f"{year:04d}-{month_num:02d}"


def _content_hash(txn: Transaction) -> str:
    key = f"{txn.date}|{(txn.description or '').strip().lower()}|{round(txn.amount, 2)}"
    return hashlib.sha256(key.encode()).hexdigest()


def _tab_from_source(import_source: str):
    """'sheets:APR24' -> 'APR24', anything else -> None."""
    if import_source and import_source.startswith("sheets:"):
        return import_source[len("sheets:"):]
    return None


# -- Main ----------------------------------------------------------------------

def run(fix: bool, username: str | None):
    db = Session()
    try:
        # Resolve user filter
        users = db.query(User).all()
        if username:
            users = [u for u in users if u.username.lower() == username.lower()]
            if not users:
                print(f"User '{username}' not found. Available: {[u.username for u in db.query(User).all()]}")
                return

        for user in users:
            print(f"\n{'='*60}")
            print(f"User: {user.username} (id={user.id})")
            print(f"{'='*60}")

            txns = (
                db.query(Transaction)
                .filter(Transaction.user_id == user.id)
                .order_by(Transaction.date, Transaction.id)
                .all()
            )
            print(f"Total transactions: {len(txns)}")

            # -- 1. Content duplicates --------------------------------------
            hash_groups: dict[str, list[Transaction]] = defaultdict(list)
            for t in txns:
                hash_groups[_content_hash(t)].append(t)

            content_dupes = {h: g for h, g in hash_groups.items() if len(g) > 1}

            print(f"\n-- Content duplicates (same date + description + amount) --")
            if not content_dupes:
                print("  None found OK")
            else:
                print(f"  Found {len(content_dupes)} duplicate group(s):\n")
                to_delete_ids = []
                for h, group in sorted(content_dupes.items(), key=lambda x: x[1][0].date):
                    # Keep the one with a sheets: source (most traceable), or lowest id
                    preferred = next(
                        (t for t in group if t.import_source and t.import_source.startswith("sheets:")),
                        group[0],
                    )
                    extras = [t for t in group if t.id != preferred.id]
                    to_delete_ids.extend(t.id for t in extras)

                    print(f"  {group[0].date}  {group[0].description[:40]:<40}  ${group[0].amount:>10.2f}")
                    for t in group:
                        marker = "  KEEP  " if t.id == preferred.id else "  DEL   "
                        print(f"    {marker} id={t.id:<6} source={t.import_source or 'manual'}")
                    print()

                if fix and to_delete_ids:
                    db.query(Transaction).filter(Transaction.id.in_(to_delete_ids)).delete(synchronize_session=False)
                    db.commit()
                    print(f"  OK Deleted {len(to_delete_ids)} duplicate transaction(s).")
                elif to_delete_ids:
                    print(f"  (dry-run) Would delete {len(to_delete_ids)} transaction(s). Run with --fix to apply.")

            # -- 2. Tab-name month duplicates ------------------------------─
            print(f"\n-- Tab-name month duplicates (APR24 vs APR2024 style) --")

            # Group all distinct tabs by their canonical month key
            tab_month_map: dict[str, list[str]] = defaultdict(list)  # month_key -> [tab, ...]
            for t in txns:
                tab = _tab_from_source(t.import_source or "")
                if not tab:
                    continue
                key = _tab_to_month_key(tab)
                if key and tab not in tab_month_map[key]:
                    tab_month_map[key].append(tab)

            conflict_months = {k: v for k, v in tab_month_map.items() if len(v) > 1}

            if not conflict_months:
                print("  None found OK")
            else:
                print(f"  Found {len(conflict_months)} month(s) with multiple tab names:\n")
                to_delete_ids = []

                for month_key, tabs in sorted(conflict_months.items()):
                    # Prefer the tab with the longest name (APR2024 > APR24) as the "winner"
                    winner_tab = max(tabs, key=len)
                    loser_tabs = [t for t in tabs if t != winner_tab]

                    print(f"  Month {month_key}: tabs = {tabs}")
                    print(f"    Keep source: sheets:{winner_tab}")
                    for loser in loser_tabs:
                        loser_txns = [t for t in txns if t.import_source == f"sheets:{loser}"]
                        winner_txns = [t for t in txns if t.import_source == f"sheets:{winner_tab}"]
                        print(f"    Dupe source: sheets:{loser} ({len(loser_txns)} txns)")

                        # Only mark loser txns for deletion if the winner tab has ANY data
                        # for the same month (otherwise we'd lose the only copy)
                        if winner_txns:
                            to_delete_ids.extend(t.id for t in loser_txns)
                            print(f"      -> {len(loser_txns)} transaction(s) flagged for deletion")
                        else:
                            print(f"      -> Skipping: winner tab has no data, keeping loser copy")
                    print()

                if fix and to_delete_ids:
                    db.query(Transaction).filter(Transaction.id.in_(to_delete_ids)).delete(synchronize_session=False)
                    db.commit()
                    print(f"  OK Deleted {len(to_delete_ids)} tab-dupe transaction(s).")
                elif to_delete_ids:
                    print(f"  (dry-run) Would delete {len(to_delete_ids)} transaction(s). Run with --fix to apply.")

            # -- 3. Summary of all sheets sources --------------------------
            print(f"\n-- Sheets import sources found --")
            # Re-query in case any transactions were deleted above
            txns = (
                db.query(Transaction)
                .filter(Transaction.user_id == user.id)
                .order_by(Transaction.date, Transaction.id)
                .all()
            )
            all_tabs: dict[str, int] = defaultdict(int)
            for t in txns:
                if t.import_source and t.import_source.startswith("sheets:"):
                    all_tabs[t.import_source] += 1
            if all_tabs:
                for src, count in sorted(all_tabs.items()):
                    key = _tab_to_month_key(_tab_from_source(src) or "")
                    flag = f"  <- month {key}" if key else ""
                    print(f"  {src:<30} {count:>4} txns{flag}")
            else:
                print("  No sheets-sourced transactions found.")

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Check and fix duplicate transactions.")
    parser.add_argument("--fix", action="store_true", help="Actually delete duplicates (default: dry-run)")
    parser.add_argument("--user", help="Limit to a specific username")
    args = parser.parse_args()

    if args.fix:
        print("!!  FIX MODE — duplicates will be deleted.")
    else:
        print("DRY-RUN mode — no changes will be made. Pass --fix to apply.\n")

    run(fix=args.fix, username=args.user)
