"use client";

import { FormEvent, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Contact, Conversation, User } from "../lib/types";

type ConversationListProps = {
  token: string;
  user: User;
  conversations: Conversation[];
  contacts: Contact[];
  activeConversationId?: number;
  unreadCounts: Record<number, number>;
  onSelect: (conversation: Conversation) => void;
  onRefresh: () => Promise<void>;
  onOpenGroupModal: () => void;
  onLogout: () => void;
};

function formatConversationTime(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function ConversationList({
  token,
  user,
  conversations,
  contacts,
  activeConversationId,
  unreadCounts,
  onSelect,
  onRefresh,
  onOpenGroupModal,
  onLogout,
}: ConversationListProps) {
  const [conversationQuery, setConversationQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const filteredConversations = useMemo(() => {
    const query = conversationQuery.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) => {
      const latest = conversation.latest_message?.content || "";
      return conversation.name.toLowerCase().includes(query) || latest.toLowerCase().includes(query);
    });
  }, [conversationQuery, conversations]);

  const contactIds = useMemo(() => new Set(contacts.map((contact) => contact.contact.id)), [contacts]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const query = userQuery.trim();
    if (!query) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      setResults(await api.searchUsers(token, query));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function addContact(userId: number) {
    setError("");
    try {
      await api.addContact(token, userId);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add contact");
    }
  }

  async function startConversation(userId: number) {
    setError("");
    try {
      const conversation = await api.directConversation(token, userId);
      await onRefresh();
      onSelect(conversation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start conversation");
    }
  }

  return (
    <aside className="sidebar">
      <div className="profile-row">
        <div className="avatar">{user.avatar || user.display_name.slice(0, 1)}</div>
        <div>
          <strong>{user.display_name}</strong>
          <span>Secure messaging demo</span>
        </div>
        <button className="icon-button" onClick={onLogout} title="Logout" type="button">
          Logout
        </button>
      </div>

      <div className="sidebar-actions">
        <button className="secondary-action" onClick={onOpenGroupModal} type="button">
          + Group
        </button>
        <button className="secondary-action" onClick={onRefresh} type="button">
          Refresh
        </button>
      </div>

      <input
        className="search-input"
        value={conversationQuery}
        onChange={(event) => setConversationQuery(event.target.value)}
        placeholder="Search conversations"
      />

      <div className="conversation-scroll">
        {filteredConversations.map((conversation) => {
          const unread = unreadCounts[conversation.id] || conversation.unread_count || 0;
          return (
            <button
              className={`conversation-item ${activeConversationId === conversation.id ? "selected" : ""}`}
              key={conversation.id}
              onClick={() => onSelect(conversation)}
              type="button"
            >
              <div className="avatar small">{conversation.type === "group" ? "G" : conversation.name.slice(0, 1)}</div>
              <div className="conversation-text">
                <div className="conversation-title">
                  <strong>{conversation.name}</strong>
                  <span>{formatConversationTime(conversation.latest_message?.created_at || conversation.updated_at)}</span>
                </div>
                <p>{conversation.latest_message?.content || "No messages yet"}</p>
              </div>
              {unread > 0 && <span className="unread">{unread}</span>}
            </button>
          );
        })}
        {filteredConversations.length === 0 && <p className="empty-state">No conversations found.</p>}
      </div>

      <div className="search-users">
        <h2>New conversation</h2>
        <form onSubmit={search}>
          <input value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="Search users" />
          <button disabled={loading} type="submit">
            Search
          </button>
        </form>
        {error && <div className="error small-error">{error}</div>}
        <div className="result-list">
          {results.map((result) => (
            <div className="user-result" key={result.id}>
              <div className="avatar tiny">{result.avatar || result.display_name.slice(0, 1)}</div>
              <div>
                <strong>{result.display_name}</strong>
                <span>@{result.username}</span>
              </div>
              <button onClick={() => addContact(result.id)} type="button" disabled={contactIds.has(result.id)}>
                {contactIds.has(result.id) ? "Added" : "Add"}
              </button>
              <button onClick={() => startConversation(result.id)} type="button">
                Chat
              </button>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
