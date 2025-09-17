import { type NextRequest, NextResponse } from "next/server"
import { AccessToken } from "livekit-server-sdk"

export async function POST(request: NextRequest) {
  try {
    const { room, identity } = await request.json()

    console.log("[v0] Token request for room:", room, "identity:", identity)

    if (!room || !identity) {
      console.log("[v0] Missing room or identity")
      return NextResponse.json({ error: "Room and identity are required" }, { status: 400 })
    }

    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET
    const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL

    console.log("[v0] Environment check - API Key:", !!apiKey, "API Secret:", !!apiSecret, "WS URL:", wsUrl)

    if (!apiKey || !apiSecret || !wsUrl) {
      console.log("[v0] Missing LiveKit credentials")
      return NextResponse.json(
        {
          error:
            "LiveKit credentials not configured. Please set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and NEXT_PUBLIC_LIVEKIT_URL environment variables.",
        },
        { status: 500 },
      )
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      // Add TTL for token (24 hours)
      ttl: "24h",
    })

    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    })

    const token = await at.toJwt()
    console.log("[v0] Token generated successfully")

    return NextResponse.json({ token })
  } catch (error) {
    console.error("[v0] Error generating token:", error)
    return NextResponse.json({ error: "Failed to generate token" }, { status: 500 })
  }
}
