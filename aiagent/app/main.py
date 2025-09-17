# app/main.py
import uvicorn
import uuid
import asyncio
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.livekit_utils import generate_token, get_livekit_api_client
from app.llm import generate_call_summary
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="Warm Transfer Backend (LiveKit + LLM)")

class TokenRequest(BaseModel):
    identity: str
    room: Optional[str] = None
    name: Optional[str] = None

class CreateRoomRequest(BaseModel):
    room: str

class WarmTransferRequest(BaseModel):
    customer_room: str
    support_agent_identity: str        # Agent A identity (the one initiating transfer)
    supervisor_identity: str          # Agent B (the agent/human that will receive the transfer)
    transcript: Optional[str] = None  # conversation transcript (if available)
    consult_room: Optional[str] = None

@app.get("/health")
async def health():
    return {"ok": True}

@app.post("/token")
async def token(req: TokenRequest):
    try:
        token = generate_token(req.identity, room=req.room, name=req.name)
        return {"token": token, "livekit_url": None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/create_room")
async def create_room(req: CreateRoomRequest):
    async with await get_livekit_api_client() as api_client:
        create_req = api_client.proto_room.CreateRoomRequest(name=req.room)
        try:
            room = await api_client.room.create_room(create_req)
            return {"ok": True, "room": room.name}
        except Exception as e:
            # If room already exists, LiveKit may raise; return success if exists
            return {"ok": False, "error": str(e)}

@app.post("/warm_transfer")
async def warm_transfer(req: WarmTransferRequest):
    """
    Orchestration endpoint for warm transfer:
      - create consult room (if not provided)
      - generate summary using LLM (if transcript provided)
      - (optionally) create a TransferAgent token for consult room so TransferAgent can join
      - move the supervisor into the customer room (so supervisor and caller are connected)
      - instruct the support agent to disconnect / exit original room (frontend/agent must handle)
    Note: this endpoint orchestrates server-side steps. The actual speaking by agents is done by agent processes (see agents/agent_worker.py).
    """
    consult_room = req.consult_room or f"consult-{uuid.uuid4().hex[:8]}"
    try:
        # 1) create consult room
        async with await get_livekit_api_client() as api_client:
            create_req = api_client.proto_room.CreateRoomRequest(name=consult_room)
            try:
                await api_client.room.create_room(create_req)
            except Exception:
                # room may already exist; continue
                pass

            # 2) generate summary using LLM if transcript provided
            summary = None
            if req.transcript:
                summary = generate_call_summary(req.transcript)

            # 3) Generate token for supervisor to join consult room (if needed)
            supervisor_token = generate_token(req.supervisor_identity, room=consult_room)

            # 4) return orchestration details; actual TTS/speaking should be done by agent processes
            #    Provide the consult room name, supervisor token, and summary so frontends/agents can use them.
            # 5) Move supervisor into the caller room when ready (we do not force move here unless requested)
            #    But we can provide an immediate move: move_participant(consult_room, supervisor_identity, customer_room)
            # For safety, we return consult_room and summary and let the agent or operator control the exact timing.
            return {
                "ok": True,
                "consult_room": consult_room,
                "supervisor_token": supervisor_token,
                "summary": summary,
                "note": "Start TransferAgent in consult room (see agents/agent_worker.py). When ready, call /move_supervisor."
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class MoveSupervisorRequest(BaseModel):
    consult_room: str
    supervisor_identity: str
    customer_room: str

@app.post("/move_supervisor")
async def move_supervisor(req: MoveSupervisorRequest):
    """
    Use LiveKit server API to move a participant into the customer room.
    """
    async with await get_livekit_api_client() as api_client:
        # Build MoveParticipantRequest
        mv = api_client.proto_room.MoveParticipantRequest(
            room=req.consult_room,
            identity=req.supervisor_identity,
            destination_room=req.customer_room,
        )
        try:
            await api_client.room.move_participant(mv)
            return {"ok": True, "moved": req.supervisor_identity, "to": req.customer_room}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
