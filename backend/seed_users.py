"""
Run this script once to create the two initial user accounts.
Usage: python seed_users.py
"""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal, Base, engine
from app.models.user import User
from app.models.scenario import Scenario
from app.auth import get_password_hash

import app.models  # noqa - registers all models


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    users_to_create = [
        {
            "username": "keaton",
            "email": "keaton@example.com",
            "display_name": "Keaton Dick",
            "password": "changeme123",
        },
        {
            "username": "katherine",
            "email": "katherine@example.com",
            "display_name": "Katherine",
            "password": "changeme123",
        },
    ]

    for u in users_to_create:
        existing = db.query(User).filter(User.username == u["username"]).first()
        if existing:
            print(f"User '{u['username']}' already exists, skipping.")
            continue

        user = User(
            username=u["username"],
            email=u["email"],
            display_name=u["display_name"],
            hashed_password=get_password_hash(u["password"]),
        )
        db.add(user)
        db.flush()

        # Create a baseline scenario for each user
        baseline = Scenario(
            user_id=user.id,
            name="Baseline",
            description="Default baseline scenario",
            is_baseline=True,
        )
        db.add(baseline)
        print(f"Created user '{u['username']}' with password '{u['password']}' (change this!)")

    db.commit()
    db.close()
    print("Seeding complete.")


if __name__ == "__main__":
    seed()
