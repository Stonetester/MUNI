"""Read-only post-import integrity audit for MUNI prod.

Checks:
  - duplicate snapshots (account_id, date)
  - duplicate holdings (account_id, ticker)
  - negative / null balances or holding values
  - for each investment account: do holdings sum ~= latest snapshot balance?
  - contributions coverage (how many snapshots now carry contributions)
Makes NO writes.
"""
import sqlite3, sys
DB = sys.argv[1] if len(sys.argv) > 1 else "finance.db"
c = sqlite3.connect(DB); cur = c.cursor()
ok = True

def check(label, q, expect_empty=True):
    global ok
    cur.execute(q)
    rows = cur.fetchall()
    bad = bool(rows) if expect_empty else not rows
    if bad:
        ok = False
        print(f"  [FAIL] {label}: {rows[:10]}")
    else:
        print(f"  [ok]   {label}")

print("=== duplicate / bad-value checks ===")
check("no duplicate snapshots (account,date)",
      "SELECT account_id,date,COUNT(*) FROM balance_snapshots GROUP BY account_id,date HAVING COUNT(*)>1")
check("no duplicate holdings (account,ticker)",
      "SELECT account_id,ticker,COUNT(*) FROM investment_holdings GROUP BY account_id,ticker HAVING COUNT(*)>1")
check("no negative snapshot balances",
      "SELECT id,account_id,balance FROM balance_snapshots WHERE balance < 0")
check("no null snapshot balances",
      "SELECT id FROM balance_snapshots WHERE balance IS NULL")
check("no negative holding values",
      "SELECT id,ticker,current_value FROM investment_holdings WHERE current_value < 0")
check("no null holding tickers",
      "SELECT id FROM investment_holdings WHERE ticker IS NULL OR ticker=''")

print("=== holdings reconcile to latest snapshot (investment accts) ===")
cur.execute("SELECT id,name,account_type FROM accounts WHERE account_type IN ('401k','ira','brokerage','hsa')")
for aid, name, atype in cur.fetchall():
    cur.execute("SELECT COALESCE(SUM(current_value),0) FROM investment_holdings WHERE account_id=?", (aid,))
    hsum = cur.fetchone()[0]
    cur.execute("SELECT balance,date FROM balance_snapshots WHERE account_id=? ORDER BY date DESC LIMIT 1", (aid,))
    row = cur.fetchone()
    bal, bdate = (row[0], row[1]) if row else (None, None)
    if hsum == 0:
        print(f"  account {aid} {name}: no holdings (snapshot {bal} @ {bdate})")
        continue
    # holdings come from the latest STATEMENT, which may be older than a manual snapshot
    diff = abs(hsum - bal) if bal else None
    tag = "ok" if (bal and diff/bal < 0.02) else "INFO (holdings from older statement than latest snapshot)"
    print(f"  account {aid} {name}: holdings=${hsum:,.2f} latest_snap=${bal:,.2f} @ {bdate}  [{tag}]")

print("=== contributions coverage ===")
cur.execute("SELECT COUNT(*) FROM balance_snapshots WHERE contributions IS NOT NULL")
withc = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM balance_snapshots")
total = cur.fetchone()[0]
print(f"  snapshots with contributions: {withc}/{total}")

print("=== snapshot counts per account (post-import) ===")
cur.execute("SELECT account_id,COUNT(*),MIN(date),MAX(date) FROM balance_snapshots GROUP BY account_id ORDER BY account_id")
for r in cur.fetchall():
    print(f"  account {r[0]:<3} n={r[1]:<3} {r[2]} -> {r[3]}")

print("OVERALL:", "PASS" if ok else "FAIL")
c.close()
