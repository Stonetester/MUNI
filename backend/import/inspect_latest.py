"""Read-only: show the latest few snapshots per investment account on prod,
so we can reason about whether the importer's 'latest statement authoritative'
holdings logic will fire. Makes NO writes."""
import sqlite3, sys
DB = sys.argv[1] if len(sys.argv) > 1 else "finance.db"
c = sqlite3.connect(DB); cur = c.cursor()
for acct in (1, 2, 3, 7, 10):
    print(f"=== account {acct} latest 4 snapshots ===")
    cur.execute("SELECT date, balance, notes FROM balance_snapshots WHERE account_id=? ORDER BY date DESC LIMIT 4", (acct,))
    for r in cur.fetchall():
        print(f"  {r[0]}  ${r[1]:<12} notes={r[2]!r}")
print("=== existing holdings (acct 3) ===")
cur.execute("SELECT ticker, fund_name, current_value, weight_percent FROM investment_holdings WHERE account_id=3")
for r in cur.fetchall():
    print(f"  {r[0]:<8} {(r[1] or '')[:28]:28} ${r[2]} w={r[3]}")
c.close()
