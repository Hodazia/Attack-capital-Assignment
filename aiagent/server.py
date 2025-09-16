import asyncio
import logging
import os
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Dict, List, Optional
import uvicorn

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from livekit import api
from livekit.api import AccessToken, VideoGrants

import openai as openai_sdk


load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class CallSession:
    room_id: str
    caller_id: str
    agent_a_id: Optional[str] = None
    agent_b_id: Optional[str] = None
    call_start: Optional[datetime] = None
    conversation_history: List[str] = None
    status: str = "active"  # active, transferring, completed

    def __post_init__(self):
        if self.conversation_history is None:
            self.conversation_history = []


class WarmTransferManager:
    def __init__(self) -> None:
        self.livekit_url = os.getenv("LIVEKIT_URL", "ws://localhost:7880")
        self.livekit_api_key = os.getenv("LIVEKIT_API_KEY")
        self.livekit_api_secret = os.getenv("LIVEKIT_API_SECRET")
        self.openai_api_key = os.getenv("OPENAI_API_KEY")

        if not self.livekit_api_key or not self.livekit_api_secret:
            logger.warning("LIVEKIT API credentials are not set. Room creation will fail.")

        openai_sdk.api_key = self.openai_api_key

        # lazily initialized LiveKit API client
        self.lk_api: Optional[api.LiveKitAPI] = None

        self.active_sessions: Dict[str, CallSession] = {}

    async def _ensure_lk_api(self) -> None:
        if self.lk_api is None:
            self.lk_api = api.LiveKitAPI(
                self.livekit_url,
                self.livekit_api_key,
                self.livekit_api_secret,
            )

    async def generate_access_token(self, room_name: str, identity: str) -> str:
        token = AccessToken(self.livekit_api_key, self.livekit_api_secret)
        token.with_identity(identity)
        token.with_name(identity)
        token.with_grants(
            VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
            )
        )
        return token.to_jwt()

    async def create_room(self, room_name: str) -> dict:
        await self._ensure_lk_api()
        try:
            room_request = api.CreateRoomRequest(name=room_name)
            room = await self.lk_api.room.create_room(room_request)
            logger.info(f"Created room: {room_name}")
            return {"room_id": room.name, "status": "created"}
        except Exception as e:
            logger.error(f"Failed to create room {room_name}: {e}")
            raise

    async def generate_call_summary(self, conversation_history: List[str]) -> str:
        try:
            context = "\n".join(conversation_history)
            if not context:
                return "No prior conversation context available."

            # OpenAI v1 SDK style
            client = openai_sdk.OpenAI(api_key=self.openai_api_key) if hasattr(openai_sdk, "OpenAI") else None

            if client:
                response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "Create a concise handoff summary for the next agent."},
                        {"role": "user", "content": f"Summarize this call context for warm transfer:\n\n{context}"},
                    ],
                    temperature=0.3,
                    max_tokens=200,
                )
                return response.choices[0].message.content.strip()
            else:
                # Fallback to older API if necessary
                response = await openai_sdk.ChatCompletion.acreate(
                    model="gpt-3.5-turbo",
                    messages=[
                        {"role": "system", "content": "Create a concise handoff summary for the next agent."},
                        {"role": "user", "content": f"Summarize this call context for warm transfer:\n\n{context}"},
                    ],
                    temperature=0.3,
                    max_tokens=200,
                )
                return response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"Failed to generate call summary: {e}")
            return "Unable to generate call summary. Please recap the concern briefly."

    async def initiate_call(self, caller_id: str) -> dict:
        room_name = f"call_{caller_id}_{int(datetime.now().timestamp())}"
        await self.create_room(room_name)
        session = CallSession(room_id=room_name, caller_id=caller_id, call_start=datetime.now())
        self.active_sessions[room_name] = session
        caller_token = await self.generate_access_token(room_name, f"caller_{caller_id}")
        return {"room_id": room_name, "caller_token": caller_token, "status": "call_initiated"}

    async def connect_agent(self, room_id: str, agent_id: str, agent_type: str = "A") -> dict:
        if room_id not in self.active_sessions:
            raise HTTPException(status_code=404, detail="Call session not found")
        session = self.active_sessions[room_id]
        agent_token = await self.generate_access_token(room_id, f"agent_{agent_id}")
        if agent_type.upper() == "A":
            session.agent_a_id = agent_id
        else:
            session.agent_b_id = agent_id
        return {"room_id": room_id, "agent_token": agent_token, "agent_type": agent_type, "status": "agent_connected"}

    async def initiate_warm_transfer(self, room_id: str, agent_b_id: str) -> dict:
        if room_id not in self.active_sessions:
            raise HTTPException(status_code=404, detail="Call session not found")
        session = self.active_sessions[room_id]
        session.status = "transferring"

        transfer_room_name = f"transfer_{room_id}_{int(datetime.now().timestamp())}"
        await self.create_room(transfer_room_name)

        agent_a_token = await self.generate_access_token(transfer_room_name, f"agent_{session.agent_a_id}")
        agent_b_token = await self.generate_access_token(transfer_room_name, f"agent_{agent_b_id}")

        call_summary = await self.generate_call_summary(session.conversation_history)
        session.agent_b_id = agent_b_id

        return {
            "original_room_id": room_id,
            "transfer_room_id": transfer_room_name,
            "agent_a_token": agent_a_token,
            "agent_b_token": agent_b_token,
            "call_summary": call_summary,
            "status": "transfer_initiated",
        }

    async def complete_transfer(self, room_id: str) -> dict:
        if room_id not in self.active_sessions:
            raise HTTPException(status_code=404, detail="Call session not found")
        session = self.active_sessions[room_id]
        agent_b_token = await self.generate_access_token(room_id, f"agent_{session.agent_b_id}")
        session.status = "completed"
        session.agent_a_id = None
        return {"room_id": room_id, "agent_b_token": agent_b_token, "status": "transfer_completed"}

    async def add_conversation_entry(self, room_id: str, message: str, speaker: str) -> dict:
        if room_id not in self.active_sessions:
            raise HTTPException(status_code=404, detail="Call session not found")
        session = self.active_sessions[room_id]
        timestamp = datetime.now().strftime("%H:%M:%S")
        entry = f"[{timestamp}] {speaker}: {message}"
        session.conversation_history.append(entry)
        return {"status": "conversation_updated"}

    def get_session_info(self, room_id: str) -> dict:
        if room_id not in self.active_sessions:
            raise HTTPException(status_code=404, detail="Call session not found")
        session = self.active_sessions[room_id]
        return asdict(session)


