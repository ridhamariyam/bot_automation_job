"""
JWT ownership dependency for FastAPI routes.

Usage:
    from middleware.auth import require_self

    @router.get("/{email}")
    def my_route(email: str, _: str = Depends(require_self)):
        ...

`require_self` validates that:
  1. A valid JWT Bearer token is present in Authorization header.
  2. The token's `sub` (email) matches the `email` OR `user_email`
     path parameter on the route — preventing cross-user data access.
"""
import os
from fastapi import Request, HTTPException, Depends
from jose import jwt, JWTError

_SECRET  = os.getenv("JWT_SECRET", "change-me-in-production-set-JWT_SECRET-env-var")
_ALGO    = "HS256"


def _decode_token(request: Request) -> str:
    """Extract and verify JWT; return the owner email (sub)."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Authentication required")
    try:
        payload = jwt.decode(auth[7:], _SECRET, algorithms=[_ALGO])
        email: str = payload.get("sub", "")
        if not email:
            raise HTTPException(401, "Invalid token payload")
        return email
    except JWTError:
        raise HTTPException(401, "Invalid or expired token")


def require_self(request: Request, token_email: str = Depends(_decode_token)) -> str:
    """
    Validates that the authenticated user owns the resource identified by the
    route's email/user_email path parameter. Returns the verified email.
    """
    path_email: str = (
        request.path_params.get("email")
        or request.path_params.get("user_email")
        or ""
    )
    if path_email and token_email.lower() != path_email.lower():
        raise HTTPException(403, "Access denied")
    return token_email


def require_auth(token_email: str = Depends(_decode_token)) -> str:
    """Lighter dependency: only validates JWT, no ownership check."""
    return token_email
