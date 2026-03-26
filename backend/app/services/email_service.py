"""
Email notification service.
Sends weekly spending digests and goal alerts via SMTP.

Config (environment variables):
  SMTP_HOST     - SMTP server (default: smtp.gmail.com)
  SMTP_PORT     - SMTP port (default: 587)
  SMTP_USER     - Sender email address
  SMTP_PASSWORD - Sender email password / app password
  SMTP_FROM     - Display name + email, e.g. "Muni <muni@yourdomain.com>"
"""
from __future__ import annotations

import calendar
import logging
import os
import smtplib
from datetime import date, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User

logger = logging.getLogger(__name__)

ASSET_TYPES = {"checking", "savings", "hysa", "brokerage", "ira", "401k", "hsa", "other"}
LIABILITY_TYPES = {"credit_card", "student_loan", "car_loan", "mortgage"}


def _smtp_config():
    return {
        "host": os.getenv("SMTP_HOST", "smtp.gmail.com"),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "user": os.getenv("SMTP_USER", ""),
        "password": os.getenv("SMTP_PASSWORD", ""),
        "from_addr": os.getenv("SMTP_FROM", os.getenv("SMTP_USER", "")),
    }


def send_email(to: str, subject: str, html_body: str, text_body: str = "") -> bool:
    """Send an email. Returns True on success."""
    cfg = _smtp_config()
    if not cfg["user"] or not cfg["password"]:
        logger.warning("SMTP not configured — email not sent. Set SMTP_USER and SMTP_PASSWORD.")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = cfg["from_addr"] or cfg["user"]
    msg["To"] = to

    if text_body:
        msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
            server.ehlo()
            server.starttls()
            server.login(cfg["user"], cfg["password"])
            server.sendmail(cfg["user"], [to], msg.as_string())
        logger.info("Email sent to %s: %s", to, subject)
        return True
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to, exc)
        return False


def _gather_week_data(user: User, db: Session):
    """Gather spending data for the past 7 days."""
    today = date.today()
    week_start = today - timedelta(days=7)

    txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.date >= week_start,
            Transaction.date <= today,
            Transaction.scenario_id.is_(None),
        )
        .all()
    )

    cats_map = {
        c.id: c.name
        for c in db.query(Category).filter(Category.user_id == user.id).all()
    }

    income = sum(t.amount for t in txns if t.amount > 0)
    spending = sum(abs(t.amount) for t in txns if t.amount < 0)
    by_cat: dict[str, float] = {}
    for t in txns:
        if t.amount < 0:
            name = cats_map.get(t.category_id, "Uncategorized")
            by_cat[name] = by_cat.get(name, 0.0) + abs(t.amount)

    top_cats = sorted(by_cat.items(), key=lambda x: -x[1])[:5]

    # Net worth
    accounts = db.query(Account).filter(Account.user_id == user.id).all()
    total_assets = sum(a.balance for a in accounts if a.account_type in ASSET_TYPES and a.balance > 0)
    total_liabilities = sum(abs(a.balance) for a in accounts if a.account_type in LIABILITY_TYPES or a.balance < 0)
    net_worth = total_assets - total_liabilities

    # Budget check for current month
    this_month_start = today.replace(day=1)
    _, last_day = calendar.monthrange(today.year, today.month)
    month_end = date(today.year, today.month, last_day)

    month_txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.date >= this_month_start,
            Transaction.date <= today,
            Transaction.scenario_id.is_(None),
        )
        .all()
    )
    month_spend_by_cat: dict[int, float] = {}
    for t in month_txns:
        if t.amount < 0 and t.category_id:
            month_spend_by_cat[t.category_id] = month_spend_by_cat.get(t.category_id, 0.0) + abs(t.amount)

    over_budget = []
    cats = db.query(Category).filter(
        Category.user_id == user.id,
        Category.kind == "expense",
        Category.budget_amount > 0,
    ).all()
    for cat in cats:
        actual = month_spend_by_cat.get(cat.id, 0.0)
        if actual > cat.budget_amount:
            over_budget.append((cat.name, actual, cat.budget_amount))

    return {
        "week_start": week_start.strftime("%b %d"),
        "today": today.strftime("%b %d, %Y"),
        "income": income,
        "spending": spending,
        "top_categories": top_cats,
        "net_worth": net_worth,
        "total_assets": total_assets,
        "total_liabilities": total_liabilities,
        "over_budget": over_budget,
    }


