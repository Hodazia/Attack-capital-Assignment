"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowRightLeft, Clock, CheckCircle, Users } from "lucide-react"

interface TransferStatusProps {
  isTransferRequested: boolean
  onCancelTransfer?: () => void
}

export function TransferStatus({ isTransferRequested, onCancelTransfer }: TransferStatusProps) {
  const [transferStage, setTransferStage] = useState<"requested" | "briefing" | "connecting" | "completed">("requested")
  const [timeElapsed, setTimeElapsed] = useState(0)

  useEffect(() => {
    if (!isTransferRequested) {
      setTransferStage("requested")
      setTimeElapsed(0)
      return
    }

    const timer = setInterval(() => {
      setTimeElapsed((prev) => prev + 1)
    }, 1000)

    // Simulate transfer stages
    const stageTimer = setTimeout(() => {
      setTransferStage("briefing")
      setTimeout(() => {
        setTransferStage("connecting")
        setTimeout(() => {
          setTransferStage("completed")
        }, 3000)
      }, 5000)
    }, 2000)

    return () => {
      clearInterval(timer)
      clearTimeout(stageTimer)
    }
  }, [isTransferRequested])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const getStageInfo = () => {
    switch (transferStage) {
      case "requested":
        return {
          icon: <Clock className="h-4 w-4" />,
          title: "Transfer Requested",
          description: "Waiting for Agent B to join...",
          color: "bg-yellow-500/10 text-yellow-600 border-yellow-200",
        }
      case "briefing":
        return {
          icon: <Users className="h-4 w-4" />,
          title: "Agent Briefing",
          description: "Agent A is briefing Agent B about your conversation",
          color: "bg-blue-500/10 text-blue-600 border-blue-200",
        }
      case "connecting":
        return {
          icon: <ArrowRightLeft className="h-4 w-4" />,
          title: "Connecting to Agent B",
          description: "Agent A is leaving, Agent B is taking over",
          color: "bg-purple-500/10 text-purple-600 border-purple-200",
        }
      case "completed":
        return {
          icon: <CheckCircle className="h-4 w-4" />,
          title: "Transfer Complete",
          description: "You are now connected to Agent B",
          color: "bg-green-500/10 text-green-600 border-green-200",
        }
    }
  }

  if (!isTransferRequested) return null

  const stageInfo = getStageInfo()

  return (
    <Card className="border-2 border-dashed border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ArrowRightLeft className="h-5 w-5 text-primary" />
          Transfer in Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`p-3 rounded-lg border ${stageInfo.color}`}>
          <div className="flex items-center gap-2 mb-2">
            {stageInfo.icon}
            <span className="font-medium">{stageInfo.title}</span>
            <Badge variant="outline" className="ml-auto">
              {formatTime(timeElapsed)}
            </Badge>
          </div>
          <p className="text-sm opacity-80">{stageInfo.description}</p>
        </div>

        {/* Transfer Progress Steps */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Transfer Progress</span>
            <span className="text-muted-foreground">
              {transferStage === "completed"
                ? "4/4"
                : transferStage === "connecting"
                  ? "3/4"
                  : transferStage === "briefing"
                    ? "2/4"
                    : "1/4"}{" "}
              steps
            </span>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((step) => {
              const isActive =
                step === 1 ||
                (step === 2 && ["briefing", "connecting", "completed"].includes(transferStage)) ||
                (step === 3 && ["connecting", "completed"].includes(transferStage)) ||
                (step === 4 && transferStage === "completed")

              return (
                <div
                  key={step}
                  className={`h-2 flex-1 rounded-full transition-colors ${isActive ? "bg-primary" : "bg-muted"}`}
                />
              )
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          {transferStage === "requested" && onCancelTransfer && (
            <Button variant="outline" size="sm" onClick={onCancelTransfer} className="flex-1 bg-transparent">
              Cancel Transfer
            </Button>
          )}

          {transferStage === "completed" && (
            <div className="flex-1 text-center">
              <Badge className="bg-green-500/10 text-green-600 border-green-200">
                <CheckCircle className="h-3 w-3 mr-1" />
                Successfully transferred to Agent B
              </Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
