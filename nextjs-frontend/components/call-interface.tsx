"use client"

import { useEffect, useState } from "react"
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useParticipants,
  useTracks,
  RoomName,
  DisconnectButton,
} from "@livekit/components-react"
import "@livekit/components-styles"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Phone, PhoneOff, Users, Mic, ArrowRightLeft, AlertCircle, Activity } from "lucide-react"
import { Track } from "livekit-client"
import { TransferStatus } from "./transfer-status"
import { ParticipantMonitor } from "./participant-monitor"
import { LoadingSpinner } from "./loading-spinner"
import { useToast } from "../hooks/use-toast"

interface CallInterfaceProps {
  room: string
  identity: string
  onDisconnect: () => void
}

export function CallInterface({ room, identity, onDisconnect }: CallInterfaceProps) {
  const [token, setToken] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>("")
  const { toast } = useToast()

  useEffect(() => {
    const getToken = async () => {
      try {
        console.log("[v0] Requesting token for room:", room, "identity:", identity)

        const response = await fetch("/api/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room, identity }),
        })

        console.log("[v0] Token response status:", response.status)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          console.log("[v0] Token error data:", errorData)
          throw new Error(errorData.error || `HTTP ${response.status}: Failed to get token`)
        }

        const data = await response.json()
        console.log("[v0] Token received successfully")
        setToken(data.token)

        toast({
          title: "Connected Successfully",
          description: `Joined room "${room}" as ${identity}`,
        })
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to connect"
        console.log("[v0] Token generation error:", errorMessage)
        setError(errorMessage)

        toast({
          title: "Connection Failed",
          description: errorMessage,
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    getToken()
  }, [room, identity, toast])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center p-8">
            <LoadingSpinner size="lg" text="Connecting to room..." />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-destructive/20">
          <CardContent className="flex items-center justify-center p-8">
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-destructive mb-2">Connection Error</h3>
                <p className="text-sm text-muted-foreground mb-4">{error}</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => window.location.reload()} variant="outline" className="flex-1">
                  Retry
                </Button>
                <Button onClick={onDisconnect} className="flex-1">
                  Go Back
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL

  console.log("[v0] LiveKit server URL:", serverUrl)
  console.log("[v0] Environment variables check:")
  console.log("- NEXT_PUBLIC_LIVEKIT_URL:", process.env.NEXT_PUBLIC_LIVEKIT_URL)
  console.log("- Expected for local dev: ws://localhost:7880")
  console.log(
    "- Current protocol:",
    serverUrl?.startsWith("wss://") ? "WSS (Secure)" : serverUrl?.startsWith("ws://") ? "WS (Non-secure)" : "Unknown",
  )

  if (!serverUrl) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-destructive/20">
          <CardContent className="flex items-center justify-center p-8">
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-destructive mb-2">Configuration Error</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  LiveKit URL not configured. Please set NEXT_PUBLIC_LIVEKIT_URL environment variable.
                  <br />
                  <br />
                  For local development, this should typically be:{" "}
                  <code className="bg-muted px-1 rounded">ws://localhost:7880</code>
                </p>
              </div>
              <Button onClick={onDisconnect} className="w-full">
                Go Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <LiveKitRoom
        video={false}
        audio={true}
        token={token}
        serverUrl={serverUrl}
        data-lk-theme="default"
        style={{ height: "100vh" }}
        onDisconnected={onDisconnect}
        onConnected={() => {
          console.log("[v0] Successfully connected to LiveKit room")
          toast({
            title: "Room Connected",
            description: "Successfully joined the LiveKit room",
          })
        }}
        onError={(error) => {
          console.error("[v0] LiveKit room error:", error)
          console.log("[v0] Connection details:")
          console.log("- Server URL:", serverUrl)
          console.log("- Token length:", token?.length || 0)
          console.log("- Error type:", error.constructor.name)
          console.log("- Error message:", error.message)

          toast({
            title: "Room Error",
            description: error.message || "An error occurred in the room",
            variant: "destructive",
          })
        }}
      >
        <CallRoomContent room={room} identity={identity} onDisconnect={onDisconnect} />
        <RoomAudioRenderer />
        <StartAudio label="Click to enable audio" />
      </LiveKitRoom>
    </div>
  )
}

