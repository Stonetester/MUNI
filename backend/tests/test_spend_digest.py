"""Spend digest + SimpleFIN client — pure-logic tests (no DB, no network)."""
import base64
import unittest

from app.services import simplefin
from app.services.spend_digest import build_dm_message, build_slack_message, build_personal_message, split_digest_messages


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
                    "username": "keaton",
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
                    "username": None,
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
        self.assertIn("• *$12.40* — Wawa", msg)
        self.assertIn("_BofA Visa · Pending_", msg)
        self.assertIn("_BofA Visa · 07-03_", msg)  # non-today txn carries its date
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

    # ── per-person channel routing ──

    def test_split_no_personal_channels_is_single_household_message(self):
        msgs = split_digest_messages(self._data(), {}, "#coin")
        self.assertEqual(len(msgs), 1)
        self.assertEqual(msgs[0][0], "#coin")
        self.assertEqual(msgs[0][1], build_slack_message(self._data()))

    def test_split_routes_owner_to_personal_channel(self):
        msgs = split_digest_messages(self._data(), {"keaton": "UKEATON1"}, "#coin")
        self.assertEqual(len(msgs), 2)
        channels = dict(msgs)
        # Personal message: only Keaton's purchases, personal header + sheet reminder.
        personal = channels["UKEATON1"]
        self.assertIn("💳 *Daily Card Activity*", personal)
        self.assertIn("Wawa", personal)
        self.assertIn("Target", personal)  # joint purchase is delivered to both partners
        self.assertNotIn("Household total", personal)
        # Household message is a roll-up only once DM delivery is configured.
        household = channels["#coin"]
        self.assertNotIn("Target", household)
        self.assertNotIn("Wawa", household)
        self.assertIn("*Keaton — $43.12* → details in DM", household)
        self.assertIn("*Household total: $61.62*", household)  # still the FULL day total

    def test_split_all_routed_household_keeps_summary(self):
        data = self._data()
        data["groups"] = [g for g in data["groups"] if g["username"] == "keaton"]
        data["total_spend"] = 43.12
        msgs = split_digest_messages(data, {"keaton": "UKEATON1"}, "#coin")
        household = dict(msgs)["#coin"]
        self.assertIn("→ details in DM", household)
        self.assertIn("*Household total: $43.12*", household)
        self.assertNotIn("No card activity", household)

    def test_personal_message_uses_single_asterisk_bold(self):
        msg = build_personal_message(self._data()["groups"][0])
        self.assertNotIn("**", msg)
        self.assertIn("source of truth", msg)

    def test_joint_transactions_are_sent_to_both_dms(self):
        msgs = split_digest_messages(
            self._data(), {"keaton": "UKEATON1", "katherine": "UKAT0001"}, "#coin"
        )
        channels = dict(msgs)
        self.assertIn("Wawa", channels["UKEATON1"])
        self.assertIn("Target", channels["UKEATON1"])
        self.assertNotIn("Wawa", channels["UKAT0001"])
        self.assertIn("Target", channels["UKAT0001"])
        self.assertIn("*Joint — $18.50* → details in DM to both", channels["#coin"])

    def test_dm_message_combines_owned_and_joint_groups(self):
        msg = build_dm_message("Keaton", self._data()["groups"])
        self.assertIn("Wawa", msg)
        self.assertIn("Target", msg)
        self.assertIn("*Joint accounts — $18.50*", msg)
        self.assertIn("muni.tail887f36.ts.net", msg)

    def test_dm_example_has_single_readable_header(self):
        msg = build_dm_message("Keaton", self._data()["groups"], example=True)
        self.assertTrue(msg.startswith("🧪 *EXAMPLE — Daily Card Activity*"))
        self.assertIn("*Today’s total — $61.62*", msg)
        self.assertIn("*Keaton accounts — $43.12*", msg)
        self.assertIn("*Joint accounts — $18.50*", msg)


if __name__ == "__main__":
    unittest.main()
