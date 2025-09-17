# app/livekit_utils.py
import os
import datetime
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

from livekit import api

LIVEKIT_URL = os.getenv("LIVEKIT_URL")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")
DEFAULT_TTL = int(os.getenv("DEFAULT_TTL_SECONDS", "3600"))


def generate_token(identity: str, room: Optional[str] = None, name: Optional[str] = None, ttl_seconds: int = DEFAULT_TTL) -> str:
    """
    Generate a LiveKit access JWT token for a participant.
    """
    grant = api.VideoGrants(room_join=True)
    if room:
        grant.room = room
        # allow publish/subscribe by default for agents and callers:
        grant.can_publish = True
        grant.can_subscribe = True
        grant.can_update_own_metadata = True

    at = api.AccessToken(api_key=LIVEKIT_API_KEY, api_secret=LIVEKIT_API_SECRET)
    at = at.with_identity(identity).with_grants(grant).with_ttl(datetime.timedelta(seconds=ttl_seconds))
    if name:
        at = at.with_name(name)
    return at.to_jwt()


async def get_livekit_api_client():
    """
    Returns a livekit.api.LiveKitAPI client. Use `async with` or remember to close.
    """
    lkapi = api.LiveKitAPI(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    return lkapi
