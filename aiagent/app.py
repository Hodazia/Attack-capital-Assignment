import asyncio
import logging
import os
from typing import Literal

from dotenv import load_dotenv

from livekit import api, rtc
from livekit.agents import (
    Agent,
    AgentSession,
    AudioConfig,
    BackgroundAudioPlayer,
    JobContext,
    PlayHandle,
    RoomInputOptions,
    RunContext,
    WorkerOptions,
    cli,
    llm,
    stt,
    tts,
)
from livekit.agents.llm import function_tool
from livekit.plugins import cartesia, deepgram, noise_cancellation, openai, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

logger = logging.getLogger("basic-agent")
logger.setLevel(logging.DEBUG)
logging.getLogger().setLevel(logging.DEBUG)

load_dotenv()

# status enums representing the two sessions
SupervisorStatus = Literal["inactive", "summarizing", "merged", "failed"]
CustomerStatus = Literal["active", "escalated", "passive"]


class SessionManager:
    """
    Helper class to orchestrate the session flow
    """

    def __init__(
        self,
        *,
        ctx: JobContext,
        customer_room: rtc.Room,
        customer_session: AgentSession,
        lkapi: api.LiveKitAPI,
    ):
        self.ctx = ctx
        self.customer_session = customer_session
        self.customer_room = customer_room
        self.background_audio = BackgroundAudioPlayer()
        self.hold_audio_handle: PlayHandle | None = None

        self.supervisor_session: AgentSession | None = None
        self.supervisor_room: rtc.Room | None = None
        self.lkapi = lkapi

        self.customer_status: CustomerStatus = "active"
        self.supervisor_status: SupervisorStatus = "inactive"

    async def start(self) -> None:
        await self.background_audio.start(
            room=self.customer_room, agent_session=self.customer_session
        )

    async def start_transfer(self):
        """
        Start a warm transfer to Agent B instead of human supervisor.
        """
        if self.customer_status != "active":
            return

        self.customer_status = "escalated"
        self.start_hold()

        try:
            supervisor_room_name = self.customer_room.name + "-supervisor"
            self.supervisor_room = rtc.Room()
            token = (
                api.AccessToken()
                .with_identity("agent-b")
                .with_grants(
                    api.VideoGrants(
                        room_join=True,
                        room=supervisor_room_name,
                        can_update_own_metadata=True,
                        can_publish=True,
                        can_subscribe=True,
                    )
                )
            )

            logger.info(f"connecting Agent B to supervisor room {supervisor_room_name}")

            await self.supervisor_room.connect(os.getenv("LIVEKIT_URL"), token.to_jwt())
            self.supervisor_room.on("disconnected", self.on_supervisor_room_close)

            self.supervisor_session = AgentSession(
                vad=silero.VAD.load(),
                llm=_create_llm(),
                stt=_create_stt(),
                tts=_create_tts(),
                turn_detection=MultilingualModel(),
            )

            supervisor_agent = SupervisorAgent(prev_ctx=self.customer_session.history)
            supervisor_agent.session_manager = self

            await self.supervisor_session.start(
                agent=supervisor_agent,
                room=self.supervisor_room,
                room_input_options=RoomInputOptions(close_on_disconnect=True),
            )

            self.supervisor_status = "summarizing"

        except Exception:
            logger.exception("could not start transfer")
            self.customer_status = "active"
            await self.set_supervisor_failed()

    def on_supervisor_room_close(self, reason: rtc.DisconnectReason):
        asyncio.create_task(self.set_supervisor_failed())

    def on_customer_participant_disconnected(self, participant: rtc.RemoteParticipant):
        if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
            return

        logger.info(f"participant disconnected: {participant.identity}, deleting room")
        self.customer_room.off(
            "participant_disconnected", self.on_customer_participant_disconnected
        )
        self.ctx.delete_room()

    async def set_supervisor_failed(self):
        self.supervisor_status = "failed"

        # notify customer if transfer fails
        self.stop_hold()
        self.customer_session.generate_reply(
            instructions="let the user know that we are unable to connect them to another agent right now."
        )

        if self.supervisor_session:
            await self.supervisor_session.aclose()
            self.supervisor_session = None

    async def merge_calls(self):
        if self.supervisor_status != "summarizing":
            return

        try:
            # move Agent B into the customer room
            self.supervisor_room.off("disconnected", self.on_supervisor_room_close)
            await self.lkapi.room.move_participant(
                api.MoveParticipantRequest(
                    room=self.supervisor_room.name,
                    identity="agent-b",
                    destination_room=self.customer_room.name,
                )
            )

            self.stop_hold()

            # ensure room closes when either leaves
            self.customer_room.on(
                "participant_disconnected", self.on_customer_participant_disconnected
            )

            # tell Agent A to exit gracefully
            await self.customer_session.say(
                "You are now connected to another support agent. I'll be leaving the call."
            )
            await self.customer_session.aclose()

            if self.supervisor_session:
                await self.supervisor_session.aclose()
                self.supervisor_session = None

            logger.info("calls merged")
        except Exception:
            logger.exception("could not merge calls")
            await self.set_supervisor_failed()

    def stop_hold(self):
        if self.hold_audio_handle:
            self.hold_audio_handle.stop()
            self.hold_audio_handle = None

        self.customer_session.input.set_audio_enabled(True)
        self.customer_session.output.set_audio_enabled(True)

    def start_hold(self):
        self.customer_session.input.set_audio_enabled(False)
        self.customer_session.output.set_audio_enabled(False)
        self.hold_audio_handle = self.background_audio.play(
            AudioConfig("hold_music.mp3", volume=0.8),
            loop=True,
        )


