from contextlib import asynccontextmanager
import hashlib
import hmac
import secrets

from fastapi import (
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import desc, func, or_
from sqlalchemy.orm import Session, joinedload

from app.database import get_db, init_db, SessionLocal
from app.models import (
    Contact,
    Conversation,
    ConversationMember,
    Message,
    Session as UserSession,
    User,
    utc_now,
)
from app.schemas import (
    AddMemberRequest,
    AuthResponse,
    ContactResponse,
    ConversationMemberResponse,
    ConversationResponse,
    DirectConversationRequest,
    GroupConversationRequest,
    LoginRequest,
    MessageCreateRequest,
    MessageResponse,
    RegisterRequest,
    StatusResponse,
    UserPublic,
)
from app.websocket import manager, online_users


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Secure Messaging Platform",
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# Password helpers
# ============================================================

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)

    password_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        600_000,
    )

    return (
        f"pbkdf2_sha256$600000$"
        f"{salt.hex()}$"
        f"{password_hash.hex()}"
    )


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations, salt_hex, hash_hex = stored_hash.split("$")

        if algorithm != "pbkdf2_sha256":
            return False

        salt = bytes.fromhex(salt_hex)

        calculated_hash = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            int(iterations),
        )

        return hmac.compare_digest(
            calculated_hash.hex(),
            hash_hex,
        )

    except (ValueError, TypeError):
        return False


# ============================================================
# Authentication helpers
# ============================================================

def normalize_username(username: str) -> str:
    return username.strip().lower()


def make_avatar(display_name: str) -> str:
    initials = "".join(
        part[:1]
        for part in display_name.strip().split()[:2]
    ).upper()

    return initials or "U"


def get_bearer_token(
    authorization: str | None,
) -> str:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session",
        )

    if not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session",
        )

    token = authorization.split(" ", 1)[1].strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session",
        )

    return token


def current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    token = get_bearer_token(authorization)

    session = (
        db.query(UserSession)
        .options(joinedload(UserSession.user))
        .filter(UserSession.token == token)
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session",
        )

    return session.user


def serialize_user(user: User) -> UserPublic:
    return UserPublic.model_validate(user).model_copy(
        update={
            "online": user.id in online_users,
            "last_seen": (
                "Online"
                if user.id in online_users
                else "Last seen recently"
            ),
        }
    )


def serialize_message(message: Message) -> MessageResponse:
    return MessageResponse.model_validate(message)


def get_membership(
    db: Session,
    conversation_id: int,
    user_id: int,
) -> ConversationMember | None:
    return (
        db.query(ConversationMember)
        .filter(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
        .first()
    )


def require_membership(
    db: Session,
    conversation_id: int,
    user_id: int,
) -> ConversationMember:
    membership = get_membership(
        db,
        conversation_id,
        user_id,
    )

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Conversation access denied",
        )

    return membership


def serialize_member(
    member: ConversationMember,
) -> ConversationMemberResponse:
    data = ConversationMemberResponse.model_validate(member)

    return data.model_copy(
        update={
            "user": serialize_user(member.user)
        }
    )


def conversation_title(
    conversation: Conversation,
    viewer_id: int,
) -> str:
    if conversation.type == "group":
        return conversation.name or "Group"

    for member in conversation.members:
        if member.user_id != viewer_id:
            return member.user.display_name

    return "Saved Messages"


def serialize_conversation(
    conversation: Conversation,
    viewer_id: int,
) -> ConversationResponse:

    latest_message = None

    if conversation.messages:
        latest_message = serialize_message(
            conversation.messages[-1]
        )

    return ConversationResponse(
        id=conversation.id,
        type=conversation.type,
        name=conversation_title(
            conversation,
            viewer_id,
        ),
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        members=[
            serialize_member(member)
            for member in conversation.members
        ],
        latest_message=latest_message,
        unread_count=0,
    )


