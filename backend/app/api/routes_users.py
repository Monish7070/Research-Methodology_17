"""User management routes (administrators only)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.serializers import user_out
from app.core.deps import get_current_user, require_permission
from app.core.security import hash_password
from app.database.db import get_db
from app.models.models import Role, User
from app.schemas.schemas import UserCreateRequest, UserUpdateRequest

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("")
def list_users(
    current_user: User = Depends(require_permission("user:manage")),
    db: Session = Depends(get_db),
):
    users = db.query(User).order_by(User.created_at).all()
    roles = db.query(Role).order_by(Role.id).all()
    return {
        "items": [user_out(u) for u in users],
        "roles": [
            {"name": role.name, "label": role.description, "permissions": role.permissions or []}
            for role in roles
        ],
    }


@router.post("", status_code=201)
def create_user(
    payload: UserCreateRequest,
    current_user: User = Depends(require_permission("user:manage")),
    db: Session = Depends(get_db),
):
    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(status_code=409, detail="A user with this email already exists")
    role = db.query(Role).filter(Role.name == payload.role).first()
    if not role:
        raise HTTPException(status_code=422, detail="Unknown role")

    user = User(
        name=payload.name.strip(),
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role_id=role.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.put("/{user_id}")
def update_user(
    user_id: int,
    payload: UserUpdateRequest,
    current_user: User = Depends(require_permission("user:manage")),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.role:
        role = db.query(Role).filter(Role.name == payload.role).first()
        if not role:
            raise HTTPException(status_code=422, detail="Unknown role")
        if user.id == current_user.id and role.name != user.role.name:
            raise HTTPException(status_code=409, detail="You cannot change your own role")
        user.role_id = role.id

    if payload.name:
        user.name = payload.name.strip()

    if payload.is_active is not None:
        if user.id == current_user.id and not payload.is_active:
            raise HTTPException(status_code=409, detail="You cannot deactivate your own account")
        user.is_active = payload.is_active

    if payload.password:
        user.password_hash = hash_password(payload.password)

    db.commit()
    db.refresh(user)
    return user_out(user)


@router.delete("/{user_id}")
def deactivate_user(
    user_id: int,
    current_user: User = Depends(require_permission("user:manage")),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=409, detail="You cannot deactivate your own account")
    user.is_active = False
    db.commit()
    return {"message": f"{user.name} deactivated"}
