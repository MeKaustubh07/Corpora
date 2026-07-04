"""Auth: dev-mode bypass or Clerk JWT verification via JWKS."""

import time
from dataclasses import dataclass

import httpx
import jwt
from fastapi import Depends, HTTPException, Request
from jwt import PyJWKClient

from app.core.config import Settings, get_settings

DEV_TENANT = "dev-tenant"
DEV_USER = "dev-user"


@dataclass
class Principal:
    user_id: str
    tenant_id: str  # Clerk org id when present, else user id (personal tenant)


_jwks_client: PyJWKClient | None = None


def _get_jwks_client(settings: Settings) -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        url = settings.clerk_jwks_url
        if not url:
            raise HTTPException(status_code=500, detail="CLERK_JWKS_URL not configured")
        _jwks_client = PyJWKClient(url, cache_keys=True)
    return _jwks_client


def _verify_clerk_token(token: str, settings: Settings) -> Principal:
    try:
        signing_key = _get_jwks_client(settings).get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from exc
    if claims.get("exp", 0) < time.time():
        raise HTTPException(status_code=401, detail="Token expired")
    user_id = claims["sub"]
    tenant_id = claims.get("org_id") or user_id
    return Principal(user_id=user_id, tenant_id=tenant_id)


async def get_principal(
    request: Request, settings: Settings = Depends(get_settings)
) -> Principal:
    if settings.auth_mode == "dev":
        return Principal(user_id=DEV_USER, tenant_id=DEV_TENANT)
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return _verify_clerk_token(auth.removeprefix("Bearer "), settings)


async def clerk_healthcheck(settings: Settings) -> bool:
    if settings.auth_mode == "dev":
        return True
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(settings.clerk_jwks_url)
        return resp.status_code == 200