function CallRoomContent({ room, identity, onDisconnect }: CallInterfaceProps) {
  const participants = useParticipants()
  const tracks = useTracks([Track.Source.Microphone], { onlySubscribed: false })
  const [isTransferRequested, setIsTransferRequested] = useState(false)
  const { toast } = useToast()

  const handleTransferRequest = async () => {
    try {
      setIsTransferRequested(true)

      toast({
        title: "Transfer Requested",
        description: "Requesting transfer to Agent B...",
      })

      const response = await fetch("/api/request-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room, identity }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to request transfer")
      }

      const data = await response.json()

      toast({
        title: "Transfer Initiated",
        description: "Agent A is briefing Agent B about your conversation",
      })
    } catch (error) {
      console.error("Transfer request failed:", error)
      setIsTransferRequested(false)

      toast({
        title: "Transfer Failed",
        description: error instanceof Error ? error.message : "Failed to request transfer",
        variant: "destructive",
      })
    }
  }

  const handleCancelTransfer = () => {
    setIsTransferRequested(false)
    toast({
      title: "Transfer Cancelled",
      description: "Transfer request has been cancelled",
    })
  }

  const agents = participants.filter((p) => p.identity.includes("agent"))
  const customers = participants.filter((p) => !p.identity.includes("agent"))

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-full">
              <Phone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">Call in Progress</h1>
              <p className="text-sm text-muted-foreground">
                Room: <RoomName />
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
              <Users className="h-3 w-3 mr-1" />
              {participants.length} participants
            </Badge>
            <DisconnectButton className="bg-destructive hover:bg-destructive/90 text-destructive-foreground transition-colors">
              <PhoneOff className="h-4 w-4 mr-2" />
              End Call
            </DisconnectButton>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Transfer Status - Show when transfer is in progress */}
          {isTransferRequested && (
            <TransferStatus isTransferRequested={isTransferRequested} onCancelTransfer={handleCancelTransfer} />
          )}

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="monitor" className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Monitor
              </TabsTrigger>
              <TabsTrigger value="transfer" className="flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4" />
                Transfer
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Quick Participants Panel */}
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Active Participants ({participants.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {agents.length > 0 && (
                      <div>
                        <h3 className="font-medium text-sm text-muted-foreground mb-2">Support Agents</h3>
                        <div className="space-y-2">
                          {agents.map((participant) => (
                            <div
                              key={participant.identity}
                              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-muted"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                                <span className="font-medium">
                                  {participant.identity === "agent-a" ? "Agent A" : "Agent B"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {participant.isSpeaking && <Mic className="h-3 w-3 text-primary animate-pulse" />}
                                <Badge variant="outline" className="text-xs">
                                  {participant.isSpeaking ? "Speaking" : "Connected"}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {customers.length > 0 && (
                      <div>
                        <h3 className="font-medium text-sm text-muted-foreground mb-2">Customers</h3>
                        <div className="space-y-2">
                          {customers.map((participant) => (
                            <div
                              key={participant.identity}
                              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-muted"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-2 h-2 bg-secondary rounded-full animate-pulse"></div>
                                <span className="font-medium">{participant.identity}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {participant.isSpeaking && <Mic className="h-3 w-3 text-secondary animate-pulse" />}
                                <Badge variant="outline" className="text-xs">
                                  {participant.isSpeaking ? "Speaking" : "Connected"}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {participants.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <LoadingSpinner size="md" text="Waiting for participants to join..." />
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button
                      onClick={handleTransferRequest}
                      disabled={isTransferRequested || agents.length === 0}
                      className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground transition-colors"
                    >
                      {isTransferRequested ? (
                        <>
                          <LoadingSpinner size="sm" className="mr-2" />
                          Transfer in Progress...
                        </>
                      ) : (
                        <>
                          <ArrowRightLeft className="h-4 w-4 mr-2" />
                          Request Transfer to Agent B
                        </>
                      )}
                    </Button>

                    {agents.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center">
                        Transfer will be available once an agent joins
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="monitor">
              <ParticipantMonitor />
            </TabsContent>

            <TabsContent value="transfer" className="space-y-6">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ArrowRightLeft className="h-5 w-5" />
                    Transfer Controls
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm text-muted-foreground mb-4 p-4 bg-muted/30 rounded-lg border">
                    <strong>How warm transfer works:</strong>
                    <ol className="list-decimal list-inside mt-2 space-y-1">
                      <li>You request a transfer to Agent B</li>
                      <li>Agent B joins a separate briefing room</li>
                      <li>Agent A explains your conversation to Agent B</li>
                      <li>Agent B joins your call and Agent A leaves</li>
                    </ol>
                  </div>

                  <Button
                    onClick={handleTransferRequest}
                    disabled={isTransferRequested || agents.length === 0}
                    className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground transition-colors"
                  >
                    {isTransferRequested ? (
                      <>
                        <LoadingSpinner size="sm" className="mr-2" />
                        Transfer in Progress...
                      </>
                    ) : (
                      <>
                        <ArrowRightLeft className="h-4 w-4 mr-2" />
                        Request Transfer to Agent B
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