app = FastAPI(title="Warm Transfer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

transfer_manager = WarmTransferManager()


class InitiateCallRequest(BaseModel):
    caller_id: str


class ConnectAgentRequest(BaseModel):
    agent_id: str
    agent_type: str = "A"


class InitiateTransferRequest(BaseModel):
    agent_b_id: str


class ConversationEntryRequest(BaseModel):
    message: str
    speaker: str


@app.post("/api/calls/initiate")
async def initiate_call(request: InitiateCallRequest):
    return await transfer_manager.initiate_call(request.caller_id)


@app.post("/api/calls/{room_id}/connect-agent")
async def connect_agent(room_id: str, request: ConnectAgentRequest):
    return await transfer_manager.connect_agent(room_id, request.agent_id, request.agent_type)


@app.post("/api/calls/{room_id}/initiate-transfer")
async def initiate_transfer(room_id: str, request: InitiateTransferRequest):
    return await transfer_manager.initiate_warm_transfer(room_id, request.agent_b_id)


@app.post("/api/calls/{room_id}/complete-transfer")
async def complete_transfer(room_id: str):
    return await transfer_manager.complete_transfer(room_id)


@app.post("/api/calls/{room_id}/conversation")
async def add_conversation_entry(room_id: str, request: ConversationEntryRequest):
    return await transfer_manager.add_conversation_entry(room_id, request.message, request.speaker)


@app.get("/api/calls/{room_id}/info")
async def get_session_info(room_id: str):
    return transfer_manager.get_session_info(room_id)


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "Warm Transfer API"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)


