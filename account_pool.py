"""
Account pool — multi-account management for DeepSeek Chat proxy.

Manages multiple DeepSeek accounts, tracks their states (idle/busy/error),
provides credential health checking and session lifecycle.
"""
import os
import time
import threading
from dataclasses import dataclass, field
from typing import Optional

from dotenv import load_dotenv
from adapter import DeepSeekAdapter

load_dotenv()


@dataclass
class Account:
    """A single DeepSeek account with credentials and runtime state."""
    token: str
    cookies: str
    email: str = ""
    state: str = "idle"          # idle | busy | error
    error_count: int = 0
    last_error: str = ""
    last_used: float = 0.0
    _adapter: Optional[DeepSeekAdapter] = field(default=None, repr=False)

    @property
    def adapter(self) -> DeepSeekAdapter:
        if self._adapter is None:
            self._adapter = DeepSeekAdapter(token=self.token, cookies=self.cookies)
        return self._adapter

    def to_dict(self) -> dict:
        return {
            "email": self.email,
            "state": self.state,
            "error_count": self.error_count,
            "last_error": self.last_error,
            "last_used": int(self.last_used),
        }


class AccountPool:
    """Thread-safe pool of DeepSeek accounts with round-robin selection."""

    def __init__(self):
        self._lock = threading.Lock()
        self._accounts: list[Account] = []
        self._next_idx = 0
        self._load_legacy()

    def _load_legacy(self):
        """Load a single account from env vars as initial entry."""
        token = os.environ.get("DEEPSEEK_TOKEN", "")
        cookies = os.environ.get("DEEPSEEK_COOKIES", "")
        if token and cookies:
            self._accounts.append(Account(
                token=token,
                cookies=cookies,
                email="env-default",
            ))

    # ── CRUD ───────────────────────────────────────────────────

    def add(self, token: str, cookies: str, email: str = "") -> Account:
        with self._lock:
            if not email:
                email = f"acc-{len(self._accounts) + 1}"
            acct = Account(token=token, cookies=cookies, email=email)
            self._accounts.append(acct)
            return acct

    def remove(self, index: int) -> bool:
        with self._lock:
            if 0 <= index < len(self._accounts):
                self._accounts.pop(index)
                if self._next_idx >= len(self._accounts):
                    self._next_idx = 0
                return True
            return False

    def get_all(self) -> list[dict]:
        with self._lock:
            return [a.to_dict() for a in self._accounts]

    def count(self) -> int:
        with self._lock:
            return len(self._accounts)

    # ── Selection ──────────────────────────────────────────────

    def acquire(self) -> Optional[Account]:
        """Get the next idle account (round-robin), or None if all busy."""
        with self._lock:
            if not self._accounts:
                return None
            n = len(self._accounts)
            for _ in range(n):
                idx = self._next_idx % n
                self._next_idx += 1
                acct = self._accounts[idx]
                if acct.state == "idle":
                    acct.state = "busy"
                    acct.last_used = time.time()
                    return acct
            return None

    def release(self, acct: Account):
        """Mark account back to idle."""
        with self._lock:
            acct.state = "idle"

    def mark_error(self, acct: Account, error_msg: str = ""):
        with self._lock:
            acct.state = "error"
            acct.error_count += 1
            acct.last_error = error_msg

    # ── Health check / relogin ─────────────────────────────────

    def check_health(self, acct: Account) -> bool:
        """Test if account credentials are valid by creating a session."""
        try:
            adapter = DeepSeekAdapter(token=acct.token, cookies=acct.cookies)
            adapter.create_session()
            return True
        except Exception as e:
            with self._lock:
                acct.state = "error"
                acct.error_count += 1
                acct.last_error = str(e)
            return False

    def relogin(self, index: int) -> tuple[bool, str]:
        """Attempt to heal an error account by testing credentials."""
        with self._lock:
            if not (0 <= index < len(self._accounts)):
                return False, "Account not found"
            acct = self._accounts[index]
            if acct.state != "error":
                return False, f"Account is {acct.state}, not error"

        ok = self.check_health(acct)
        if ok:
            with self._lock:
                acct.state = "idle"
                acct.error_count = 0
                acct.last_error = ""
            return True, "ok"
        return False, acct.last_error or "unknown error"

    # ── Stats ──────────────────────────────────────────────────

    def stats(self) -> dict:
        with self._lock:
            total = len(self._accounts)
            idle = sum(1 for a in self._accounts if a.state == "idle")
            busy = sum(1 for a in self._accounts if a.state == "busy")
            error = sum(1 for a in self._accounts if a.state == "error")
            return {
                "total": total,
                "idle": idle,
                "busy": busy,
                "error": error,
            }
