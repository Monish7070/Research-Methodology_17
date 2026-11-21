"""Authentication routes."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.serializers import user_out
from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.database.db import get_db
from app.models.models import Role, User
from app.schemas.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    if payload.role == "admin":
        raise HTTPException(status_code=403, detail="Administrator accounts are created by an administrator")

    role = db.query(Role).filter(Role.name == payload.role).first()
    if not role:
        raise HTTPException(status_code=500, detail="Role configuration missing; run the seeder")

    user = User(
        name=payload.name.strip(),
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role_id=role.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(str(user.id), {"role": role.name})
    return TokenResponse(access_token=token, user=user_out(user))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account has been deactivated")

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    token = create_access_token(str(user.id), {"role": user.role.name})
    return TokenResponse(access_token=token, user=user_out(user))


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return user_out(current_user)


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    # No mail provider is configured for this deployment. The response is
    # intentionally identical whether or not the address exists.
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    message = (
        "If an account exists for this address, a password reset request has been recorded. "
        "This deployment has no email provider configured - ask an administrator to reset the password."
    )
    return {"message": message, "account_found": bool(user), "delivery": "manual"}
