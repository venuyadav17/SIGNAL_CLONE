export type User = {
  id: number;
  username: string;
  phone?: string | null;
  display_name: string;
  avatar?: string | null;
  created_at: string;
  online: boolean;
  last_seen: string;
};

export type AuthResponse = {
  token: string;
  user: User;
};

export type Contact = {
  id: number;
  contact: User;
  created_at: string;
};

export type ConversationMember = {
  id: number;
  user: User;
  is_admin: boolean;
  joined_at: string;
};

export type Message = {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  status:
    | "sending"
    | "sent"
    | "delivered"
    | "read";
  created_at: string;
};

export type Conversation = {
  id: number;
  type: "direct" | "group";
  name: string;
  created_at: string;
  updated_at: string;
  members: ConversationMember[];
  latest_message?: Message | null;
  unread_count: number;
};

export type SocketEvent =
  | {
      type: "message";
      message: Message;
    }
  | {
      type: "typing";
      user_id: number;
      is_typing: boolean;
    }
  | {
      type: "read";
      message_id: number;
    }
  | {
      type: "presence";
      user_id: number;
      online: boolean;
    }
  | {
      type: "error";
      detail: string;
    };