import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { Loader2 } from "lucide-react";

export default function Viewer() {
  const { roomId } = useParams<{ roomId: string }>();
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  
  const [status, setStatus] = useState("Подключение к комнате...");
  const [isPlaying, setIsPlaying] = useState(false);
  
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const configuration = {
    iceServers: [
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
    ]
  };

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    // Join room when connected (or reconnected)
    socket.on("connect", () => {
      console.log("Socket connected, joining as viewer...");
      socket.emit("join-viewer", roomId);
    });
    
    // We also emit immediately in case it's already connected (though usually it connects async)
    if (socket.connected) {
      socket.emit("join-viewer", roomId);
    }
    
    // Auto click/interaction is usually needed to autoplay audio, but OBS browser source handles it automatically.
    // So we just try to play when tracks arrive.

    const pc = new RTCPeerConnection(configuration);
    pcRef.current = pc;

    pc.ontrack = (event) => {
      console.log("Received track", event.track.kind);
      if (remoteVideoRef.current && event.streams && event.streams[0]) {
         remoteVideoRef.current.srcObject = event.streams[0];
         setIsPlaying(true);
      }
    };

    let broadcasterId: string | null = null;
    let pendingCandidates: RTCIceCandidateInit[] = [];
    let isRemoteDescrSet = false;

    socket.on("offer", async (senderId, offer) => {
      console.log("Received offer from", senderId);
      broadcasterId = senderId; // Store broadcaster's socket id
      
      setStatus("Установка соединения (P2P)...");
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        isRemoteDescrSet = true;

        // Add any pending candidates
        for (const candidate of pendingCandidates) {
           await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        pendingCandidates = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit("answer", senderId, pc.localDescription);
      } catch (err) {
        console.error("Error handling offer", err);
        setStatus("Ошибка подключения.");
      }
    });

    socket.on("ice-candidate", async (senderId, candidate) => {
      try {
        if (isRemoteDescrSet) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          pendingCandidates.push(candidate);
        }
      } catch (err) {
        console.error("Error adding ice candidate", err);
      }
    });

    socket.on("broadcaster-joined", () => {
      console.log("Broadcaster joined, requesting offer...");
      socket.emit("join-viewer", roomId);
    });

    // Handle our ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && broadcasterId) {
        socket.emit("ice-candidate", broadcasterId, event.candidate);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("ICE Connection State:", pc.iceConnectionState);
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        setStatus("Подключено");
      } else if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
        setStatus("Соединение разорвано");
        setIsPlaying(false);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("Connection State:", pc.connectionState);
      if (pc.connectionState === "connected") {
        setStatus("Подключено");
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        setStatus("Соединение разорвано");
        setIsPlaying(false);
      }
    };

    return () => {
      socket.disconnect();
      pc.close();
    };
  }, [roomId]);

  const handlePlay = () => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.play().catch(e => console.error("Play failed:", e));
    }
  };

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden relative font-sans" onClick={handlePlay}>
      {!isPlaying && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 text-white z-10">
           <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
           <p className="text-lg font-medium text-neutral-300 tracking-tight">{status}</p>
        </div>
      )}
      
      {isPlaying && (
        <div className="absolute top-4 right-4 z-20 opacity-0 hover:opacity-100 transition-opacity">
           <button onClick={handlePlay} className="bg-black/50 text-white px-3 py-1 rounded text-xs">
             Воспроизвести (если заблокировано)
           </button>
        </div>
      )}

      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover bg-transparent"
        // OBS doesn't need mirror typically, unless the user prefers it. We'll leave it normal.
      />
    </div>
  );
}
