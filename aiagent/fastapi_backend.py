import os
import logging
from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from livekit import api

from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger("fastapi-backend")
logger.setLevel(logging.INFO)

# Load env vars for LiveKit API
LIVEKIT_URL = os.getenv("LIVEKIT_URL", "http://localhost:7880")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "devkey")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "secret")

lkapi = api.LiveKitAPI(
    LIVEKIT_URL,
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET,
)

app = FastAPI(
    title="AI Agent Control API",
    description="FastAPI backend to control LiveKit AI agents",
    version="1.0.0",
)

# Allow CORS from frontend (Next.js)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TransferRequest(BaseModel):
    room: str

@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "livekit_url": LIVEKIT_URL}

@app.post("/api/request-transfer")
async def request_transfer(payload: TransferRequest):
    """
    Ask the agent worker to start a warm transfer.
    For now, we'll trigger by sending a metadata update into the room.
    Your agent worker listens for user function call (`transfer_to_agent_b`) anyway,
    so this endpoint can mark metadata, or simply instruct via LiveKit API.
    """
    try:
        # Option 1: update room metadata (your worker could listen)
        await lkapi.room.update_room_metadata(
            api.UpdateRoomMetadataRequest(
                room=payload.room,
                metadata="transfer_requested"
            )
        )
        logger.info(f"Transfer requested for room {payload.room}")
        return {"ok": True, "room": payload.room}
    except Exception as e:
        logger.exception("Failed to request transfer")
        return {"ok": False, "error": str(e)}