def get_conversation_for_user(
    db: Session,
    conversation_id: int,
    user_id: int,
) -> Conversation:

    conversation = (
        db.query(Conversation)
        .options(
            joinedload(
                Conversation.members
            ).joinedload(
                ConversationMember.user
            ),
            joinedload(Conversation.messages),
        )
        .filter(
            Conversation.id == conversation_id
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    require_membership(
        db,
        conversation_id,
        user_id,
    )

    conversation.messages.sort(
        key=lambda message: message.created_at
    )

    return conversation


def create_session(
    db: Session,
    user: User,
) -> str:

    token = secrets.token_urlsafe(48)

    db.add(
        UserSession(
            user_id=user.id,
            token=token,
        )
    )

    db.commit()

    return token


def create_message(
    db: Session,
    conversation_id: int,
    sender_id: int,
    content: str,
    status_value: str = "sent",
) -> Message:

    clean_content = content.strip()

    if not clean_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message cannot be empty",
        )

    message = Message(
        conversation_id=conversation_id,
        sender_id=sender_id,
        content=clean_content,
        status=status_value,
    )

    db.add(message)

    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id
        )
        .first()
    )

    if conversation:
        conversation.updated_at = utc_now()

    db.commit()
    db.refresh(message)

    return message


# ============================================================
# Health
# ============================================================

@app.get("/health")
def health():
    return {"status": "ok"}


# ============================================================
# Authentication
# ============================================================

