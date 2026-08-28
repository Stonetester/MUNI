"""End-of-day household spend digest → Slack.

Reads the day's card/checking activity from the SimpleFIN feed, groups it by
owner (Keaton / Katherine / Joint), and DMs each partner their own plus joint
purchases. The household channel receives only the roll-up. Feed data is NEVER
written into `transactions` — the sheets stay the source of truth; this is a
reminder mirror, not an importer.

Slack path: direct `chat.postMessage` with native mrkdwn (*bold*, single
asterisks) — same delivery style as the athena-agents scripts. No tables.
A dead feed degrades to a one-line notice, never a crash.
"""
from __future__ import annotations

import logging
import re
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
MUNI_PHONE_URL = "http://muni.tail887f36.ts.net"
APP_LINK = f"<{MUNI_PHONE_URL}|Open MUNI on your phone>"


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
        owner_username = row.user.username if row.user else None
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
                g = groups.setdefault(
                    owner_label,
                    {"label": owner_label, "username": owner_username, "spend": 0.0, "txns": []},
                )
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


def _txn_line(t: dict) -> str:
    marks = ""
    if t["pending"]:
        marks += " ⏳"
    if not t["is_today"]:
        marks += f" ({t['date'][5:]})"
    return f"• ${t['amount']:,.2f} — {t['description']} ({t['account']}){marks}"


def build_slack_message(data: dict, routed: list[tuple[str, float, str]] | None = None) -> str:
    """Render the household digest as Slack mrkdwn (native *bold* — direct-post path).

    `routed` = (label, spend, channel) for groups whose details went to a
    personal channel — they appear here as one-line totals so the household
    view still adds up."""
    routed = routed or []
    now = datetime.now(_tz())
    lines = [f"*💳 Daily Spend — {now:%a, %b} {now.day}*"]

    if data.get("errors"):
        for e in data["errors"]:
            lines.append(f"⚠️ Feed notice: {e}")

    if not data["groups"] and not routed:
        if not data.get("errors"):
            lines.append("No card activity today 🎉")
        return "\n".join(lines)

    for g in data["groups"]:
        lines.append(f"*{g['label']} — ${g['spend']:,.2f}*")
        for t in g["txns"]:
            lines.append(_txn_line(t))

    for label, spend, channel in routed:
        lines.append(f"*{label} — ${spend:,.2f}* → details in {channel}")

    lines.append(f"*Household total: ${data['total_spend']:,.2f}*")

    if data.get("credits"):
        cr = " · ".join(f"+${c['amount']:,.2f} {c['description']}" for c in data["credits"][:5])
        lines.append(f"_Payments & credits (not counted): {cr}_")

    lines.append("📝 Enter these in your sheets — Google Sheets stay the source of truth.")
    return "\n".join(lines)


def build_personal_message(group: dict) -> str:
    """One person's purchases only — for their personal spend channel."""
    now = datetime.now(_tz())
    lines = [f"*💳 {group['label']}'s spend — {now:%a, %b} {now.day} — ${group['spend']:,.2f}*"]
    for t in group["txns"]:
        lines.append(_txn_line(t))
    lines.append("📝 Enter these in your sheet — Google Sheets stay the source of truth.")
    lines.append(f"📱 {APP_LINK}")
    return "\n".join(lines)


def build_dm_message(label: str, groups: list[dict]) -> str:
    """Render one partner's owned and joint transactions as a single DM."""
    now = datetime.now(_tz())
    total = sum(g["spend"] for g in groups)
    lines = [f"*💳 {label}'s spend — {now:%a, %b} {now.day} — ${total:,.2f}*"]
    for group in groups:
        if group["label"] == "Joint":
            lines.append(f"*Joint — ${group['spend']:,.2f}*")
        for txn in group["txns"]:
            lines.append(_txn_line(txn))
    lines.append("📝 Enter these in your sheet — Google Sheets stay the source of truth.")
    lines.append(f"📱 {APP_LINK}")
    return "\n".join(lines)


