"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api, WS_URL } from "../lib/api";
import type { Conversation, ConversationMember, Message, SocketEvent, User } from "../lib/types";

type ChatProps = {
  token: string;
  user: User;
  conversation?: Conversation;
  onMessage: (conversationId: number, message: Message) => void;
  onRead: (conversationId: number, messageId: number) => void;
  onPresenceChange: (userId: number, online: boolean) => void;
  onConversationChanged: () => Promise<void>;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export default function Chat({
  token,
  user,
  conversation,
  onMessage,
  onRead,
  onPresenceChange,
  onConversationChanged,
}: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const [typingUsers, setTypingUsers] = useState<Record<number, boolean>>({});
  const [error, setError] = useState("");
  const [members, setMembers] = useState<ConversationMember[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<User[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAdmin = useMemo(
    () => members.some((member) => member.user.id === user.id && member.is_admin),
    [members, user.id],
  );

  useEffect(() => {
    if (!conversation) return;
    const activeConversation = conversation;
    let cancelled = false;
    setError("");
    setTypingUsers({});
    setMembers(activeConversation.members);

    async function loadMessages() {
      try {
        const history = await api.messages(token, activeConversation.id);
        if (!cancelled) {
          setMessages(history);
          history.forEach((message) => {
            if (message.sender_id !== user.id) {
              wsRef.current?.send(JSON.stringify({ type: "read", message_id: message.id }));
            }
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load messages");
        }
      }
    }

    loadMessages();
    const socket = new WebSocket(`${WS_URL}/ws/${activeConversation.id}?token=${encodeURIComponent(token)}`);
    wsRef.current = socket;

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as SocketEvent;
      if (payload.type === "message") {
        setMessages((current) => {
          if (current.some((message) => message.id === payload.message.id)) return current;
          return [...current, payload.message];
        });
        onMessage(activeConversation.id, payload.message);
        if (payload.message.sender_id !== user.id && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "read", message_id: payload.message.id }));
        }
      }
      if (payload.type === "typing" && payload.user_id !== user.id) {
        setTypingUsers((current) => ({ ...current, [payload.user_id]: payload.is_typing }));
      }
      if (payload.type === "read") {
        setMessages((current) =>
          current.map((message) => (message.id === payload.message_id ? { ...message, status: "read" } : message)),
        );
        onRead(activeConversation.id, payload.message_id);
      }
      if (payload.type === "presence") {
        onPresenceChange(payload.user_id, payload.online);
      }
      if (payload.type === "error") {
        setError(payload.detail);
      }
    };

    socket.onerror = () => setError("Realtime connection issue. Messages can still load with refresh.");

    return () => {
      cancelled = true;
      socket.close();
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [conversation, onConversationChanged, onMessage, onPresenceChange, onRead, token, user.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!conversation) {
    return (
      <section className="chat-empty">
        <div className="brand-mark">S</div>
        <h1>Select a conversation</h1>
        <p className="muted">Search users, open an existing chat, or create a group.</p>
      </section>
    );
  }

  const activeConversation = conversation;
  const otherMembers = members.filter((member) => member.user.id !== user.id);
  const activeTypingNames = Object.entries(typingUsers)
    .filter(([, isTyping]) => isTyping)
    .map(([userId]) => members.find((member) => member.user.id === Number(userId))?.user.display_name)
    .filter(Boolean);

  function handleTyping(value: string) {
    setMessageText(value);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "typing", is_typing: true }));
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        wsRef.current?.send(JSON.stringify({ type: "typing", is_typing: false }));
      }, 900);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = messageText.trim();
    if (!content) return;
    setError("");
    setMessageText("");
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "message", content }));
      } else {
        const created = await api.sendMessage(token, activeConversation.id, content);
        setMessages((current) => [...current, created]);
        onMessage(activeConversation.id, created);
      }
      await onConversationChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message");
      setMessageText(content);
    }
  }

  async function searchMembers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = memberQuery.trim();
    if (!query) {
      setMemberResults([]);
      return;
    }
    try {
      setMemberResults(await api.searchUsers(token, query));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not search users");
    }
  }

  async function addMember(userId: number) {
    try {
      await api.addMember(token, activeConversation.id, userId);
      const updated = await api.members(token, activeConversation.id);
      setMembers(updated);
      setMemberResults([]);
      setMemberQuery("");
      await onConversationChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add member");
    }
  }

  async function removeMember(userId: number) {
    try {
      await api.removeMember(token, activeConversation.id, userId);
      setMembers((current) => current.filter((member) => member.user.id !== userId));
      await onConversationChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove member");
    }
  }

  return (
    <section className="chat-panel">
      <header className="chat-header">
        <div className="avatar">{activeConversation.type === "group" ? "G" : activeConversation.name.slice(0, 1)}</div>
        <div>
          <h1>{activeConversation.name}</h1>
          <p>
            {activeConversation.type === "group"
              ? `${members.length} members`
              : otherMembers[0]?.user.online
                ? "Online"
                : "Last seen recently"}
          </p>
        </div>
        <span className="security-pill">Encryption simulated for demo</span>
      </header>

      {activeConversation.type === "group" && (
        <div className="members-bar">
          <div className="member-list">
            {members.map((member) => (
              <span className="member-chip" key={member.user.id}>
                {member.user.display_name}
                {member.is_admin ? " admin" : ""}
                {isAdmin && member.user.id !== user.id && (
                  <button onClick={() => removeMember(member.user.id)} title="Remove member" type="button">
                    x
                  </button>
                )}
              </span>
            ))}
          </div>
          {isAdmin && (
            <form className="member-search" onSubmit={searchMembers}>
              <input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Add member" />
              <button type="submit">Find</button>
              {memberResults.map((result) => (
                <button key={result.id} onClick={() => addMember(result.id)} type="button">
                  + {result.display_name}
                </button>
              ))}
            </form>
          )}
        </div>
      )}

      <div className="messages">
        {messages.map((message) => {
          const mine = message.sender_id === user.id;
          const sender = members.find((member) => member.user.id === message.sender_id)?.user;
          return (
            <div className={`message-row ${mine ? "mine" : ""}`} key={message.id}>
              <div className="message-bubble">
                {activeConversation.type === "group" && !mine && <strong>{sender?.display_name || "Member"}</strong>}
                <p>{message.content}</p>
                <span>
                  {formatTime(message.created_at)} {mine ? `· ${message.status}` : ""}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="typing-line">{activeTypingNames.length > 0 ? `${activeTypingNames.join(", ")} typing...` : ""}</div>
      {error && <div className="error chat-error">{error}</div>}

      <form className="composer" onSubmit={sendMessage}>
        <input
          value={messageText}
          onChange={(event) => handleTyping(event.target.value)}
          placeholder="Type a message"
          maxLength={4000}
        />
        <button type="submit">Send</button>
      </form>
    </section>
  );
}
