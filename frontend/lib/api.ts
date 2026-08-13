import type {
  AuthResponse,
  Contact,
  Conversation,
  ConversationMember,
  Message,
  User,
} from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

export const WS_URL = API_URL.replace(
  /^http/,
  "ws"
);

type ApiOptions = {
  token?: string | null;
  method?: string;
  body?: unknown;
};

async function apiRequest<T>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.token) {
    headers.Authorization =
      `Bearer ${options.token}`;
  }

  const response = await fetch(
    `${API_URL}${path}`,
    {
      method: options.method || "GET",
      headers,
      body:
        options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
    }
  );

  if (!response.ok) {
    let detail = "Request failed";

    try {
      const data = await response.json();
      detail = data.detail || detail;
    } catch {
      detail =
        response.statusText || detail;
    }

    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}

export const api = {
  register: (body: {
    username: string;
    phone?: string;
    password: string;
  }) =>
    apiRequest<AuthResponse>(
      "/auth/register",
      {
        method: "POST",
        body,
      }
    ),

  login: (body: {
    username: string;
    password: string;
  }) =>
    apiRequest<AuthResponse>(
      "/auth/login",
      {
        method: "POST",
        body,
      }
    ),

  logout: (token: string) =>
    apiRequest<{ detail: string }>(
      "/auth/logout",
      {
        method: "POST",
        token,
      }
    ),

  me: (token: string) =>
    apiRequest<User>(
      "/auth/me",
      {
        token,
      }
    ),

  searchUsers: (
    token: string,
    query: string
  ) =>
    apiRequest<User[]>(
      `/users/search?q=${encodeURIComponent(
        query
      )}`,
      {
        token,
      }
    ),

  contacts: (token: string) =>
    apiRequest<Contact[]>(
      "/contacts",
      {
        token,
      }
    ),

  addContact: (
    token: string,
    userId: number
  ) =>
    apiRequest<Contact>(
      `/contacts/${userId}`,
      {
        method: "POST",
        token,
      }
    ),

  conversations: (token: string) =>
    apiRequest<Conversation[]>(
      "/conversations",
      {
        token,
      }
    ),

  conversation: (
    token: string,
    conversationId: number
  ) =>
    apiRequest<Conversation>(
      `/conversations/${conversationId}`,
      {
        token,
      }
    ),

  directConversation: (
    token: string,
    userId: number
  ) =>
    apiRequest<Conversation>(
      "/conversations/direct",
      {
        method: "POST",
        token,
        body: {
          user_id: userId,
        },
      }
    ),

  groupConversation: (
    token: string,
    name: string,
    memberIds: number[]
  ) =>
    apiRequest<Conversation>(
      "/conversations/group",
      {
        method: "POST",
        token,
        body: {
          name,
          member_ids: memberIds,
        },
      }
    ),

  messages: (
    token: string,
    conversationId: number
  ) =>
    apiRequest<Message[]>(
      `/conversations/${conversationId}/messages`,
      {
        token,
      }
    ),

  sendMessage: (
    token: string,
    conversationId: number,
    content: string
  ) =>
    apiRequest<Message>(
      `/conversations/${conversationId}/messages`,
      {
        method: "POST",
        token,
        body: {
          content,
        },
      }
    ),

  members: (
    token: string,
    conversationId: number
  ) =>
    apiRequest<ConversationMember[]>(
      `/conversations/${conversationId}/members`,
      {
        token,
      }
    ),

  addMember: (
    token: string,
    conversationId: number,
    userId: number
  ) =>
    apiRequest<ConversationMember>(
      `/conversations/${conversationId}/members`,
      {
        method: "POST",
        token,
        body: {
          user_id: userId,
        },
      }
    ),

  removeMember: (
    token: string,
    conversationId: number,
    userId: number
  ) =>
    apiRequest<{ detail: string }>(
      `/conversations/${conversationId}/members/${userId}`,
      {
        method: "DELETE",
        token,
      }
    ),
};