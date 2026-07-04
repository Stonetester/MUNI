"""SimpleFIN Bridge client — the household's read-only bank/card feed.

Protocol (https://www.simplefin.org/protocol.html):
1. The user links banks at the SimpleFIN Bridge site and gets a SETUP TOKEN
   (base64-encoded claim URL). It can be claimed exactly once.
2. POST the claim URL (empty body) → response body is the ACCESS URL with
   basic-auth credentials embedded (https://user:pass@bridge.../simplefin).
3. GET {access_url}/accounts?start-date=X&end-date=Y&pending=1 → JSON with
   accounts[] each carrying org, name, balance and transactions[].

Amounts arrive as SIGNED STRINGS ("-12.40" = money out). This module never
touches MUNI's `transactions` table — feed data is for the daily digest and
the settings preview only; Google Sheets remain the transaction truth.
"""
from __future__ import annotations

import base64
import binascii
import logging
from datetime import datetime, timezone

import requests

logger = logging.getLogger(__name__)

_TIMEOUT = 30


class SimplefinError(Exception):
    """Raised for claim/fetch failures with a user-presentable message."""


def claim_setup_token(setup_token: str) -> str:
    """Exchange a one-time setup token for the permanent access URL."""
    token = setup_token.strip()
    try:
        claim_url = base64.b64decode(token, validate=True).decode("utf-8").strip()
    except (binascii.Error, UnicodeDecodeError):
        raise SimplefinError(
            "That doesn't look like a SimpleFIN setup token (it should be a long base64 string "
            "from bridge.simplefin.org)."
        )
    if not claim_url.startswith("https://"):
        raise SimplefinError("Decoded setup token is not an https claim URL — token may be corrupted.")

    try:
        resp = requests.post(claim_url, headers={"Content-Length": "0"}, timeout=_TIMEOUT)
    except requests.RequestException as e:
        raise SimplefinError(f"Could not reach SimpleFIN to claim the token: {e}")
    if resp.status_code == 403:
        raise SimplefinError("SimpleFIN rejected the token — setup tokens are single-use; generate a new one.")
    if resp.status_code != 200:
        raise SimplefinError(f"SimpleFIN claim failed (HTTP {resp.status_code}): {resp.text[:200]}")

    access_url = resp.text.strip()
    if not access_url.startswith("https://"):
        raise SimplefinError("SimpleFIN returned an unexpected claim response — try a fresh setup token.")
    return access_url


def fetch_accounts(
    access_url: str,
    start: datetime | None = None,
    end: datetime | None = None,
    include_pending: bool = True,
) -> dict:
    """GET /accounts. Returns the raw SimpleFIN payload: {"errors": [...], "accounts": [...]}.

    start/end bound the TRANSACTIONS included per account (accounts and
    balances always come back). Naive datetimes are treated as local time.
    """
    params: dict[str, str] = {}
    if start is not None:
        params["start-date"] = str(int(start.astimezone(timezone.utc).timestamp() if start.tzinfo else start.timestamp()))
    if end is not None:
        params["end-date"] = str(int(end.astimezone(timezone.utc).timestamp() if end.tzinfo else end.timestamp()))
    if include_pending:
        params["pending"] = "1"

    try:
        resp = requests.get(access_url.rstrip("/") + "/accounts", params=params, timeout=_TIMEOUT)
    except requests.RequestException as e:
        raise SimplefinError(f"Could not reach SimpleFIN: {e}")
    if resp.status_code != 200:
        raise SimplefinError(f"SimpleFIN fetch failed (HTTP {resp.status_code}): {resp.text[:200]}")
    try:
        data = resp.json()
    except ValueError:
        raise SimplefinError("SimpleFIN returned non-JSON — service may be down.")
    if not isinstance(data, dict) or "accounts" not in data:
        raise SimplefinError("SimpleFIN response missing 'accounts'.")
    return data


def txn_timestamp(txn: dict) -> int:
    """Best-available unix time for a transaction (pending ones may lack `posted`)."""
    posted = txn.get("posted") or 0
    transacted = txn.get("transacted_at") or 0
    return int(max(posted, transacted)) or int(posted or transacted)


def txn_amount(txn: dict) -> float:
    """Signed float amount; SimpleFIN sends strings. Negative = money out."""
    try:
        return float(txn.get("amount", "0"))
    except (TypeError, ValueError):
        return 0.0
