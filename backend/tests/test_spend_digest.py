"""Spend digest + SimpleFIN client — pure-logic tests (no DB, no network)."""
import base64
import unittest

from app.services import simplefin
from app.services.spend_digest import build_slack_message


class TestSimplefinHelpers(unittest.TestCase):
    def test_txn_amount_parses_signed_strings(self):
        self.assertEqual(simplefin.txn_amount({"amount": "-12.40"}), -12.40)
        self.assertEqual(simplefin.txn_amount({"amount": "500.00"}), 500.00)
        self.assertEqual(simplefin.txn_amount({"amount": None}), 0.0)
        self.assertEqual(simplefin.txn_amount({}), 0.0)
        self.assertEqual(simplefin.txn_amount({"amount": "garbage"}), 0.0)

    def test_txn_timestamp_prefers_latest_of_posted_and_transacted(self):
        self.assertEqual(simplefin.txn_timestamp({"posted": 100, "transacted_at": 50}), 100)
        self.assertEqual(simplefin.txn_timestamp({"posted": 0, "transacted_at": 75}), 75)
        self.assertEqual(simplefin.txn_timestamp({"posted": 60}), 60)

    def test_claim_rejects_non_base64_token(self):
        with self.assertRaises(simplefin.SimplefinError):
            simplefin.claim_setup_token("definitely not base64!!!")

    def test_claim_rejects_non_https_claim_url(self):
        token = base64.b64encode(b"http://insecure.example/claim").decode()
        with self.assertRaises(simplefin.SimplefinError):
            simplefin.claim_setup_token(token)


class TestBuildSlackMessage(unittest.TestCase):
    def _data(self, **overrides):
        data = {
            "connected": True,
            "groups": [
                {
                    "label": "Keaton",
                    "spend": 43.12,
                    "txns": [
                        {"description": "Wawa", "amount": 12.40, "account": "BofA Visa",
                         "pending": True, "date": "2026-07-04", "is_today": True},
                        {"description": "Chipotle", "amount": 30.72, "account": "BofA Visa",
                         "pending": False, "date": "2026-07-03", "is_today": False},
                    ],
                },
                {
                    "label": "Joint",
                    "spend": 18.50,
                    "txns": [
                        {"description": "Target", "amount": 18.50, "account": "Checking",
                         "pending": False, "date": "2026-07-04", "is_today": True},
                    ],
                },
            ],
            "errors": [],
            "total_spend": 61.62,
            "credits": [
                {"description": "BofA payment", "amount": 500.0, "account": "Visa",
                 "pending": False, "date": "2026-07-04", "is_today": True},
            ],
        }
        data.update(overrides)
        return data

    def test_full_message_shape(self):
        msg = build_slack_message(self._data())
        # Native Slack mrkdwn: single-asterisk bold (direct chat.postMessage path).
        self.assertIn("*💳 Daily Spend —", msg)
        self.assertNotIn("**", msg)
        self.assertIn("*Keaton — $43.12*", msg)
        self.assertIn("• $12.40 — Wawa (BofA Visa) ⏳", msg)
        self.assertIn("(07-03)", msg)  # non-today txn carries its date
        self.assertIn("*Household total: $61.62*", msg)
        self.assertIn("+$500.00 BofA payment", msg)  # credits excluded from spend
        self.assertIn("source of truth", msg)  # sheets reminder line

    def test_no_activity_message(self):
        msg = build_slack_message(self._data(groups=[], total_spend=0.0, credits=[]))
        self.assertIn("No card activity today", msg)

    def test_feed_error_degrades_to_one_line(self):
        msg = build_slack_message(self._data(groups=[], total_spend=0.0, credits=[],
                                             errors=["Connection to BofA may need attention"]))
        self.assertIn("⚠️ Feed notice: Connection to BofA may need attention", msg)
        self.assertNotIn("No card activity", msg)


if __name__ == "__main__":
    unittest.main()
