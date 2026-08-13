from collections import defaultdict

from fastapi import WebSocket


online_users: set[int] = set()


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, list[tuple[int, WebSocket]]] = defaultdict(list)

    async def connect(self, conversation_id: int, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[conversation_id].append((user_id, websocket))
        online_users.add(user_id)

    def disconnect(self, conversation_id: int, user_id: int, websocket: WebSocket):
        connections = self.active_connections.get(conversation_id, [])
        self.active_connections[conversation_id] = [
            (connected_user_id, connection)
            for connected_user_id, connection in connections
            if connection is not websocket
        ]
        if not any(
            connected_user_id == user_id
            for room_connections in self.active_connections.values()
            for connected_user_id, _ in room_connections
        ):
            online_users.discard(user_id)

    async def broadcast(self, conversation_id: int, payload: dict):
        dead_connections: list[tuple[int, WebSocket]] = []
        for user_id, websocket in list(self.active_connections.get(conversation_id, [])):
            try:
                await websocket.send_json(payload)
            except Exception:
                dead_connections.append((user_id, websocket))

        for user_id, websocket in dead_connections:
            self.disconnect(conversation_id, user_id, websocket)


manager = ConnectionManager()