def split_digest_messages(
    data: dict, user_destinations: dict[str, str], household_channel: str
) -> list[tuple[str, str]]:
    """Route owned transactions to partner DMs and keep a household roll-up.

    Destinations are normally Slack member IDs (``U…``), resolved to DM
    conversations at send time. Channel and DM conversation IDs remain accepted
    for backwards compatibility. Joint transactions are included in both
    configured partner DMs. Owners without a destination remain detailed in the
    household channel.
    """
    personal: list[tuple[str, str]] = []
    routed: list[tuple[str, float, str]] = []
    remaining: list[dict] = []
    joint = [g for g in data["groups"] if not g.get("username")]
    routed_joint = False

    for username, destination in user_destinations.items():
        owned = [g for g in data["groups"] if g.get("username") == username]
        dm_groups = owned + joint
        if destination and dm_groups:
            label = username.capitalize()
            personal.append((destination, build_dm_message(label, dm_groups)))
            routed.extend((g["label"], g["spend"], "DM") for g in owned)
            routed_joint = routed_joint or bool(joint)

    for g in data["groups"]:
        if g.get("username"):
            if not user_destinations.get(g["username"]):
                remaining.append(g)
        elif not routed_joint:
            remaining.append(g)

    if routed_joint:
        routed.extend((g["label"], g["spend"], "DM to both") for g in joint)

    household = dict(data)
    household["groups"] = remaining
    messages = personal + [(household_channel, build_slack_message(household, routed=routed))]
    return messages


def open_slack_dm(user_id: str) -> tuple[str | None, str | None]:
    """Open or reuse a Slack DM conversation for one member ID."""
    try:
        resp = requests.post(
            "https://slack.com/api/conversations.open",
            headers={"Authorization": f"Bearer {settings.SLACK_BOT_TOKEN}"},
            json={"users": user_id},
            timeout=15,
        )
        body = resp.json()
        if not body.get("ok"):
            return None, body.get("error") or "conversations.open failed"
        return body["channel"]["id"], None
    except (requests.RequestException, KeyError, ValueError) as exc:
        return None, str(exc)


def send_slack_message(text: str, channel: str | None = None) -> tuple[bool, str | None]:
    """Post to a spend channel via chat.postMessage. Returns (ok, error)."""
    token = settings.SLACK_BOT_TOKEN
    if not token:
        logger.warning("SLACK_BOT_TOKEN not configured — spend digest not sent.")
        return False, "SLACK_BOT_TOKEN not configured"
    channel = channel or settings.SLACK_SPEND_CHANNEL
    if re.fullmatch(r"U[A-Z0-9]{6,}", channel):
        dm_channel, error = open_slack_dm(channel)
        if error:
            logger.error("Slack DM open for %s failed: %s", channel, error)
            return False, f"DM open failed: {error}"
        channel = dm_channel
    try:
        resp = requests.post(
            "https://slack.com/api/chat.postMessage",
            headers={"Authorization": f"Bearer {token}"},
            json={"channel": channel, "text": text, "unfurl_links": False},
            timeout=15,
        )
        body = resp.json()
        if not body.get("ok"):
            err = body.get("error")
            logger.error("Slack post to %s failed: %s", channel, err)
            return False, f"{channel}: {err}"
        return True, None
    except requests.RequestException as e:
        logger.error("Slack unreachable: %s", e)
        return False, str(e)


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

        from app.models.user import User

        user_channels = {
            u.username: u.spend_channel for u in db.query(User).all() if u.spend_channel
        }
        messages = split_digest_messages(data, user_channels, settings.SLACK_SPEND_CHANNEL)

        results = []
        errors = []
        for channel, text in messages:
            ok, err = send_slack_message(text, channel=channel)
            results.append({"channel": channel, "sent": ok})
            if err:
                errors.append(err)
        any_sent = any(r["sent"] for r in results)
        if any_sent:
            connection.last_digest_at = datetime.utcnow()
            db.commit()
        return {"sent": any_sent, "results": results, "errors": errors}
    finally:
        db.close()
