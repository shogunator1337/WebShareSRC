import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";

async function startServer() {
  const app = express();
  const PORT = 4000;
  
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  // Signaling logic
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Broadcaster joins their room
    socket.on("join-broadcaster", (roomId) => {
      socket.join(roomId);
      socket.join(`broadcaster-${roomId}`);
      console.log(`Broadcaster ${socket.id} joined room ${roomId}`);
    });

    // Viewer joins room and notifies broadcaster
    socket.on("join-viewer", (roomId) => {
      socket.join(roomId);
      console.log(`Viewer ${socket.id} joined room ${roomId}`);
      
      // Let the broadcaster know a viewer joined
      socket.to(`broadcaster-${roomId}`).emit("viewer-joined", socket.id);
    });

    // Relay WebRTC signaling messages
    socket.on("offer", (targetId, offer) => {
      socket.to(targetId).emit("offer", socket.id, offer);
    });

    socket.on("answer", (targetId, answer) => {
      socket.to(targetId).emit("answer", socket.id, answer);
    });

    socket.on("ice-candidate", (targetId, candidate) => {
      socket.to(targetId).emit("ice-candidate", socket.id, candidate);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      // We could broadcast viewer-left or brodcaster-left, but WebRTC will handle connection state changes mostly.
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
