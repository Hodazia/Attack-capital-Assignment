"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  Room,
  RoomEvent,
  createLocalAudioTrack,
  LocalAudioTrack,
} from "livekit-client";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
const LIVEKIT_WS = process.env.NEXT_PUBLIC_LIVEKIT_WS_URL ?? "ws://localhost:7880";

type InitiateResp = { room_id: string; caller_token: string };
type ConnectAgentResp = { room_id: string; agent_token: string };
type TransferResp = {
  original_room_id: string;
  transfer_room_id: string;
  agent_a_token: string;
  agent_b_token: string;
  call_summary: string;
};

type CompleteTransferResp = {
  room_id: string;
  agent_b_token: string;
  status: string;
};

export default function Page() {
  const [callerRoom, setCallerRoom] = useState<Room | null>(null);
  const [agentARoom, setAgentARoom] = useState<Room | null>(null);
  const [agentBRoom, setAgentBRoom] = useState<Room | null>(null);
  const [origRoomId, setOrigRoomId] = useState<string>("");
  const [transferInfo, setTransferInfo] = useState<TransferResp | null>(null);
  const [summary, setSummary] = useState<string>("");
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const [agentATrack, setAgentATrack] = useState<LocalAudioTrack | null>(null);
  const [status, setStatus] = useState<string>("idle");

  useEffect(() => {
    if (!ttsAudioRef.current) {
      ttsAudioRef.current = new Audio();
    }
  }, []);

  const connectRoom = async (token: string) => {
    const room = new Room();
    await room.connect(LIVEKIT_WS, token);
    room.on(RoomEvent.Disconnected, () => {
      // no-op
    });
    return room;
  };

  const initiateCall = async () => {
    const resp = await axios.post<InitiateResp>(`${API_BASE}/api/calls/initiate`, {
      caller_id: "demoCaller",
    });
    setOrigRoomId(resp.data.room_id);
    const caller = await connectRoom(resp.data.caller_token);
    setCallerRoom(caller);
    setStatus("caller_connected");
  };

  const connectAgentA = async () => {
    if (!origRoomId) return;
    const resp = await axios.post<ConnectAgentResp>(`${API_BASE}/api/calls/${origRoomId}/connect-agent`, {
      agent_id: "A1",
      agent_type: "A",
    });
    const room = await connectRoom(resp.data.agent_token);
    setAgentARoom(room);
    setStatus("agent_a_connected");
  };

  const addConversation = async (text: string, speaker: string) => {
    if (!origRoomId) return;
    await axios.post(`${API_BASE}/api/calls/${origRoomId}/conversation`, {
      message: text,
      speaker,
    });
  };

  const initiateTransfer = async () => {
    if (!origRoomId) return;
    const resp = await axios.post<TransferResp>(`${API_BASE}/api/calls/${origRoomId}/initiate-transfer`, {
      agent_b_id: "B1",
    });
    setTransferInfo(resp.data);
    setSummary(resp.data.call_summary);

    // Agent A joins transfer room
    const roomA = await connectRoom(resp.data.agent_a_token);
    setAgentARoom(roomA);

    // Agent B joins transfer room (for demo we auto-join from this UI)
    const roomB = await connectRoom(resp.data.agent_b_token);
    setAgentBRoom(roomB);
    setStatus("transfer_room_connected");
  };

  const speakSummaryViaMic = async () => {
    if (!agentARoom || !summary) return;
    const track = await createLocalAudioTrack();
    await agentARoom.localParticipant.publishTrack(track);
    setAgentATrack(track);
    // Prompt the human Agent A to speak the summary using their mic
    alert("Please read the summary aloud to Agent B using your mic.");
  };

  const leaveTransferAndComplete = async () => {
    if (!origRoomId || !transferInfo) return;
    const resp = await axios.post<CompleteTransferResp>(`${API_BASE}/api/calls/${origRoomId}/complete-transfer`);
    const agentBOrigToken = resp.data.agent_b_token;

    // Agent B: leave transfer room and join original room with provided token
    if (agentBRoom) {
      await agentBRoom.disconnect();
      setAgentBRoom(null);
    }
    const agentBOrig = await connectRoom(agentBOrigToken);
    setAgentBRoom(agentBOrig);

    if (agentARoom) {
      if (agentATrack) {
        await agentARoom.localParticipant.unpublishTrack(agentATrack);
        agentATrack.stop();
        setAgentATrack(null);
      }
      await agentARoom.disconnect();
      setAgentARoom(null);
    }
    setStatus("transfer_completed");
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h1>Warm Transfer Demo</h1>
      <p>Backend: {API_BASE}</p>
      <p>LiveKit: {LIVEKIT_WS}</p>

      <section style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8, marginBottom: 16 }}>
        <h2>1) Caller + Agent A</h2>
        <button onClick={initiateCall}>Initiate Call (create room, connect caller)</button>
        <button onClick={connectAgentA} disabled={!origRoomId} style={{ marginLeft: 8 }}>Connect Agent A</button>
        <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>Status: {status}</div>
        <div style={{ marginTop: 8 }}>
          <button onClick={() => addConversation("I forgot my password", "caller")} disabled={!origRoomId}>Add convo: caller</button>
          <button onClick={() => addConversation("I can help reset it", "agentA")} disabled={!origRoomId} style={{ marginLeft: 8 }}>Add convo: agentA</button>
        </div>
      </section>

      <section style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8, marginBottom: 16 }}>
        <h2>2) Initiate Warm Transfer</h2>
        <button onClick={initiateTransfer} disabled={!origRoomId}>Initiate transfer (create A/B transfer room)</button>
        {summary && (
          <div style={{ marginTop: 8 }}>
            <strong>Call Summary:</strong>
            <pre style={{ background: "#f6f6f6", padding: 8, whiteSpace: "pre-wrap" }}>{summary}</pre>
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <button onClick={speakSummaryViaMic} disabled={!transferInfo}>Agent A: Speak summary via mic</button>
        </div>
      </section>

      <section style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8, marginBottom: 16 }}>
        <h2>3) Complete Transfer</h2>
        <button onClick={leaveTransferAndComplete} disabled={!transferInfo}>Complete transfer (Agent A leaves)</button>
      </section>
    </div>
  );
}
