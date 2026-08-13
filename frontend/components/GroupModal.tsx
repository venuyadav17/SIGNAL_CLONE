"use client";

import { FormEvent, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Conversation, Contact, User } from "../lib/types";

type GroupModalProps = {
  token: string;
  contacts: Contact[];
  onClose: () => void;
  onCreated: (conversation: Conversation) => void;
};

export default function GroupModal({ token, contacts, onClose, onCreated }: GroupModalProps) {
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const selectableUsers = useMemo(() => {
    const map = new Map<number, User>();
    contacts.forEach((contact) => map.set(contact.contact.id, contact.contact));
    results.forEach((user) => map.set(user.id, user));
    return Array.from(map.values());
  }, [contacts, results]);

  function toggleUser(userId: number) {
    setSelectedIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery) return;
    try {
      setResults(await api.searchUsers(token, cleanQuery));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    }
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const conversation = await api.groupConversation(token, name, selectedIds);
      onCreated(conversation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create group");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="modal">
        <div className="modal-header">
          <h1>Create group</h1>
          <button className="icon-button" onClick={onClose} type="button">
            Close
          </button>
        </div>

        <form className="group-form" onSubmit={createGroup}>
          <label>
            Group name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Project Room" required />
          </label>
          <div className="selectable-list">
            {selectableUsers.map((candidate) => (
              <label className="checkbox-row" key={candidate.id}>
                <input
                  checked={selectedIds.includes(candidate.id)}
                  onChange={() => toggleUser(candidate.id)}
                  type="checkbox"
                />
                <span>{candidate.display_name}</span>
                <small>@{candidate.username}</small>
              </label>
            ))}
            {selectableUsers.length === 0 && <p className="muted">Add contacts or search users to select members.</p>}
          </div>
          {error && <div className="error">{error}</div>}
          <button className="primary-action" disabled={loading} type="submit">
            {loading ? "Creating..." : "Create group"}
          </button>
        </form>

        <form className="member-search modal-search" onSubmit={search}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search more users" />
          <button type="submit">Search</button>
        </form>
      </section>
    </div>
  );
}
