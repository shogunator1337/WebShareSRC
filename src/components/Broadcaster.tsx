// ... (imports)
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { Camera, CameraOff, Mic, MicOff, Settings, Users, MonitorPlay, Code } from "lucide-react";

export default function Broadcaster() {
  const { roomId } = useParams<{ roomId: string }>();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isJoined, setIsJoined] = useState(false);
  const [viewersCount, setViewersCount] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const pcsRef = useRef<{ [id: string]: RTCPeerConnection }>({});

  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);

  // Settings
  const [selectedQuality, setSelectedQuality] = useState<number>(720);
  const [selectedCodec, setSelectedCodec] = useState<string>("default");

  // Configuration for WebRTC
  const configuration = {
    iceServers: [
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
    ]
  };

  const getQualityConstraints = () => {
    switch(selectedQuality) {
      case 1080: return { width: { ideal: 1920 }, height: { ideal: 1080 } };
      case 720: return { width: { ideal: 1280 }, height: { ideal: 720 } };
      case 480: return { width: { ideal: 854 }, height: { ideal: 480 } };
      case 360: return { width: { ideal: 640 }, height: { ideal: 360 } };
      default: return { width: { ideal: 1280 }, height: { ideal: 720 } };
    }
  };

  const startStream = async () => {
    try {
      const localStream = await navigator.mediaDevices.getUserMedia({
        video: { ...getQualityConstraints(), frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      
      setStream(localStream);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }

      setupSocket(localStream);
      setIsJoined(true);
    } catch (err) {
      console.error("Failed to get local stream", err);
      alert("Не удалось получить доступ к камере или микрофону. Разрешите доступ в браузере.");
    }
  };

  const setupSocket = (localStream: MediaStream) => {
    const socket = io();
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Broadcaster socket connected!");
      socket.emit("join-broadcaster", roomId);
    });

    if (socket.connected) {
      socket.emit("join-broadcaster", roomId);
    }

    let pendingCandidates: { [id: string]: RTCIceCandidateInit[] } = {};
    let isRemoteDescrSet: { [id: string]: boolean } = {};

    socket.on("viewer-joined", async (viewerId) => {
      console.log("Viewer joined", viewerId);
      
      if (pcsRef.current[viewerId]) {
         pcsRef.current[viewerId].close();
      }

      // Create new Peer Connection for this viewer
      const pc = new RTCPeerConnection(configuration);
      pcsRef.current[viewerId] = pc;
      pendingCandidates[viewerId] = [];
      isRemoteDescrSet[viewerId] = false;
      
      // Update viewer count
      setViewersCount(Object.keys(pcsRef.current).length);

      // Add local stream tracks to PC
      localStream.getTracks().forEach(track => {
        const sender = pc.addTrack(track, localStream);
        
        // Try to set Codec Preferences if requested
        if (track.kind === 'video' && selectedCodec !== 'default' && 'getCapabilities' in RTCRtpSender) {
           try {
             const capabilities = RTCRtpSender.getCapabilities('video');
             if (capabilities && capabilities.codecs) {
                // Find all codecs of the selected type
                const matchedCodecs = capabilities.codecs.filter(c => c.mimeType.toLowerCase().includes(selectedCodec.toLowerCase()));
                const otherCodecs = capabilities.codecs.filter(c => !c.mimeType.toLowerCase().includes(selectedCodec.toLowerCase()));
                if (matchedCodecs.length > 0 && typeof sender.setCodecPreferences === 'function') {
                   sender.setCodecPreferences([...matchedCodecs, ...otherCodecs]);
                }
             }
           } catch (e) {
             console.warn("Codec preferences not supported or failed", e);
           }
        }
      });

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", viewerId, event.candidate);
        }
      };

      // Create offer
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", viewerId, pc.localDescription);
      } catch (err) {
        console.error("Error creating offer", err);
      }
    });

    socket.on("answer", async (viewerId, answer) => {
      console.log("Received answer from", viewerId);
      const pc = pcsRef.current[viewerId];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          isRemoteDescrSet[viewerId] = true;

          const queue = pendingCandidates[viewerId] || [];
          for (const candidate of queue) {
             await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
          pendingCandidates[viewerId] = [];
        } catch (err) {
          console.error("Failed to set remote description", err);
        }
      }
    });

    socket.on("ice-candidate", async (viewerId, candidate) => {
      const pc = pcsRef.current[viewerId];
      if (pc) {
        try {
          if (isRemoteDescrSet[viewerId]) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } else {
            pendingCandidates[viewerId].push(candidate);
          }
        } catch (err) {
          console.error("Failed to add ICE candidate", err);
        }
      }
    });
    
    socket.on("viewer-disconnected", (viewerId) => {
      if (pcsRef.current[viewerId]) {
        pcsRef.current[viewerId].close();
        delete pcsRef.current[viewerId];
        setViewersCount(Object.keys(pcsRef.current).length);
      }
    });
  };

  const toggleMic = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMicEnabled(audioTrack.enabled);
      }
    }
  };

  const toggleCam = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setCamEnabled(videoTrack.enabled);
      }
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
        // Cleanup closed connections
        let count = 0;
        Object.keys(pcsRef.current).forEach(id => {
            const pc = pcsRef.current[id];
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                pc.close();
                delete pcsRef.current[id];
            } else {
                count++;
            }
        });
        setViewersCount(count);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      // Clean up on component unmount
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      Object.values<RTCPeerConnection>(pcsRef.current).forEach(pc => pc.close());
    };
  }, []);

  // Separate effect to clean up stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    }
  }, [stream]);

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 font-sans text-white">
         <div className="max-w-md w-full bg-neutral-900 p-8 rounded-3xl border border-neutral-800 shadow-2xl">
            <div className="w-16 h-16 bg-blue-600/20 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Settings className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2 text-center">Настройки стрима</h1>
            <p className="text-neutral-400 mb-6 text-sm text-center">Выберите качество и кодек перед началом трансляции (применится к камере и P2P-соединениям).</p>
            
            <div className="space-y-6 mb-8">
               {/* Quality Selection */}
               <div>
                  <label className="flex items-center space-x-2 text-sm font-medium text-neutral-300 mb-2">
                    <MonitorPlay className="w-4 h-4" />
                    <span>Разрешение видео</span>
                  </label>
                  <select 
                    value={selectedQuality}
                    onChange={(e) => setSelectedQuality(Number(e.target.value))}
                    className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl p-3 focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value={1080}>1080p (FHD) — Высокая четкость</option>
                    <option value={720}>720p (HD) — Баланс (Рекомендуется)</option>
                    <option value={480}>480p (SD) — Экономия трафика</option>
                    <option value={360}>360p — Минимальное качество</option>
                  </select>
               </div>

               {/* Codec Selection */}
               <div>
                  <label className="flex items-center space-x-2 text-sm font-medium text-neutral-300 mb-2">
                    <Code className="w-4 h-4" />
                    <span>Видеокодек</span>
                  </label>
                  <select 
                    value={selectedCodec}
                    onChange={(e) => setSelectedCodec(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl p-3 focus:outline-none focus:border-blue-500 transition-colors mb-2"
                  >
                    <option value="default">По умолчанию (Автоматически)</option>
                    <option value="h264">H.264 (Большая стабильность и совместимость)</option>
                    <option value="vp8">VP8 (Низкая задержка, стандарт WebRTC)</option>
                    <option value="vp9">VP9 (Лучше качество сжатия, выше нагрузка на CPU)</option>
                  </select>
                  <div className="text-xs text-neutral-500 leading-relaxed">
                    {selectedCodec === 'default' && "Оставляет выбор кодека на усмотрение браузеров. Обычно это лучший вариант."}
                    {selectedCodec === 'h264' && "H.264 аппаратно ускоряется почти на всех устройствах. Отличный выбор для снижения нагрузки и повышения стабильности."}
                    {selectedCodec === 'vp8' && "VP8 отлично подходит для реал-тайм видео с минимальной задержкой. Базовый и надежный."}
                    {selectedCodec === 'vp9' && "VP9 дает лучшую картинку при том же битрейте, но может сильнее греть процессор."}
                  </div>
               </div>
            </div>

            <button 
              onClick={startStream}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 px-6 rounded-2xl transition-all shadow-lg hover:shadow-blue-500/20 active:scale-[0.98]"
            >
              Разрешить доступ и начать
            </button>
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col font-sans p-4">
      <header className="flex justify-between items-center bg-neutral-900 rounded-2xl p-4 mb-4 border border-neutral-800/80">
        <div className="flex items-center space-x-3">
          <div className="flex justify-center items-center h-8 w-8 bg-black/40 rounded-full border border-neutral-700">
             <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
          </div>
          <h2 className="text-white font-medium pl-1">LIVE: {roomId}</h2>
        </div>
        
        <div className="flex items-center space-x-2 bg-neutral-950 px-4 py-2 border border-neutral-800 rounded-xl">
           <Users className="w-4 h-4 text-neutral-400" />
           <span className="text-neutral-300 font-medium text-sm">{viewersCount} Зрителей</span>
        </div>
      </header>

      <main className="flex-1 relative flex items-center justify-center bg-black rounded-3xl overflow-hidden border border-neutral-800/50 shadow-2xl">
        <video 
          ref={localVideoRef} 
          autoPlay 
          muted 
          playsInline 
          className="w-full h-full object-contain"
          style={{ transform: "scaleX(-1)" }} // mirror local video
        />
        
        {/* Controls Overlay */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex space-x-4 p-2 bg-neutral-900/80 backdrop-blur-xl border border-white/10 rounded-full">
           <button 
            onClick={toggleMic}
            className={`w-14 h-14 flex items-center justify-center rounded-full transition-all ${
              micEnabled ? "bg-neutral-700/50 hover:bg-neutral-700 text-white" : "bg-red-500 hover:bg-red-600 text-white"
            }`}
           >
             {micEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
           </button>
           <button 
            onClick={toggleCam}
            className={`w-14 h-14 flex items-center justify-center rounded-full transition-all ${
              camEnabled ? "bg-neutral-700/50 hover:bg-neutral-700 text-white" : "bg-red-500 hover:bg-red-600 text-white"
            }`}
           >
             {camEnabled ? <Camera className="w-6 h-6" /> : <CameraOff className="w-6 h-6" />}
           </button>
        </div>
      </main>
    </div>
  );
}
