"""Read-only inspection of MUNI prod DB before a statement import.

Prints: alembic head, whether balance_snapshots.contributions exists, every
account (id/name/type/owner), and per-account counts of snapshots + holdings
with date ranges. Used to diff prod state so the bulk importer adds no
duplicates and misses no accounts. Makes NO writes.
"""
import sqlite3
import sys

DB = sys.argv[1] if len(sys.argv) > 1 else "finance.db"
c = sqlite3.connect(DB)
cur = c.cursor()

print("=== alembic head ===")
try:
    cur.execute("SELECT version_num FROM alembic_version")
    print(cur.fetchall())
except Exception as e:
    print("ERR", e)

cur.execute("PRAGMA table_info(balance_snapshots)")
bs_cols = [r[1] for r in cur.fetchall()]
print("=== balance_snapshots columns ===")
print(bs_cols)
print("contributions column present:", "contributions" in bs_cols)

print("=== users ===")
cur.execute("SELECT id, username FROM users ORDER BY id")
users = {r[0]: r[1] for r in cur.fetchall()}
print(users)

print("=== accounts ===")
cur.execute("SELECT id, name, account_type, user_id, is_joint, balance FROM accounts ORDER BY id")
for r in cur.fetchall():
    owner = users.get(r[3], "?")
    print(f"  id={r[0]:<3} {r[1]:<14} {r[2]:<14} owner={owner:<10} joint={r[4]} bal={r[5]}")

print("=== balance_snapshots per account ===")
cur.execute("""
  SELECT account_id, COUNT(*), MIN(date), MAX(date)
  FROM balance_snapshots GROUP BY account_id ORDER BY account_id
""")
rows = cur.fetchall()
if not rows:
    print("  (none)")
for r in rows:
    print(f"  account_id={r[0]:<3} n={r[1]:<3} {r[2]} -> {r[3]}")

print("=== investment_holdings per account ===")
cur.execute("""
  SELECT account_id, COUNT(*), ROUND(SUM(current_value),2)
  FROM investment_holdings GROUP BY account_id ORDER BY account_id
""")
rows = cur.fetchall()
if not rows:
    print("  (none)")
for r in rows:
    print(f"  account_id={r[0]:<3} n={r[1]:<3} sum=${r[2]}")

c.close()
