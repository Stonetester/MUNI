from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List
import os


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./finance.db"
    SECRET_KEY: str = "changeme-use-a-real-secret-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200  # 30 days

    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
    ]

    ANTHROPIC_API_KEY: str = ""
    # Preferred Claude model, with a fallback retried automatically if the account
    # can't access the preferred one yet.
    ANTHROPIC_MODEL: str = "claude-sonnet-5"
    ANTHROPIC_FALLBACK_MODEL: str = "claude-sonnet-4-6"
    OPENAI_API_KEY: str = ""
    OLLAMA_HOST: str = "http://10.0.0.172:11434"
    OLLAMA_REPORT_MODEL: str = "qwen3:8b"
    OLLAMA_CHAT_MODEL: str = "qwen3:14b"
    # Context window for local chat/report calls. The grounding prompt (accounts,
    # history, forecasts) is large — Ollama's default ctx silently truncates the
    # OLDEST tokens, which deletes the system prompt and makes the model claim it
    # "can't see" data that is right there. Keep this comfortably above prompt size.
    OLLAMA_NUM_CTX: int = 24576

    # ── Daily spend digest (SimpleFIN feed → Slack) ──
    # Bot token shared with the athena-agents Slack automations (direct
    # chat.postMessage path, native *bold* mrkdwn).
    SLACK_BOT_TOKEN: str = ""
    SLACK_SPEND_CHANNEL: str = "#coin"
    SPEND_DIGEST_HOUR: int = 20  # 8:45 PM local — after the day's spending, before daily_brief at 21:00
    SPEND_DIGEST_MINUTE: int = 45
    DIGEST_TIMEZONE: str = "America/New_York"

    class Config:
        env_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
        env_file_encoding = "utf-8"
        case_sensitive = True


settings = Settings()
