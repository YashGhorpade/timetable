"""
RealtimeService — Socket.IO event emission and room management.

Architecture:
  - One Socket.IO server shared across the FastAPI app
  - Clients join rooms based on their role + entity IDs
  - When timetable changes, emit to all affected rooms

Room naming conventions:
  - "admin"                      → all admin clients
  - "teacher:{teacher_id}"       → specific teacher
  - "section:{section_id}"       → all students in a section
  - "batch:{batch_id}"           → specific batch students
  - "classroom:{classroom_id}"   → classroom occupancy watchers
  - "version:{version_id}"       → anyone watching this timetable version

Events:
  TIMETABLE_UPDATED  → entry moved, generated, published
  TEACHER_UPDATED    → teacher profile changed
  CLASSROOM_UPDATED  → classroom data changed
  SECTION_UPDATED    → section/batch changed
  SUBJECT_UPDATED    → subject data changed
  NOTIFICATION       → targeted user notification
"""
import socketio
from typing import Any, Dict, Optional


# ─── Singleton Socket.IO server ───────────────────────────────────────────────
# Using Redis adapter for horizontal scaling when deployed with multiple workers.

def create_sio(redis_url: Optional[str] = None) -> socketio.AsyncServer:
    if redis_url:
        mgr = socketio.AsyncRedisManager(redis_url)
        sio = socketio.AsyncServer(
            async_mode="asgi",
            client_manager=mgr,
            cors_allowed_origins="*",
            logger=False,
            engineio_logger=False,
        )
    else:
        sio = socketio.AsyncServer(
            async_mode="asgi",
            cors_allowed_origins="*",
            logger=False,
            engineio_logger=False,
        )
    return sio


# Module-level sio instance (initialized in main.py)
_sio: Optional[socketio.AsyncServer] = None


def get_sio() -> socketio.AsyncServer:
    global _sio
    if _sio is None:
        raise RuntimeError("Socket.IO server not initialized. Call init_sio() first.")
    return _sio


def init_sio(redis_url: Optional[str] = None) -> socketio.AsyncServer:
    global _sio
    _sio = create_sio(redis_url)
    _register_handlers(_sio)
    return _sio


def _register_handlers(sio: socketio.AsyncServer) -> None:
    @sio.event
    async def connect(sid, environ, auth):
        """
        Client sends auth = {"token": "<access_token>", "rooms": ["teacher:xxx", "section:yyy"]}
        We verify the token and join the client to their rooms.
        """
        if not auth or "token" not in auth:
            return False  # reject

        from app.core.security import verify_access_token
        user_id = verify_access_token(auth["token"])
        if not user_id:
            return False  # reject unauthenticated

        # Join role-specific rooms passed from client
        rooms = auth.get("rooms", [])
        for room in rooms:
            await sio.enter_room(sid, room)

        # Always join user-specific room
        await sio.enter_room(sid, f"user:{user_id}")

    @sio.event
    async def disconnect(sid):
        pass

    @sio.event
    async def join_room(sid, data):
        """Client can join additional rooms after connect."""
        room = data.get("room")
        if room:
            await sio.enter_room(sid, room)

    @sio.event
    async def leave_room(sid, data):
        room = data.get("room")
        if room:
            await sio.leave_room(sid, room)


# ─── RealtimeService ─────────────────────────────────────────────────────────

class RealtimeService:
    """
    Wraps Socket.IO emission with room-targeting logic.
    Injected into service layer; services call emit() without knowing Socket.IO details.
    """

    def __init__(self, sio: Optional[socketio.AsyncServer] = None):
        self._sio = sio

    def emit(self, event: str, data: Dict[str, Any]) -> None:
        """
        Synchronous wrapper — schedules async emission.
        Determines which rooms to notify based on event data.
        """
        if self._sio is None:
            return

        import asyncio
        rooms = self._resolve_rooms(event, data)
        for room in rooms:
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.ensure_future(self._sio.emit(event, data, room=room))
                else:
                    loop.run_until_complete(self._sio.emit(event, data, room=room))
            except Exception:
                pass  # never let realtime errors break the main flow

    def _resolve_rooms(self, event: str, data: Dict[str, Any]) -> list:
        """
        Dependency-aware room resolution:
          - Always notify admin room
          - Notify teacher room if teacher_id present
          - Notify section room if section_id present
          - Notify classroom room if classroom_id present
          - Notify version room if version_id present
        """
        rooms = ["admin"]

        if "version_id" in data:
            rooms.append(f"version:{data['version_id']}")
        if "teacher_id" in data:
            rooms.append(f"teacher:{data['teacher_id']}")
        if "section_id" in data:
            rooms.append(f"section:{data['section_id']}")
        if "batch_id" in data:
            rooms.append(f"batch:{data['batch_id']}")
        if "classroom_id" in data:
            rooms.append(f"classroom:{data['classroom_id']}")
        if "department_id" in data:
            rooms.append(f"department:{data['department_id']}")
        if "user_id" in data:
            rooms.append(f"user:{data['user_id']}")

        return list(dict.fromkeys(rooms))  # deduplicate preserving order


# ─── FastAPI dependency ───────────────────────────────────────────────────────

def get_realtime_service() -> RealtimeService:
    try:
        sio = get_sio()
    except RuntimeError:
        sio = None
    return RealtimeService(sio)