def build_weekly_digest_html(username: str, data: dict) -> str:
    """Build the HTML email for the weekly spending digest."""
    display = username.capitalize()

    # Category rows
    cat_rows = ""
    for cat, amt in data["top_categories"]:
        cat_rows += f"""
        <tr>
          <td style="padding:6px 12px;color:#a0aec0;">{cat}</td>
          <td style="padding:6px 12px;text-align:right;color:#e2e8f0;font-weight:600;">${amt:,.2f}</td>
        </tr>"""

    # Over-budget warnings
    budget_warnings = ""
    if data["over_budget"]:
        items = ""
        for cat, actual, budget in data["over_budget"]:
            pct = round(actual / budget * 100)
            items += f"<li style='margin:4px 0;'><strong>{cat}</strong>: ${actual:,.2f} spent of ${budget:,.2f} budget ({pct}%)</li>"
        budget_warnings = f"""
        <div style="margin:24px 0;padding:16px;background:#2d1a1a;border-left:4px solid #fc8181;border-radius:8px;">
          <p style="margin:0 0 8px;font-weight:700;color:#fc8181;">⚠️ Over-Budget Categories This Month</p>
          <ul style="margin:0;padding-left:20px;color:#e2e8f0;">{items}</ul>
        </div>"""

    savings_color = "#68d391" if data["income"] - data["spending"] >= 0 else "#fc8181"
    net_savings = data["income"] - data["spending"]

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#1a202c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;background:#6366f1;border-radius:12px;padding:10px 18px;">
        <span style="color:white;font-weight:800;font-size:20px;letter-spacing:1px;">Muni</span>
      </div>
      <p style="color:#a0aec0;margin:12px 0 0;font-size:14px;">Weekly Spending Digest</p>
      <p style="color:#718096;margin:4px 0 0;font-size:12px;">{data['week_start']} – {data['today']}</p>
    </div>

    <!-- Greeting -->
    <p style="color:#e2e8f0;font-size:16px;margin:0 0 24px;">Hey {display} 👋 — here's your weekly financial snapshot.</p>

    <!-- Stats grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px;">
      <div style="background:#2d3748;border-radius:12px;padding:16px;text-align:center;">
        <p style="margin:0;color:#a0aec0;font-size:11px;text-transform:uppercase;letter-spacing:.5px;">Income</p>
        <p style="margin:8px 0 0;color:#68d391;font-size:20px;font-weight:700;">${data['income']:,.0f}</p>
      </div>
      <div style="background:#2d3748;border-radius:12px;padding:16px;text-align:center;">
        <p style="margin:0;color:#a0aec0;font-size:11px;text-transform:uppercase;letter-spacing:.5px;">Spent</p>
        <p style="margin:8px 0 0;color:#fc8181;font-size:20px;font-weight:700;">${data['spending']:,.0f}</p>
      </div>
      <div style="background:#2d3748;border-radius:12px;padding:16px;text-align:center;">
        <p style="margin:0;color:#a0aec0;font-size:11px;text-transform:uppercase;letter-spacing:.5px;">Net</p>
        <p style="margin:8px 0 0;color:{savings_color};font-size:20px;font-weight:700;">${net_savings:,.0f}</p>
      </div>
    </div>

    <!-- Top spending -->
    <div style="background:#2d3748;border-radius:12px;margin-bottom:20px;overflow:hidden;">
      <div style="padding:14px 16px;border-bottom:1px solid #4a5568;">
        <p style="margin:0;color:#e2e8f0;font-weight:700;">Top Spending This Week</p>
      </div>
      <table style="width:100%;border-collapse:collapse;">{cat_rows if cat_rows else '<tr><td style="padding:16px;color:#718096;text-align:center;" colspan="2">No spending recorded</td></tr>'}
      </table>
    </div>

    <!-- Net worth -->
    <div style="background:#2d3748;border-radius:12px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 12px;color:#e2e8f0;font-weight:700;">Net Worth</p>
      <p style="margin:0;font-size:28px;font-weight:800;color:#6366f1;">${data['net_worth']:,.2f}</p>
      <p style="margin:6px 0 0;color:#718096;font-size:12px;">Assets ${data['total_assets']:,.0f} · Liabilities ${data['total_liabilities']:,.0f}</p>
    </div>

    {budget_warnings}

    <!-- Footer -->
    <div style="text-align:center;padding-top:24px;border-top:1px solid #2d3748;">
      <p style="color:#4a5568;font-size:12px;margin:0;">Muni — your personal finance tracker</p>
      <p style="color:#4a5568;font-size:11px;margin:4px 0 0;">Running locally on your Tailscale network</p>
    </div>
  </div>
