from app.database import init_db


def seed():
    init_db()
    print("Database initialized successfully.")
    print("No users were seeded. Create users from the registration screen.")


if __name__ == "__main__":
    seed()