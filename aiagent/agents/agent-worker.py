import os
import asyncio
import argparse
from dotenv import load_dotenv

load_dotenv()

from livekit.agents import Agent, AgentSession
from livekit.plugins import openai as openai_plugin
from app.livekit_utils import generate_token

LIVEKIT_URL = os.getenv("LIVEKIT_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


# Example SupportAgent (Agent A)
class SupportAgent(Agent):
    def __init__(self):
        super().__init__(
            instructions="You are a helpful support agent. Greet the caller and ask how to assist."
        )


# TransferAgent - summarizes previous conversation and speaks to supervisor
class TransferAgent(Agent):
    def __init__(self, prev_ctx_text: str):
        super().__init__(
            instructions=(
                f"You are a summarizer. Here is the previous conversation:\n{prev_ctx_text}\n"
                "Please give a short spoken summary, key action items, and any important notes to the supervisor."
            )
        )


async def run_support_agent(room: str, identity: str):
    stt = openai_plugin.stt.STT(model="whisper-1", api_key=OPENAI_API_KEY)
    llm = openai_plugin.llm.LLM(model="gpt-4o", api_key=OPENAI_API_KEY)
    tts = openai_plugin.tts.TTS(model="gpt-4o-mini-tts", api_key=OPENAI_API_KEY, voice="ash")

    session = AgentSession(stt=stt, llm=llm, tts=tts)
    agent = SupportAgent()

    token = generate_token(identity=identity, room=room)

    # ⬇️ Correct call style: no keyword args
    await session.start(agent, LIVEKIT_URL, token)
    print(f"[support] agent started in room={room} identity={identity}")

    try:
        while True:
            await asyncio.sleep(1)
    finally:
        await session.stop()


async def run_transfer_agent(consult_room: str, identity: str, prev_ctx_text: str):
    stt = openai_plugin.stt.STT(model="whisper-1", api_key=OPENAI_API_KEY)
    llm = openai_plugin.llm.LLM(model="gpt-4o", api_key=OPENAI_API_KEY)
    tts = openai_plugin.tts.TTS(model="gpt-4o-mini-tts", api_key=OPENAI_API_KEY, voice="ash")

    session = AgentSession(stt=stt, llm=llm, tts=tts)
    agent = TransferAgent(prev_ctx_text=prev_ctx_text)

    token = generate_token(identity=identity, room=consult_room)

    await session.start(agent, LIVEKIT_URL, token)
    print(f"[transfer] agent started in consult_room={consult_room} identity={identity}")

    await session.generate_reply(
        instructions="Speak a concise summary and key actions for the supervisor."
    )
    print("[transfer] summary spoken to consult room")

    await asyncio.sleep(2)
    # await session.stop()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["support", "transfer"], required=True)
    parser.add_argument("--room", required=True)
    parser.add_argument("--identity", required=True)
    parser.add_argument("--prev_ctx", default="", help="previous conversation text (for transfer agent)")

    args = parser.parse_args()
    loop = asyncio.get_event_loop()

    if args.mode == "support":
        loop.run_until_complete(run_support_agent(args.room, args.identity))
    else:
        loop.run_until_complete(run_transfer_agent(args.room, args.identity, args.prev_ctx))
