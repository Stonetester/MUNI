#!/usr/bin/env python3
"""Basic authenticated API smoke test for FinanceTrack.

Usage:
  python scripts/api_smoke_test.py --base-url http://127.0.0.1:8000 --username keaton --password finance123
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request


def req(url: str, method: str = "GET", data: bytes | None = None, headers: dict | None = None):
    r = urllib.request.Request(url, data=data, method=method)
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    with urllib.request.urlopen(r, timeout=30) as res:
        return res.status, res.read()


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--base-url", default="http://127.0.0.1:8000")
    p.add_argument("--username", required=True)
    p.add_argument("--password", required=True)
    args = p.parse_args()

    base = args.base_url.rstrip("/")

    status, body = req(f"{base}/health")
    print(f"GET /health -> {status}")
    if status != 200:
        return 1

    login_data = urllib.parse.urlencode({"username": args.username, "password": args.password}).encode()
    status, body = req(
        f"{base}/api/v1/auth/login",
        method="POST",
        data=login_data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    if status != 200:
        print(f"POST /api/v1/auth/login -> {status}")
        return 1
    token = json.loads(body)["access_token"]
    auth = {"Authorization": f"Bearer {token}"}

    endpoints = [
        "/api/v1/auth/me",
        "/api/v1/dashboard",
        "/api/v1/accounts",
        "/api/v1/categories",
        "/api/v1/transactions?limit=5&offset=0",
        "/api/v1/recurring",
        "/api/v1/balance-snapshots",
        "/api/v1/events",
        "/api/v1/scenarios",
        "/api/v1/forecast?months=6",
        "/api/v1/budget/summary",
        "/api/v1/alerts",
    ]

    for ep in endpoints:
        status, body = req(f"{base}{ep}", headers=auth)
        print(f"GET {ep} -> {status} ({len(body)} bytes)")
        if status != 200:
            return 1

    print("Smoke test passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
