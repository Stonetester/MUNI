"""End-of-day household spend digest → Slack.

Reads the day's card/checking activity from the SimpleFIN feed, groups it by
owner (Keaton / Katherine / Joint), and posts a short message to the Slack
spend channel so both partners can hand-enter the purchases into their
Google Sheets. Feed data is NEVER written into `transactions` — the sheets
stay the source of truth; this is a reminder mirror, not an importer.

Slack path: direct `chat.postMessage` with native mrkdwn (*bold*, single
asterisks) — same delivery style as the athena-agents scripts. No tables.
A dead feed degrades to a one-line notice, never a crash.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import requests
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.connected_account import ConnectedAccount, SimplefinConnection
from app.services import simplefin

logger = logging.getLogger(__name__)

# Never let a digest window grow unbounded if digests were off for a while.
_MAX_WINDOW_DAYS = 3


def _tz() -> ZoneInfo:
    return ZoneInfo(settings.DIGEST_TIMEZONE)


def get_connection(db: Session) -> SimplefinConnection | None:
    return db.query(SimplefinConnection).first()


def refresh_accounts(db: Session, connection: SimplefinConnection, payload: dict) -> None:
    """Upsert the account list from a SimpleFIN payload (new accounts start as Joint)."""
    known = {a.simplefin_id: a for a in connection.accounts}
    for acc in payload.get("accounts", []):
        sf_id = acc.get("id")
        if not sf_id:
            continue
        row = known.get(sf_id)
        if row is None:
            row = ConnectedAccount(
                connection_id=connection.id,
                simplefin_id=sf_id,
                name=acc.get("name") or "Unnamed account",
                created_at=datetime.utcnow(),
            )
            db.add(row)
        row.org_name = (acc.get("org") or {}).get("name") or (acc.get("org") or {}).get("domain")
        row.name = acc.get("name") or row.name
        row.balance = acc.get("balance")
        row.currency = acc.get("currency")
        bal_date = acc.get("balance-date")
        if bal_date:
            row.balance_date = datetime.utcfromtimestamp(int(bal_date))
    db.commit()


def gather_digest_data(db: Session, since: datetime | None = None) -> dict:
    """Fetch feed activity since `since` (default: start of today, local) and
    group it for the digest. Returns a plain dict so it doubles as the
    /connected/today API preview."""
    connection = get_connection(db)
    if connection is None:
        return {"connected": False, "groups": [], "errors": [], "total_spend": 0.0, "credits": []}

    tz = _tz()
    now = datetime.now(tz)
    if since is None:
        since = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif since.tzinfo is None:
        since = since.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz)
    floor = now - timedelta(days=_MAX_WINDOW_DAYS)
    if since < floor:
        since = floor

    errors: list[str] = []
    try:
        payload = simplefin.fetch_accounts(connection.access_url, start=since, end=now)
        refresh_accounts(db, connection, payload)
        connection.last_synced_at = datetime.utcnow()
        connection.last_error = None
        errors.extend(str(e) for e in payload.get("errors", []))
    except simplefin.SimplefinError as e:
        connection.last_error = str(e)
        db.commit()
        return {"connected": True, "groups": [], "errors": [str(e)], "total_spend": 0.0, "credits": []}
    db.commit()

    by_sfid = {a.simplefin_id: a for a in connection.accounts}
    today_local = now.date()

    # owner key → {"label", "spend", "txns": [...]}
    groups: dict[str, dict] = {}
    credits: list[dict] = []
    total_spend = 0.0

    for acc in payload.get("accounts", []):
        row = by_sfid.get(acc.get("id"))
        if row is None or not row.enabled:
            continue
        owner_label = (row.user.username.capitalize() if row.user else "Joint")
        acc_label = row.nickname or row.name
        for txn in acc.get("transactions", []):
            ts = simplefin.txn_timestamp(txn)
            when = datetime.fromtimestamp(ts, tz) if ts else now
            amount = simplefin.txn_amount(txn)
            entry = {
                "description": txn.get("description") or txn.get("payee") or "Unknown",
                "amount": abs(amount),
                "account": acc_label,
                "pending": bool(txn.get("pending")),
                "date": when.date().isoformat(),
                "is_today": when.date() == today_local,
            }
            if amount < 0:
                g = groups.setdefault(owner_label, {"label": owner_label, "spend": 0.0, "txns": []})
                g["spend"] += abs(amount)
                g["txns"].append(entry)
                total_spend += abs(amount)
            elif amount > 0:
                credits.append(entry)

    # Stable order: Keaton, Katherine, Joint — i.e. users first, joint last.
    ordered = sorted(groups.values(), key=lambda g: (g["label"] == "Joint", g["label"]))
    for g in ordered:
        g["spend"] = round(g["spend"], 2)
        g["txns"].sort(key=lambda t: t["date"])
    return {
        "connected": True,
        "groups": ordered,
        "errors": errors,
        "total_spend": round(total_spend, 2),
        "credits": credits,
        "since": since.isoformat(),
    }


def build_slack_message(data: dict) -> str:
    """Render digest data as Slack mrkdwn (native *bold* — direct-post path)."""
    now = datetime.now(_tz())
    lines = [f"*💳 Daily Spend — {now:%a, %b} {now.day}*"]

    if data.get("errors"):
        for e in data["errors"]:
            lines.append(f"⚠️ Feed notice: {e}")

    if not data["groups"]:
        if not data.get("errors"):
            lines.append("No card activity today 🎉")
        return "\n".join(lines)

    for g in data["groups"]:
        lines.append(f"*{g['label']} — ${g['spend']:,.2f}*")
        for t in g["txns"]:
            marks = ""
            if t["pending"]:
                marks += " ⏳"
            if not t["is_today"]:
                marks += f" ({t['date'][5:]})"
            lines.append(f"• ${t['amount']:,.2f} — {t['description']} ({t['account']}){marks}")

    lines.append(f"*Household total: ${data['total_spend']:,.2f}*")

    if data.get("credits"):
        cr = " · ".join(f"+${c['amount']:,.2f} {c['description']}" for c in data["credits"][:5])
        lines.append(f"_Payments & credits (not counted): {cr}_")

    lines.append("📝 Enter these in your sheets — Google Sheets stay the source of truth.")
    return "\n".join(lines)


def send_slack_message(text: str) -> bool:
    """Post to the spend channel via chat.postMessage. Returns True on success."""
    token = settings.SLACK_BOT_TOKEN
    if not token:
        logger.warning("SLACK_BOT_TOKEN not configured — spend digest not sent.")
        return False
    try:
        resp = requests.post(
            "https://slack.com/api/chat.postMessage",
            headers={"Authorization": f"Bearer {token}"},
            json={"channel": settings.SLACK_SPEND_CHANNEL, "text": text, "unfurl_links": False},
            timeout=15,
        )
        body = resp.json()
        if not body.get("ok"):
            logger.error("Slack post failed: %s", body.get("error"))
            return False
        return True
    except requests.RequestException as e:
        logger.error("Slack unreachable: %s", e)
        return False


def send_daily_spend_digest() -> dict:
    """Scheduler + manual-send entry point. Own DB session; safe to call anytime."""
    db = SessionLocal()
    try:
        connection = get_connection(db)
        if connection is None:
            return {"sent": False, "reason": "SimpleFIN not connected."}
        if not connection.digest_enabled:
            return {"sent": False, "reason": "Digest disabled."}

        # Cover everything since the last digest so late-posting transactions
        # are never silently skipped (capped at _MAX_WINDOW_DAYS).
        data = gather_digest_data(db, since=connection.last_digest_at)
        text = build_slack_message(data)
        ok = send_slack_message(text)
        if ok:
            connection.last_digest_at = datetime.utcnow()
            db.commit()
        return {"sent": ok, "message": text}
    finally:
        db.close()
