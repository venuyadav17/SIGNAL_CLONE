from sqlalchemy.orm import Session

from app.database import SessionLocal, init_db
from app.models import Conversation, ConversationMember, Message, User, utc_now
from app.main import make_avatar


SEED_USERS = [
    {"username": "alice", "display_name": "Alice Sharma", "phone": "+10000000001"},
    {"username": "bob", "display_name": "Bob Mehta", "phone": "+10000000002"},
    {"username": "charlie", "display_name": "Charlie Rao", "phone": "+10000000003"},
    {"username": "david", "display_name": "David Khan", "phone": "+10000000004"},
]


def get_or_create_user(db: Session, username: str, display_name: str, phone: str) -> User:
    user = db.query(User).filter(User.username == username).first()
    if user:
        return user

    user = User(
        username=username,
        display_name=display_name,
        phone=phone,
        avatar=make_avatar(display_name),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def user_map(db: Session) -> dict[str, User]:
    users = {}
    for seed_user in SEED_USERS:
        user = get_or_create_user(db, **seed_user)
        users[user.username] = user
    return users


def find_direct_conversation(db: Session, first_user_id: int, second_user_id: int) -> Conversation | None:
    conversations = (
        db.query(Conversation)
        .join(ConversationMember)
        .filter(Conversation.type == "direct", ConversationMember.user_id.in_([first_user_id, second_user_id]))
        .all()
    )
    for conversation in conversations:
        member_ids = {member.user_id for member in conversation.members}
        if member_ids == {first_user_id, second_user_id}:
            return conversation
    return None


def ensure_direct_chat(db: Session, first: User, second: User) -> Conversation:
    conversation = find_direct_conversation(db, first.id, second.id)
    if conversation:
        return conversation

    conversation = Conversation(type="direct", updated_at=utc_now())
    db.add(conversation)
    db.flush()
    db.add_all(
        [
            ConversationMember(conversation_id=conversation.id, user_id=first.id),
            ConversationMember(conversation_id=conversation.id, user_id=second.id),
        ]
    )
    db.commit()
    db.refresh(conversation)
    return conversation


def ensure_group_chat(db: Session, name: str, admin: User, members: list[User]) -> Conversation:
    conversation = db.query(Conversation).filter(Conversation.type == "group", Conversation.name == name).first()
    if conversation:
        return conversation

    conversation = Conversation(type="group", name=name, updated_at=utc_now())
    db.add(conversation)
    db.flush()
    db.add(ConversationMember(conversation_id=conversation.id, user_id=admin.id, is_admin=True))
    for member in members:
        db.add(ConversationMember(conversation_id=conversation.id, user_id=member.id, is_admin=False))
    db.commit()
    db.refresh(conversation)
    return conversation


def ensure_message(db: Session, conversation: Conversation, sender: User, content: str):
    existing = (
        db.query(Message)
        .filter(
            Message.conversation_id == conversation.id,
            Message.sender_id == sender.id,
            Message.content == content,
        )
        .first()
    )
    if existing:
        return

    db.add(
        Message(
            conversation_id=conversation.id,
            sender_id=sender.id,
            content=content,
            status="read",
        )
    )
    conversation.updated_at = utc_now()
    db.commit()


def seed():
    init_db()
    db = SessionLocal()
    try:
        users = user_map(db)
        direct = ensure_direct_chat(db, users["alice"], users["bob"])
        ensure_message(db, direct, users["alice"], "Hey Bob, is the secure messaging demo ready?")
        ensure_message(db, direct, users["bob"], "Almost. Realtime chat is the fun part.")

        group = ensure_group_chat(db, "Project Room", users["alice"], [users["bob"], users["charlie"]])
        ensure_message(db, group, users["charlie"], "I added notes for the interview walkthrough.")
        ensure_message(db, group, users["alice"], "Great, let's keep the demo simple and clear.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
    print("Seed data is ready. Login with alice, bob, charlie, or david using OTP 123456.")
