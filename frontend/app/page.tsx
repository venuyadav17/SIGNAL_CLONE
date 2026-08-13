"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Auth from "../components/Auth";
import Chat from "../components/Chat";
import ConversationList from "../components/ConversationList";
import GroupModal from "../components/GroupModal";
import { api, WS_URL } from "../lib/api";
import type {
  AuthResponse,
  Contact,
  Conversation,
  Message,
  SocketEvent,
  User,
} from "../lib/types";

const TOKEN_KEY = "secure_messaging_token";
const THEME_KEY = "secure_messaging_theme";

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeConversationId, setActiveConversationId] =
    useState<number | undefined>();
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [groupModalOpen, setGroupModalOpen] = useState(false);

  const [theme, setTheme] = useState<"light" | "dark">("light");

  const backgroundSocketsRef = useRef<Record<number, WebSocket>>({});
  const activeConversationIdRef = useRef<number | undefined>(undefined);

  const activeConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.id === activeConversationId
      ),
    [activeConversationId, conversations],
  );

  /* =========================================================
     THEME
     ========================================================= */

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_KEY);

    if (savedTheme === "dark" || savedTheme === "light") {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((current) =>
      current === "light" ? "dark" : "light"
    );
  }

  /* =========================================================
     DATA
     ========================================================= */

  const refreshData = useCallback(async () => {
    if (!token) return;

    const [freshConversations, freshContacts] =
      await Promise.all([
        api.conversations(token),
        api.contacts(token),
      ]);

    setConversations(freshConversations);
    setContacts(freshContacts);
  }, [token]);

  useEffect(() => {
    async function restoreSession() {
      const storedToken = localStorage.getItem(TOKEN_KEY);

      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        const me = await api.me(storedToken);

        setToken(storedToken);
        setUser(me);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
      } finally {
        setLoading(false);
      }
    }

    restoreSession();
  }, []);

  useEffect(() => {
    if (token && user) {
      refreshData().catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : "Could not load conversations"
        )
      );
    }
  }, [refreshData, token, user]);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    return () => {
      Object.values(backgroundSocketsRef.current).forEach(
        (socket) => socket.close()
      );

      backgroundSocketsRef.current = {};
    };
  }, []);

  useEffect(() => {
    const sockets = backgroundSocketsRef.current;

    if (!token || !user) {
      Object.values(sockets).forEach(
        (socket) => socket.close()
      );

      backgroundSocketsRef.current = {};
      return;
    }

    const backgroundConversationIds = new Set(
      conversations
        .filter(
          (conversation) =>
            conversation.id !== activeConversationId
        )
        .map((conversation) => conversation.id),
    );

    Object.entries(sockets).forEach(
      ([conversationId, socket]) => {
        if (
          !backgroundConversationIds.has(
            Number(conversationId)
          )
        ) {
          socket.close();
          delete sockets[Number(conversationId)];
        }
      }
    );

    conversations.forEach((conversation) => {
      if (
        conversation.id === activeConversationId ||
        sockets[conversation.id]
      ) {
        return;
      }

      const socket = new WebSocket(
        `${WS_URL}/ws/${conversation.id}?token=${encodeURIComponent(
          token
        )}`
      );

      sockets[conversation.id] = socket;

      socket.onmessage = (event) => {
        const payload = JSON.parse(
          event.data
        ) as SocketEvent;

        if (payload.type === "message") {
          handleMessage(
            conversation.id,
            payload.message
          );
        }

        if (payload.type === "read") {
          handleRead(
            conversation.id,
            payload.message_id
          );
        }

        if (payload.type === "presence") {
          handlePresenceChange(
            payload.user_id,
            payload.online
          );
        }
      };

      socket.onclose = () => {
        delete sockets[conversation.id];
      };
    });
  }, [
    activeConversationId,
    conversations,
    token,
    user,
  ]);

  function handleAuthenticated(
    auth: AuthResponse
  ) {
    localStorage.setItem(
      TOKEN_KEY,
      auth.token
    );

    setToken(auth.token);
    setUser(auth.user);
    setError("");
  }

  async function logout() {
    if (token) {
      try {
        await api.logout(token);
      } catch {
        // Local logout still protects the UI
        // if the server already invalidated the token.
      }
    }

    localStorage.removeItem(TOKEN_KEY);

    setToken(null);
    setUser(null);
    setConversations([]);
    setContacts([]);
    setActiveConversationId(undefined);
    setUnreadCounts({});
  }

  function selectConversation(
    conversation: Conversation
  ) {
    setConversations((current) => {
      if (
        current.some(
          (item) => item.id === conversation.id
        )
      ) {
        return current;
      }

      return [conversation, ...current];
    });

    setActiveConversationId(conversation.id);

    setUnreadCounts((current) => ({
      ...current,
      [conversation.id]: 0,
    }));
  }

  function handleMessage(
    conversationId: number,
    message: Message
  ) {
    setConversations((current) => {
      const next = current.map(
        (conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                latest_message: message,
                updated_at: message.created_at,
              }
            : conversation
      );

      return next.sort(
        (left, right) =>
          new Date(
            right.updated_at
          ).getTime() -
          new Date(
            left.updated_at
          ).getTime()
      );
    });

    if (
      conversationId !==
        activeConversationIdRef.current &&
      message.sender_id !== user?.id
    ) {
      setUnreadCounts((current) => ({
        ...current,
        [conversationId]:
          (current[conversationId] || 0) + 1,
      }));
    }
  }

  function handleRead(
    conversationId: number,
    messageId: number
  ) {
    setConversations((current) =>
      current.map((conversation) => {
        if (
          conversation.id !==
            conversationId ||
          conversation.latest_message?.id !==
            messageId
        ) {
          return conversation;
        }

        return {
          ...conversation,
          latest_message: {
            ...conversation.latest_message,
            status: "read",
          },
        };
      })
    );
  }

  function handlePresenceChange(
    userId: number,
    online: boolean
  ) {
    setConversations((current) =>
      current.map((conversation) => ({
        ...conversation,
        members: conversation.members.map(
          (member) =>
            member.user.id === userId
              ? {
                  ...member,
                  user: {
                    ...member.user,
                    online,
                    last_seen: online
                      ? "Online"
                      : "Last seen recently",
                  },
                }
              : member
        ),
      }))
    );
  }

  async function handleGroupCreated(
    conversation: Conversation
  ) {
    setGroupModalOpen(false);

    await refreshData();

    selectConversation(conversation);
  }

  if (loading) {
    return (
      <main className="loading-shell">
        <div className="brand-mark">S</div>
        <p>Loading secure messaging demo...</p>
      </main>
    );
  }

  if (!token || !user) {
  return (
    <Auth
      onAuthenticated={handleAuthenticated}
      onToggleTheme={toggleTheme}
      theme={theme}
    />
  );
}

  return (
    <main className="app-shell">
      <ConversationList
        token={token}
        user={user}
        conversations={conversations}
        contacts={contacts}
        activeConversationId={activeConversationId}
        unreadCounts={unreadCounts}
        onSelect={selectConversation}
        onRefresh={refreshData}
        onOpenGroupModal={() =>
          setGroupModalOpen(true)
        }
        onLogout={logout}
        onToggleTheme={toggleTheme}
        theme={theme}
      />

      <Chat
        token={token}
        user={user}
        conversation={activeConversation}
        onConversationChanged={refreshData}
        onMessage={handleMessage}
        onPresenceChange={handlePresenceChange}
        onRead={handleRead}
      />

      {groupModalOpen && (
        <GroupModal
          token={token}
          contacts={contacts}
          onClose={() =>
            setGroupModalOpen(false)
          }
          onCreated={handleGroupCreated}
        />
      )}

      {error && (
        <div className="toast-error">
          {error}
        </div>
      )}
    </main>
  );
}