</body>
</html>"""


def send_weekly_digest_for_user(user: User, email_address: str, db: Session) -> bool:
    """Gather data and send weekly digest email for a single user."""
    data = _gather_week_data(user, db)
    html = build_weekly_digest_html(user.username, data)
    subject = f"💰 Muni Weekly Digest — week of {data['week_start']}"
    return send_email(email_address, subject, html)


def send_weekly_digest_all():
    """Called by scheduler — sends digest to all configured users."""
    db = SessionLocal()
    try:
        users = db.query(User).all()
        for user in users:
            email = getattr(user, "notification_email", None) or user.email
            if email:
                send_weekly_digest_for_user(user, email, db)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Snapshot reminder email
# ---------------------------------------------------------------------------

# Account types that need periodic manual balance updates
_SNAPSHOT_ACCOUNT_TYPES = {"401k", "ira", "hysa", "savings", "student_loan", "brokerage", "hsa"}

_SNAPSHOT_WHY = {
    "401k": "Market drift — update quarterly so forecast reflects actual growth",
    "ira": "Market drift — update quarterly so forecast reflects actual growth",
    "brokerage": "Market drift — update quarterly",
    "hysa": "Interest compounds monthly — update monthly for accurate net worth",
    "savings": "Primary cash hub — update monthly for accurate cash flow",
    "student_loan": "Balance shrinks each payment — update when you receive your statement",
    "hsa": "Contributions + investment growth — update quarterly",
}

_SNAPSHOT_FREQUENCY = {
    "401k": "quarterly",
    "ira": "quarterly",
    "brokerage": "quarterly",
    "hysa": "monthly",
    "savings": "monthly",
    "student_loan": "monthly",
    "hsa": "quarterly",
}

_STALE_DAYS = {
    "monthly": 35,
    "quarterly": 95,
}


def _gather_snapshot_data(user: User, db: Session) -> list[dict]:
    """Find accounts that need balance updates and return their status."""
    from app.models.balance_snapshot import BalanceSnapshot

    accounts = db.query(Account).filter(
        Account.user_id == user.id,
        Account.is_active == True,
        Account.account_type.in_(_SNAPSHOT_ACCOUNT_TYPES),
    ).all()

    today = date.today()
    stale = []

    for acc in accounts:
        freq = _SNAPSHOT_FREQUENCY.get(acc.account_type, "monthly")
        threshold = _STALE_DAYS[freq]

        # Find the most recent snapshot for this account
        latest = (
            db.query(BalanceSnapshot)
            .filter(BalanceSnapshot.account_id == acc.id)
            .order_by(BalanceSnapshot.date.desc())
            .first()
        )

        if latest:
            days_ago = (today - latest.date).days
            last_updated = latest.date.strftime("%b %d, %Y")
        else:
            days_ago = 9999
            last_updated = "Never updated"

        if days_ago >= threshold:
            stale.append({
                "name": acc.name,
                "account_type": acc.account_type,
                "balance": acc.balance,
                "last_updated": last_updated,
                "days_ago": days_ago,
                "why": _SNAPSHOT_WHY.get(acc.account_type, "Update to keep forecasts accurate"),
                "frequency": freq,
            })

    stale.sort(key=lambda x: -x["days_ago"])
    return stale


def build_snapshot_reminder_html(username: str, stale_accounts: list[dict]) -> str:
    """Build the HTML email for the snapshot reminder."""
    display = username.capitalize()

    rows = ""
    for acc in stale_accounts:
        days_label = "Never" if acc["days_ago"] >= 9999 else f"{acc['days_ago']}d ago"
        freq_badge = acc["frequency"].capitalize()
        rows += f"""
        <tr style="border-bottom:1px solid #4a5568;">
          <td style="padding:12px 14px;">
            <div style="color:#e2e8f0;font-weight:600;">{acc['name']}</div>
            <div style="color:#718096;font-size:11px;margin-top:2px;">{acc['why']}</div>
          </td>
          <td style="padding:12px 14px;text-align:center;color:#a0aec0;font-size:12px;white-space:nowrap;">
            {acc['last_updated']}<br><span style="color:#fc8181;">{days_label}</span>
          </td>
          <td style="padding:12px 14px;text-align:right;color:#68d391;font-weight:600;white-space:nowrap;">
            ${acc['balance']:,.2f}
          </td>
          <td style="padding:12px 14px;text-align:center;">
            <span style="background:#2d3748;border:1px solid #4a5568;border-radius:9999px;padding:2px 8px;color:#a0aec0;font-size:10px;">{freq_badge}</span>
          </td>
        </tr>"""

    if not rows:
        return ""  # nothing stale — no email

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#1a202c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">

    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;background:#6366f1;border-radius:12px;padding:10px 18px;">
        <span style="color:white;font-weight:800;font-size:20px;letter-spacing:1px;">Muni</span>
      </div>
      <p style="color:#a0aec0;margin:12px 0 0;font-size:14px;">Balance Snapshot Reminder</p>
    </div>

    <p style="color:#e2e8f0;font-size:16px;margin:0 0 6px;">Hey {display} 👋</p>
    <p style="color:#a0aec0;font-size:14px;margin:0 0 24px;">
      The accounts below have stale balances. Updating them keeps your net worth and forecast accurate.
    </p>

    <div style="background:#2d3748;border-radius:12px;overflow:hidden;margin-bottom:24px;">
      <div style="padding:14px 16px;border-bottom:1px solid #4a5568;">
        <p style="margin:0;color:#e2e8f0;font-weight:700;">Accounts Needing Updates</p>
        <p style="margin:4px 0 0;color:#718096;font-size:12px;">{len(stale_accounts)} account{'s' if len(stale_accounts) != 1 else ''} with stale balances</p>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid #4a5568;">
            <th style="padding:8px 14px;text-align:left;color:#718096;font-size:11px;font-weight:600;text-transform:uppercase;">Account</th>
            <th style="padding:8px 14px;text-align:center;color:#718096;font-size:11px;font-weight:600;text-transform:uppercase;">Last Updated</th>
            <th style="padding:8px 14px;text-align:right;color:#718096;font-size:11px;font-weight:600;text-transform:uppercase;">Balance</th>
            <th style="padding:8px 14px;text-align:center;color:#718096;font-size:11px;font-weight:600;text-transform:uppercase;">Freq</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>

    <div style="background:#1a2744;border:1px solid #3b4f7a;border-radius:12px;padding:16px;margin-bottom:24px;">
      <p style="margin:0 0 8px;color:#93c5fd;font-weight:600;font-size:13px;">📍 How to update</p>
      <p style="margin:0;color:#a0aec0;font-size:13px;">Go to <strong style="color:#e2e8f0;">Accounts</strong> → click any account → <strong style="color:#e2e8f0;">View History</strong> → <strong style="color:#e2e8f0;">Add Snapshot</strong>. Enter today's balance from your bank's app or statement.</p>
    </div>

    <div style="text-align:center;padding-top:24px;border-top:1px solid #2d3748;">
      <p style="color:#4a5568;font-size:12px;margin:0;">Muni — your personal finance tracker</p>
    </div>
  </div>
</body>
</html>"""


def send_snapshot_reminder_for_user(user: User, email_address: str, db: Session) -> bool:
    """Gather stale accounts and send snapshot reminder for a single user."""
    stale = _gather_snapshot_data(user, db)
    if not stale:
        return True  # nothing to remind about — success
    html = build_snapshot_reminder_html(user.username, stale)
    if not html:
        return True
    subject = f"📊 Muni — {len(stale)} account{'s' if len(stale) != 1 else ''} need balance updates"
    return send_email(email_address, subject, html)


def send_snapshot_reminders_all():
    """Called by scheduler — sends snapshot reminders to all users with email configured."""
    db = SessionLocal()
    try:
        users = db.query(User).all()
        for user in users:
            email = getattr(user, "notification_email", None) or user.email
            if email:
                send_snapshot_reminder_for_user(user, email, db)
    finally:
        db.close()