@app.post(
    "/auth/register",
    response_model=AuthResponse,
)
def register(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
):
    username = normalize_username(
        payload.username
    )

    existing = (
        db.query(User)
        .filter(User.username == username)
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username is already taken",
        )

    phone = (
        payload.phone.strip()
        if payload.phone
        else None
    )

    # Display name is derived from username.
    display_name = username

    user = User(
        username=username,
        phone=phone,
        display_name=display_name,
        avatar=make_avatar(display_name),
        password_hash=hash_password(
            payload.password
        ),
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_session(db, user)

    return AuthResponse(
        token=token,
        user=serialize_user(user),
    )


@app.post(
    "/auth/login",
    response_model=AuthResponse,
)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
):

    username = normalize_username(
        payload.username
    )

    user = (
        db.query(User)
        .filter(User.username == username)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This account needs to be registered again",
        )

    if not verify_password(
        payload.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    token = create_session(db, user)

    return AuthResponse(
        token=token,
        user=serialize_user(user),
    )


@app.post(
    "/auth/logout",
    response_model=StatusResponse,
)
def logout(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):

    token = get_bearer_token(authorization)

    session = (
        db.query(UserSession)
        .filter(UserSession.token == token)
        .first()
    )

    if session:
        db.delete(session)
        db.commit()

    return StatusResponse(
        detail="Logged out"
    )


@app.get(
    "/auth/me",
    response_model=UserPublic,
)
def me(
    user: User = Depends(current_user),
):
    return serialize_user(user)


# ============================================================
# Users
# ============================================================

@app.get(
    "/users/search",
    response_model=list[UserPublic],
)
def search_users(
    q: str = Query(
        default="",
        max_length=100,
    ),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    query = q.strip()

    if not query:
        return []

    pattern = f"%{query.lower()}%"

    users = (
        db.query(User)
        .filter(User.id != user.id)
        .filter(
            or_(
                func.lower(
                    User.username
                ).like(pattern),
                func.lower(
                    User.display_name
                ).like(pattern),
            )
        )
        .order_by(User.display_name)
        .limit(20)
        .all()
    )

    return [
        serialize_user(found_user)
        for found_user in users
    ]


# ============================================================
# Contacts
# ============================================================

@app.get(
    "/contacts",
    response_model=list[ContactResponse],
)
def list_contacts(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    contacts = (
        db.query(Contact)
        .options(joinedload(Contact.contact))
        .filter(
            Contact.user_id == user.id
        )
        .order_by(Contact.created_at.desc())
        .all()
    )

    return [
        ContactResponse(
            id=contact.id,
            contact=serialize_user(
                contact.contact
            ),
            created_at=contact.created_at,
        )
        for contact in contacts
    ]


@app.post(
    "/contacts/{user_id}",
    response_model=ContactResponse,
)
def add_contact(
    user_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    if user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot add yourself",
        )

    contact_user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not contact_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    existing = (
        db.query(Contact)
        .filter(
            Contact.user_id == user.id,
            Contact.contact_id == user_id,
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Contact already exists",
        )

    contact = Contact(
        user_id=user.id,
        contact_id=user_id,
    )

    db.add(contact)
    db.commit()
    db.refresh(contact)

    return ContactResponse(
        id=contact.id,
        contact=serialize_user(contact_user),
        created_at=contact.created_at,
    )


# ============================================================
# Conversations
# ============================================================

@app.get(
    "/conversations",
    response_model=list[ConversationResponse],
)
def list_conversations(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    conversations = (
        db.query(Conversation)
        .join(ConversationMember)
        .options(
            joinedload(
                Conversation.members
            ).joinedload(
                ConversationMember.user
            ),
            joinedload(Conversation.messages),
        )
        .filter(
            ConversationMember.user_id == user.id
        )
        .order_by(
            desc(Conversation.updated_at)
        )
        .all()
    )

    for conversation in conversations:
        conversation.messages.sort(
            key=lambda message: message.created_at
        )

    return [
        serialize_conversation(
            conversation,
            user.id,
        )
        for conversation in conversations
    ]


@app.post(
    "/conversations/direct",
    response_model=ConversationResponse,
)
def create_direct_conversation(
    payload: DirectConversationRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    if payload.user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose another user",
        )

    other_user = (
        db.query(User)
        .filter(User.id == payload.user_id)
        .first()
    )

    if not other_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    existing = (
        db.query(Conversation)
        .join(
            ConversationMember,
            Conversation.id
            == ConversationMember.conversation_id,
        )
        .filter(
            Conversation.type == "direct",
            ConversationMember.user_id.in_(
                [user.id, other_user.id]
            ),
        )
        .group_by(Conversation.id)
        .having(
            func.count(
                func.distinct(
                    ConversationMember.user_id
                )
            )
            == 2
        )
        .first()
    )

    if existing:
        return serialize_conversation(
            get_conversation_for_user(
                db,
                existing.id,
                user.id,
            ),
            user.id,
        )

    conversation = Conversation(
        type="direct",
        name=None,
    )

    db.add(conversation)
    db.flush()

    db.add_all(
        [
            ConversationMember(
                conversation_id=conversation.id,
                user_id=user.id,
                is_admin=False,
            ),
            ConversationMember(
                conversation_id=conversation.id,
                user_id=other_user.id,
                is_admin=False,
            ),
        ]
    )

    db.commit()

    return serialize_conversation(
        get_conversation_for_user(
            db,
            conversation.id,
            user.id,
        ),
        user.id,
    )


@app.post(
    "/conversations/group",
    response_model=ConversationResponse,
)
def create_group_conversation(
    payload: GroupConversationRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    group_name = payload.name.strip()

    if not group_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Group name is required",
        )

    member_ids = set(payload.member_ids)
    member_ids.discard(user.id)

    if not member_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Select at least one group member",
        )

    found_users = (
        db.query(User)
        .filter(User.id.in_(member_ids))
        .all()
    )

    if len(found_users) != len(member_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One or more users were not found",
        )

    conversation = Conversation(
        type="group",
        name=group_name,
    )

    db.add(conversation)
    db.flush()

    db.add(
        ConversationMember(
            conversation_id=conversation.id,
            user_id=user.id,
            is_admin=True,
        )
    )

    for member_id in sorted(member_ids):
        db.add(
            ConversationMember(
                conversation_id=conversation.id,
                user_id=member_id,
                is_admin=False,
            )
        )

    db.commit()

    return serialize_conversation(
        get_conversation_for_user(
            db,
            conversation.id,
            user.id,
        ),
        user.id,
    )


@app.get(
    "/conversations/{conversation_id}",
    response_model=ConversationResponse,
)
def get_conversation(
    conversation_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    return serialize_conversation(
        get_conversation_for_user(
            db,
            conversation_id,
            user.id,
        ),
        user.id,
    )


@app.get(
    "/conversations/{conversation_id}/members",
    response_model=list[ConversationMemberResponse],
)
def list_members(
    conversation_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    conversation = get_conversation_for_user(
        db,
        conversation_id,
        user.id,
    )

    return [
        serialize_member(member)
        for member in conversation.members
    ]


@app.post(
    "/conversations/{conversation_id}/members",
    response_model=ConversationMemberResponse,
)
def add_member(
    conversation_id: int,
    payload: AddMemberRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    membership = require_membership(
        db,
        conversation_id,
        user.id,
    )

    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    if conversation.type != "group":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Members can only be managed on groups",
        )

    if not membership.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only group admins can add members",
        )

    new_user = (
        db.query(User)
        .filter(User.id == payload.user_id)
        .first()
    )

    if not new_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    existing = get_membership(
        db,
        conversation_id,
        payload.user_id,
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member",
        )

    member = ConversationMember(
        conversation_id=conversation_id,
        user_id=payload.user_id,
        is_admin=False,
    )

    conversation.updated_at = utc_now()

    db.add(member)
    db.commit()
    db.refresh(member)

    member.user = new_user

    return serialize_member(member)


@app.delete(
    "/conversations/{conversation_id}/members/{user_id}",
    response_model=StatusResponse,
)
def remove_member(
    conversation_id: int,
    user_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    membership = require_membership(
        db,
        conversation_id,
        user.id,
    )

    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    if conversation.type != "group":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Members can only be managed on groups",
        )

    if not membership.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only group admins can remove members",
        )

    if user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admins cannot remove themselves",
        )

    member = get_membership(
        db,
        conversation_id,
        user_id,
    )

    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )

    db.delete(member)

    conversation.updated_at = utc_now()

    db.commit()

    return StatusResponse(
        detail="Member removed"
    )


# ============================================================
# Messages
# ============================================================

@app.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[MessageResponse],
)
def list_messages(
    conversation_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require_membership(
        db,
        conversation_id,
        user.id,
    )

    messages = (
        db.query(Message)
        .filter(
            Message.conversation_id
            == conversation_id
        )
        .order_by(Message.created_at)
        .all()
    )

    return [
        serialize_message(message)
        for message in messages
    ]


@app.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageResponse,
)
async def post_message(
    conversation_id: int,
    payload: MessageCreateRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require_membership(
        db,
        conversation_id,
        user.id,
    )

    message = create_message(
        db,
        conversation_id,
        user.id,
        payload.content,
    )

    message_payload = (
        serialize_message(message)
        .model_dump(mode="json")
    )

    await manager.broadcast(
        conversation_id,
        {
            "type": "message",
            "message": message_payload,
        },
    )

    return message


# ============================================================
# WebSocket helpers
# ============================================================

def get_user_by_token(
    db: Session,
    token: str,
) -> User | None:

    session = (
        db.query(UserSession)
        .options(joinedload(UserSession.user))
        .filter(UserSession.token == token)
        .first()
    )

    return session.user if session else None


@app.websocket(
    "/ws/{conversation_id}"
)
async def websocket_endpoint(
    websocket: WebSocket,
    conversation_id: int,
    token: str = Query(default=""),
):

    db = SessionLocal()
    user = None

    try:
        user = get_user_by_token(
            db,
            token,
        )

        if not user or not get_membership(
            db,
            conversation_id,
            user.id,
        ):
            await websocket.close(
                code=1008
            )
            return

        await manager.connect(
            conversation_id,
            user.id,
            websocket,
        )

        await manager.broadcast(
            conversation_id,
            {
                "type": "presence",
                "user_id": user.id,
                "online": True,
            },
        )

        while True:
            payload = await websocket.receive_json()

            event_type = payload.get("type")

            if event_type == "message":

                content = str(
                    payload.get(
                        "content",
                        "",
                    )
                ).strip()

                if not content:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "detail": "Message cannot be empty",
                        }
                    )
                    continue

                message = create_message(
                    db,
                    conversation_id,
                    user.id,
                    content,
                )

                await manager.broadcast(
                    conversation_id,
                    {
                        "type": "message",
                        "message": (
                            serialize_message(
                                message
                            ).model_dump(
                                mode="json"
                            )
                        ),
                    },
                )

            elif event_type == "typing":

                await manager.broadcast(
                    conversation_id,
                    {
                        "type": "typing",
                        "user_id": user.id,
                        "is_typing": bool(
                            payload.get(
                                "is_typing"
                            )
                        ),
                    },
                )

            elif event_type == "read":

                message_id = int(
                    payload.get(
                        "message_id",
                        0,
                    )
                    or 0
                )

                message = (
                    db.query(Message)
                    .filter(
                        Message.id == message_id,
                        Message.conversation_id
                        == conversation_id,
                    )
                    .first()
                )

                if message:
                    message.status = "read"
                    db.commit()

                    await manager.broadcast(
                        conversation_id,
                        {
                            "type": "read",
                            "message_id": message_id,
                        },
                    )

    except WebSocketDisconnect:
        pass

    except HTTPException:
        await websocket.close(
            code=1008
        )

    except Exception:

        try:
            await websocket.send_json(
                {
                    "type": "error",
                    "detail": "Unable to process event",
                }
            )
        except Exception:
            pass

    finally:

        if user:
            manager.disconnect(
                conversation_id,
                user.id,
                websocket,
            )

            await manager.broadcast(
                conversation_id,
                {
                    "type": "presence",
                    "user_id": user.id,
                    "online": False,
                },
            )

        db.close()