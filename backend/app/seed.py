"""Database seeding: roles, development accounts and default settings."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.core.config import (
    DEFAULT_PRIORITY_CONFIG,
    ROLE_ADMIN,
    ROLE_INSPECTOR,
    ROLE_OFFICER,
    ROLE_PERMISSIONS,
    settings,
)
from app.core.security import hash_password
from app.models.models import Role, SystemSetting, User

logger = logging.getLogger("urbanvision.seed")

ROLE_DESCRIPTIONS = {
    ROLE_ADMIN: "Administrator",
    ROLE_OFFICER: "Municipal Officer",
    ROLE_INSPECTOR: "Field Inspector",
}

DEMO_USERS = [
    ("System Administrator", "admin@urbanvision.ai", ROLE_ADMIN),
    ("Municipal Officer", "officer@urbanvision.ai", ROLE_OFFICER),
    ("Field Inspector", "inspector@urbanvision.ai", ROLE_INSPECTOR),
]


def seed(db: Session) -> None:
    created_roles = False
    for name, description in ROLE_DESCRIPTIONS.items():
        role = db.query(Role).filter(Role.name == name).first()
        if role is None:
            db.add(Role(name=name, description=description, permissions=ROLE_PERMISSIONS[name]))
            created_roles = True
        else:
            role.description = description
            role.permissions = ROLE_PERMISSIONS[name]
    db.commit()

    if settings.SEED_DEMO_DATA:
        for name, email, role_name in DEMO_USERS:
            if db.query(User).filter(User.email == email).first():
                continue
            role = db.query(Role).filter(Role.name == role_name).first()
            db.add(
                User(
                    name=name,
                    email=email,
                    password_hash=hash_password(settings.DEMO_PASSWORD),
                    role_id=role.id,
                )
            )
        db.commit()

    if db.query(SystemSetting).filter(SystemSetting.key == "priority_config").first() is None:
        db.add(
            SystemSetting(
                key="priority_config",
                value=DEFAULT_PRIORITY_CONFIG,
                description="Weighted maintenance priority scoring rules",
            )
        )
        db.commit()

    if created_roles:
        logger.info("Roles created")
