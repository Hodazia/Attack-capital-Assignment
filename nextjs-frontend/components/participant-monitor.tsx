"use client"

import { useEffect, useState } from "react"
import { useParticipants, useConnectionState, useRoomInfo } from "@livekit/components-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, Mic, MicOff, Wifi, WifiOff, Clock, Activity, Signal } from "lucide-react"
import { ConnectionState } from "livekit-client"

interface ParticipantActivity {
  identity: string
  joinedAt: Date
  lastSpoke?: Date
  speakingDuration: number
  connectionQuality: "excellent" | "good" | "poor"
}

export function ParticipantMonitor() {
  const participants = useParticipants()
  const connectionState = useConnectionState()
  const roomInfo = useRoomInfo()
  const [participantActivities, setParticipantActivities] = useState<Map<string, ParticipantActivity>>(new Map())
  const [roomDuration, setRoomDuration] = useState(0)

  // Track room duration
  useEffect(() => {
    const timer = setInterval(() => {
      setRoomDuration((prev) => prev + 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  // Track participant activities
  useEffect(() => {
    const newActivities = new Map(participantActivities)

    participants.forEach((participant) => {
      if (!newActivities.has(participant.identity)) {
        newActivities.set(participant.identity, {
          identity: participant.identity,
          joinedAt: new Date(),
          speakingDuration: 0,
          connectionQuality: "good",
        })
      }

      // Update speaking status
      const activity = newActivities.get(participant.identity)!
      if (participant.isSpeaking && !activity.lastSpoke) {
        activity.lastSpoke = new Date()
      } else if (participant.isSpeaking) {
        activity.speakingDuration += 1
      }

      // Simulate connection quality based on participant type
      if (participant.identity.includes("agent")) {
        activity.connectionQuality = "excellent"
      } else {
        activity.connectionQuality = Math.random() > 0.8 ? "poor" : "good"
      }
    })

    setParticipantActivities(newActivities)
  }, [participants])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const getConnectionIcon = (state: ConnectionState) => {
    switch (state) {
      case ConnectionState.Connected:
        return <Wifi className="h-4 w-4 text-green-500" />
      case ConnectionState.Connecting:
      case ConnectionState.Reconnecting:
        return <Activity className="h-4 w-4 text-yellow-500 animate-pulse" />
      default:
        return <WifiOff className="h-4 w-4 text-red-500" />
    }
  }

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case "excellent":
        return "text-green-600 bg-green-50 border-green-200"
      case "good":
        return "text-blue-600 bg-blue-50 border-blue-200"
      case "poor":
        return "text-red-600 bg-red-50 border-red-200"
      default:
        return "text-gray-600 bg-gray-50 border-gray-200"
    }
  }

  const agents = participants.filter((p) => p.identity.includes("agent"))
  const customers = participants.filter((p) => !p.identity.includes("agent"))

  return (
    <div className="space-y-4">
      {/* Room Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Room Status
            </div>
            <Badge variant="outline" className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(roomDuration)}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{participants.length}</div>
              <div className="text-sm text-muted-foreground">Participants</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-secondary">{agents.length}</div>
              <div className="text-sm text-muted-foreground">Agents</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-accent">{customers.length}</div>
              <div className="text-sm text-muted-foreground">Customers</div>
            </div>
            <div className="text-center flex flex-col items-center">
              {getConnectionIcon(connectionState)}
              <div className="text-sm text-muted-foreground mt-1">Connection</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Participant List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Participant Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {agents.length > 0 && (
            <div>
              <h3 className="font-medium text-sm text-muted-foreground mb-3 flex items-center gap-2">
                <div className="w-2 h-2 bg-primary rounded-full"></div>
                Support Agents ({agents.length})
              </h3>
              <div className="space-y-3">
                {agents.map((participant) => {
                  const activity = participantActivities.get(participant.identity)
                  return (
                    <div
                      key={participant.identity}
                      className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                            <Users className="h-5 w-5 text-primary" />
                          </div>
                          {participant.isSpeaking && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                              <Mic className="h-2 w-2 text-white" />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium">
                            {participant.identity === "agent-a" ? "Agent A (Primary)" : "Agent B (Transfer)"}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            {activity && (
                              <>
                                <span>
                                  Joined {formatDuration(Math.floor((Date.now() - activity.joinedAt.getTime()) / 1000))}{" "}
                                  ago
                                </span>
                                {activity.lastSpoke && (
                                  <span>
                                    • Last spoke{" "}
                                    {formatDuration(Math.floor((Date.now() - activity.lastSpoke.getTime()) / 1000))} ago
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {activity && (
                          <Badge className={`text-xs ${getQualityColor(activity.connectionQuality)}`}>
                            <Signal className="h-3 w-3 mr-1" />
                            {activity.connectionQuality}
                          </Badge>
                        )}
                        <Badge variant={participant.isSpeaking ? "default" : "outline"} className="text-xs">
                          {participant.isSpeaking ? (
                            <>
                              <Mic className="h-3 w-3 mr-1" />
                              Speaking
                            </>
                          ) : (
                            <>
                              <MicOff className="h-3 w-3 mr-1" />
                              Listening
                            </>
                          )}
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {customers.length > 0 && (
            <div>
              <h3 className="font-medium text-sm text-muted-foreground mb-3 flex items-center gap-2">
                <div className="w-2 h-2 bg-secondary rounded-full"></div>
                Customers ({customers.length})
              </h3>
              <div className="space-y-3">
                {customers.map((participant) => {
                  const activity = participantActivities.get(participant.identity)
                  return (
                    <div
                      key={participant.identity}
                      className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-10 h-10 bg-secondary/10 rounded-full flex items-center justify-center">
                            <Users className="h-5 w-5 text-secondary" />
                          </div>
                          {participant.isSpeaking && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                              <Mic className="h-2 w-2 text-white" />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium">{participant.identity}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            {activity && (
                              <>
                                <span>
                                  Joined {formatDuration(Math.floor((Date.now() - activity.joinedAt.getTime()) / 1000))}{" "}
                                  ago
                                </span>
                                {activity.lastSpoke && (
                                  <span>
                                    • Last spoke{" "}
                                    {formatDuration(Math.floor((Date.now() - activity.lastSpoke.getTime()) / 1000))} ago
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {activity && (
                          <Badge className={`text-xs ${getQualityColor(activity.connectionQuality)}`}>
                            <Signal className="h-3 w-3 mr-1" />
                            {activity.connectionQuality}
                          </Badge>
                        )}
                        <Badge variant={participant.isSpeaking ? "default" : "outline"} className="text-xs">
                          {participant.isSpeaking ? (
                            <>
                              <Mic className="h-3 w-3 mr-1" />
                              Speaking
                            </>
                          ) : (
                            <>
                              <MicOff className="h-3 w-3 mr-1" />
                              Listening
                            </>
                          )}
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {participants.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No participants yet</p>
              <p className="text-sm">Waiting for agents and customers to join the room...</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