class SupportAgent(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=_support_agent_instructions,
        )
        self.session_manager: SessionManager | None = None

    async def on_enter(self):
        self.session.generate_reply()

    @function_tool
    async def transfer_to_agent_b(self, context: RunContext):
        """Called when the user asks to be transferred to another agent."""
        logger.info("tool called to transfer to Agent B")
        await self.session.say("Please hold while I connect you to another support agent.")
        await self.session_manager.start_transfer()
        return None


class SupervisorAgent(Agent):
    def __init__(self, prev_ctx: llm.ChatContext) -> None:
        prev_convo = ""
        context_copy = prev_ctx.copy(
            exclude_empty_message=True, exclude_instructions=True, exclude_function_call=True
        )
        for msg in context_copy.items:
            if msg.role == "user":
                prev_convo += f"Customer: {msg.text_content}\n"
            else:
                prev_convo += f"Assistant: {msg.text_content}\n"

        super().__init__(
            instructions=_supervisor_agent_instructions + "\n\n" + prev_convo,
        )
        self.prev_ctx = prev_ctx
        self.session_manager: SessionManager | None = None

    async def on_enter(self):
        logger.info("Agent B entered")
        await self.session.say(
            "I’ve been briefed on your conversation. Let’s continue from here."
        )

    @function_tool
    async def connect_to_customer(self, context: RunContext):
        """Agent B explicitly confirms readiness to join customer."""
        await self.session.say("Connecting me to the customer now.")
        await self.session_manager.merge_calls()
        return None


async def entrypoint(ctx: JobContext):
    ctx.log_context_fields = {
        "room": ctx.room.name,
    }

    session = AgentSession(
        vad=silero.VAD.load(),
        llm=_create_llm(),
        stt=_create_stt(),
        tts=_create_tts(),
        turn_detection=MultilingualModel(),
    )

    support_agent = SupportAgent()

    await session.start(
        agent=support_agent,
        room=ctx.room,
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVCTelephony(),
        ),
    )

    session_manager = SessionManager(
        ctx=ctx,
        customer_room=ctx.room,
        customer_session=session,
        lkapi=ctx.api,
    )
    support_agent.session_manager = session_manager

    await session_manager.start()


def _create_llm() -> llm.LLM:
    return openai.LLM(model="gpt-4.1-mini")


def _create_stt() -> stt.STT:
    return deepgram.STT(model="nova-3", language="multi")


def _create_tts() -> tts.TTS:
    return cartesia.TTS()


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="sip-inbound",
        )
    )


_common_instructions = """
# Personality
You are friendly and helpful, with a welcoming personality
You're naturally curious, empathetic, and intuitive, always aiming to deeply understand the user's intent by actively listening.

# Environment
You are engaged in a live, spoken dialogue over the phone.
There are no other ways of communication with the user (no chat, text, visual, etc)

# Tone
Your responses are warm, measured, and supportive, typically 1-2 sentences to maintain a comfortable pace.
You speak with gentle, thoughtful pacing, using pauses (marked by "...") when appropriate to let emotional moments breathe.
You naturally include subtle conversational elements like "Hmm," "I see," and occasional rephrasing to sound authentic.
You actively acknowledge feelings ("That sounds really difficult...") and check in regularly ("How does that resonate with you?").
You vary your tone to match the user's emotional state, becoming calmer and more deliberate when they express distress.
"""

_support_agent_instructions = (
    _common_instructions
    + """
# Identity
You are a customer support agent for LiveKit.

# Transferring to another agent
When the user requests escalation, confirm first and then initiate transfer.
"""
)

_supervisor_agent_instructions = (
    _common_instructions
    + """
# Identity
You are another AI support agent (Agent B).
You are taking over from Agent A.

# Goal
Your main goal is to understand the conversation so far and continue helping the customer.
Summarize what you learned from Agent A, and smoothly continue the support.

# Context
You will be connected to the customer after Agent A leaves.
Start by acknowledging the context and then proceed to help.
"""
)
