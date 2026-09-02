import unittest

from app.routers.ai_report import _extract_allocations
from app.services.chat_tools import tool_definitions


class FinancialPlanTests(unittest.TestCase):
    def test_plan_tables_become_validated_allocation_rows(self):
        text = """## Recommended Monthly Plan
| Category | Monthly target | Funded by |
|---|---:|---|
| Groceries | $600 | Keaton |
| Utilities | $300 | Keaton |

## Savings Allocation
| Account or goal | Monthly amount | Funded by |
|---|---:|---|
| House fund | $2,000 | Katherine |
"""
        rows = _extract_allocations(text)
        self.assertEqual([row["amount"] for row in rows], [600, 300, 2000])
        self.assertEqual([row["kind"] for row in rows], ["spending", "spending", "savings"])
        self.assertEqual(rows[-1]["funded_by"], "Katherine")

    def test_local_ai_has_full_current_data_tool(self):
        tools = {tool["name"]: tool for tool in tool_definitions(["keaton", "katherine"])}
        self.assertIn("inspect_current_finances", tools)
        include = tools["inspect_current_finances"]["input_schema"]["properties"]["include"]
        self.assertEqual(set(include["items"]["enum"]), {"accounts", "budgets", "savings_goals"})


if __name__ == "__main__":
    unittest.main()
