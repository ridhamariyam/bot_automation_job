"""
Runtime feature flags — mutable at process level via admin API.
Initial values read from environment variables.
"""
import os

_flags: dict[str, bool] = {
    "bot_disabled": os.getenv("BOT_DISABLED", "").lower() in ("1", "true", "yes"),
}


def is_bot_disabled() -> bool:
    return _flags["bot_disabled"]


def set_bot_disabled(disabled: bool) -> None:
    _flags["bot_disabled"] = disabled


def get_all() -> dict[str, bool]:
    return dict(_flags)
