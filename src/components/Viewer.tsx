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
      { urls: "stun:stun1.l.google.com:19302" }
    ]
  };

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    // We join as viewer
    socket.emit("join-viewer", roomId);
    
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

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", roomId, event.candidate); // As a viewer, we can just send candidate to broadcaster through signaling... 
        // Wait, the viewer-joined logic only emits viewer-joined to broadcaster, and broadcaster sends offer to viewerId.
        // Wait, here `roomId` is the roomId. But the broadcaster is listening to the room but using caller's socket.id.
        // Let's actually look at the server design.
      }
    };
    
    // We actually need the viewer to send the ICE candidate TO THE BROADCASTER. 
    // In server: socket.on("ice-candidate", (targetId, candidate) => socket.to(targetId).emit...)
    // But how does Viewer know broadcaster's targetId? 
    // The broadcaster sends an 'offer' with `socket.id` (which is broadcaster's socket.id).
    let broadcasterId: string | null = null;

    socket.on("offer", async (senderId, offer) => {
      console.log("Received offer from", senderId);
      broadcasterId = senderId; // Store broadcaster's socket id
      
      setStatus("Установка соединения (P2P)...");
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
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
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("Error adding ice candidate", err);
      }
    });

    // Handle our ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && broadcasterId) {
        socket.emit("ice-candidate", broadcasterId, event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
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

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden relative font-sans">
      {!isPlaying && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 text-white z-10">
           <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
           <p className="text-lg font-medium text-neutral-300 tracking-tight">{status}</p>
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
