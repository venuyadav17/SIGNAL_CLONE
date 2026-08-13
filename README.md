# Secure Messaging Platform

A small Signal-inspired full-stack messaging demo built for an SDE assignment. It focuses on clean architecture, working realtime messaging, SQLite persistence, and an interview-friendly codebase. It does not implement real Signal encryption.

## Problem Statement

Build a functional secure messaging platform where users can authenticate with a mocked OTP, manage contacts, create direct and group conversations, and exchange persistent realtime messages.

## Features

- Register, login, logout, and session restore with `Authorization: Bearer <token>`
- Fixed mocked OTP: `123456`
- User search, contacts, and direct conversation creation
- Recent conversations with latest message, timestamps, search, presence, and frontend unread indicators
- Persistent direct and group messages in SQLite
- Native FastAPI WebSockets for message, typing, read, and presence events
- Group creation, member list, admin-only add member, and admin-only remove member
- Signal-inspired light UI with a sidebar, chat panel, rounded message bubbles, and simulated encryption notice

## Technology Stack

- Frontend: Next.js, React, TypeScript, CSS
- Backend: Python, FastAPI
- Database: SQLite, SQLAlchemy
- Realtime: Native WebSockets
- Authentication: Mocked OTP sessions stored in SQLite

## Architecture

The backend is a compact FastAPI app. SQLAlchemy models define the database, Pydantic schemas define API contracts, and `app/main.py` contains the REST routes plus the WebSocket endpoint. The frontend is a Next.js app with client components for authentication, conversation browsing, chat, and group management.

## Database Schema

- `users`: account profile information
- `sessions`: random session tokens for mocked authentication
- `contacts`: unique user/contact pairs
- `conversations`: direct or group conversation metadata
- `conversation_members`: membership and group admin status
- `messages`: persistent message content, sender, status, and timestamp

## API Overview

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /users/search`
- `GET /contacts`
- `POST /contacts/{user_id}`
- `GET /conversations`
- `POST /conversations/direct`
- `POST /conversations/group`
- `GET /conversations/{conversation_id}`
- `GET /conversations/{conversation_id}/members`
- `POST /conversations/{conversation_id}/members`
- `DELETE /conversations/{conversation_id}/members/{user_id}`
- `GET /conversations/{conversation_id}/messages`
- `POST /conversations/{conversation_id}/messages`

All protected REST endpoints require `Authorization: Bearer <token>`.

## WebSocket Overview

Connect to:

```text
ws://localhost:8000/ws/{conversation_id}?token=<session_token>
```

Supported events:

- `message`: saves and broadcasts a message
- `typing`: broadcasts typing state
- `read`: marks a message as read and broadcasts the read event
- `presence`: broadcasts simple mocked online state

## Folder Structure

```text
backend/
  app/
    database.py
    main.py
    models.py
    schemas.py
    websocket.py
  seed.py
  requirements.txt
frontend/
  app/
  components/
  lib/
  package.json
README.md
```

## Local Setup

Backend:

```powershell
cd backend
..\.venv\Scripts\python.exe -m pip install -r requirements.txt
..\.venv\Scripts\python.exe seed.py
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The backend runs at `http://localhost:8000`.

## Seed Data

Run:

```powershell
cd backend
..\.venv\Scripts\python.exe seed.py
```

Seeded users:

- `alice`
- `bob`
- `charlie`
- `david`

Use OTP `123456` for every login.

## Authentication

Authentication is intentionally mocked. Registration and login validate only the fixed OTP, then create a secure random session token stored in the `sessions` table. Logout deletes the session token.

## Security Note

This project does not implement real end-to-end encryption, key exchange, phone verification, or Signal protocol behavior. The UI labels the app as an encryption simulation so it is clear this is a secure messaging demo, not production cryptography.

## Assumptions

- Presence is simple in-memory state based on WebSocket connections.
- Unread counts are frontend-local and reset when a conversation is opened.
- Message status is persisted as `sent` and can update to `read`.
- The SQLite database is local runtime data and is ignored by git.

## Future Improvements

- Per-user message receipts with durable unread counts
- Real authentication and phone verification
- Push notifications
- Attachments
- Full test suite with pytest and browser automation
