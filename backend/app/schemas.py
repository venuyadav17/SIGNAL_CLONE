from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserBase(BaseModel):
    id: int
    username: str
    phone: str | None = None
    display_name: str
    avatar: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserPublic(UserBase):
    online: bool = False
    last_seen: str = "Last seen recently"


class RegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=50)
    phone: str | None = Field(default=None, max_length=30)
    display_name: str = Field(min_length=1, max_length=100)
    otp: str


class LoginRequest(BaseModel):
    username: str = Field(min_length=2, max_length=50)
    otp: str


class AuthResponse(BaseModel):
    token: str
    user: UserPublic


class ContactResponse(BaseModel):
    id: int
    contact: UserPublic
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConversationMemberResponse(BaseModel):
    id: int
    user: UserPublic
    is_admin: bool
    joined_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    content: str
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConversationResponse(BaseModel):
    id: int
    type: str
    name: str
    created_at: datetime
    updated_at: datetime
    members: list[ConversationMemberResponse] = []
    latest_message: MessageResponse | None = None
    unread_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class DirectConversationRequest(BaseModel):
    user_id: int


class GroupConversationRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    member_ids: list[int] = Field(default_factory=list)


class MessageCreateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class AddMemberRequest(BaseModel):
    user_id: int


class StatusResponse(BaseModel):
    detail: str
