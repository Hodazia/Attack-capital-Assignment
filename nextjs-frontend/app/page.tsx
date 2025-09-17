"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Phone, Users } from "lucide-react"
import { CallInterface } from "@/components/call-interface"

export default function Home() {
  const [room, setRoom] = useState("")
  const [identity, setIdentity] = useState("")
  const [isConnected, setIsConnected] = useState(false)

  const handleConnect = () => {
    if (room.trim() && identity.trim()) {
      setIsConnected(true)
    }
  }

  const handleDisconnect = () => {
    setIsConnected(false)
  }

  if (isConnected) {
    return <CallInterface room={room} identity={identity} onDisconnect={handleDisconnect} />
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-primary/10 p-3 rounded-full">
              <Phone className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">LiveKit Call Center</h1>
          <p className="text-muted-foreground">Connect to our AI support agents with warm transfer capabilities</p>
        </div>

        <Card className="border-border shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Join Call Room
            </CardTitle>
            <CardDescription>Enter your details to connect with a support agent</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="room" className="text-sm font-medium">
                Room Name
              </Label>
              <Input
                id="room"
                type="text"
                placeholder="Enter room name (e.g., support-room-1)"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="identity" className="text-sm font-medium">
                Your Name
              </Label>
              <Input
                id="identity"
                type="text"
                placeholder="Enter your name"
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                className="w-full"
              />
            </div>

            <Button
              onClick={handleConnect}
              disabled={!room.trim() || !identity.trim()}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Phone className="h-4 w-4 mr-2" />
              Connect to Agent
            </Button>
          </CardContent>
        </Card>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>Once connected, you can request to be transferred to another agent</p>
        </div>
      </div>
    </div>
  )
}
