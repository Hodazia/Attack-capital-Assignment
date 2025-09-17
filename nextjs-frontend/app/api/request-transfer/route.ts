import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const { room } = await req.json()
  const backendUrl = process.env.BACKEND_CONTROL_URL || "http://localhost:8000"
  try {
    const r = await fetch(`${backendUrl}/api/request-transfer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room }),
    })
    if (!r.ok) return NextResponse.json({ error: "backend failed" }, { status: 502 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
