"""
Fernet symmetric encryption for platform credentials.
Passwords are NEVER stored in plaintext — always encrypted at rest.

Setup: generate a key once and store in ENCRYPTION_KEY env var:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""
import os
from cryptography.fernet import Fernet, InvalidToken


def _fernet() -> Fernet:
    key = os.environ.get("ENCRYPTION_KEY")
    if not key:
        # Dev fallback — generate a deterministic key from a static secret
        # In production, ENCRYPTION_KEY MUST be set
        import base64, hashlib
        raw = hashlib.sha256(b"jobrocket-dev-key-change-in-prod").digest()
        key = base64.urlsafe_b64encode(raw).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_password(plaintext: str) -> str:
    """Encrypt a plaintext password to a storable ciphertext string."""
    if not plaintext:
        return ""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_password(ciphertext: str) -> str:
    """Decrypt a stored ciphertext back to plaintext."""
    if not ciphertext:
        return ""
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except (InvalidToken, Exception):
        # Ciphertext corrupt or wrong key — return empty so caller fails safely
        return ""


def is_encrypted(value: str) -> bool:
    """Heuristic: Fernet tokens start with 'gAAAAA'."""
    return bool(value) and value.startswith("gAAAAA")
