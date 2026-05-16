import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Plus, Video, Play, ExternalLink, Settings } from "lucide-react";

export default function AdminPanel() {
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>(() => {
    const saved = localStorage.getItem("vdo_rooms");
    return saved ? JSON.parse(saved) : [];
  });
  const [roomName, setRoomName] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const correctPassword = import.meta.env.VITE_ADMIN_PASSWORD || "admin123";
    if (password === correctPassword) {
      setIsAuthenticated(true);
    } else {
      alert("Неверный пароль.");
    }
  };

  const createRoom = () => {
    if (!roomName.trim()) return;
    const newRoom = {
      id: Math.random().toString(36).substring(2, 10),
      name: roomName.trim(),
    };
    const updated = [...rooms, newRoom];
    setRooms(updated);
    localStorage.setItem("vdo_rooms", JSON.stringify(updated));
    setRoomName("");
  };

  const deleteRoom = (id: string) => {
    const updated = rooms.filter(r => r.id !== id);
    setRooms(updated);
    localStorage.setItem("vdo_rooms", JSON.stringify(updated));
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    alert("Ссылка скопирована!");
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4 font-sans text-neutral-200">
        <div className="w-full max-w-sm bg-neutral-900 shadow-xl rounded-2xl border border-neutral-800 p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mb-4">
              <Settings className="text-white w-8 h-8" />
            </div>
            <h1 className="text-2xl font-semibold text-white tracking-tight">VDO.Clone</h1>
            <p className="text-neutral-500 text-sm mt-1">Организация прямых трансляций</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              placeholder="Пароль администратора (admin123)"
              className="w-full p-3 bg-neutral-800 border border-neutral-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="submit"
              className="w-full p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors"
            >
              Войти
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 p-8 font-sans text-neutral-200">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex items-center justify-between border-b border-neutral-800 pb-6">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
              <Settings className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Панель управления</h1>
              <p className="text-neutral-500 text-sm">Управление комнатами трансляций</p>
            </div>
          </div>
          <button
            onClick={() => setIsAuthenticated(false)}
            className="text-neutral-400 hover:text-white transition-colors"
          >
            Выйти
          </button>
        </header>

        <section className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800">
          <h2 className="text-lg font-semibold text-white mb-4">Создать новую комнату</h2>
          <div className="flex space-x-3">
            <input
              type="text"
              placeholder="Название трансляции"
              className="flex-1 p-3 bg-neutral-800 border border-neutral-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createRoom()}
            />
            <button
              onClick={createRoom}
              className="bg-blue-600 hover:bg-blue-500 px-6 font-medium text-white rounded-xl flex items-center space-x-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Создать</span>
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Активные комнаты</h2>
          {rooms.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-neutral-800 rounded-2xl">
              <p className="text-neutral-500">Комнаты пока не созданы.</p>
            </div>
          ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rooms.map((room) => {
                const streamLink = `${window.location.origin}/stream/${room.id}`;
                const viewLink = `${window.location.origin}/view/${room.id}`;

                return (
                  <div key={room.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 hover:border-neutral-700 transition-colors relative">
                    <button 
                      onClick={() => deleteRoom(room.id)}
                      className="absolute top-4 right-4 text-neutral-500 hover:text-red-400 transition-colors"
                      title="Удалить"
                    >
                      &times;
                    </button>
                    <h3 className="font-semibold text-lg text-white mb-4 pr-6">{room.name}</h3>
                    
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-neutral-400 mb-1 font-medium tracking-wide uppercase">Broadcaster (Стример)</p>
                        <div className="flex items-center space-x-2 bg-neutral-950 border border-neutral-800 p-2 rounded-lg">
                           <span className="flex-1 truncate text-sm text-neutral-300 font-mono select-all">
                             {streamLink}
                           </span>
                           <button onClick={() => copyLink(streamLink)} className="p-2 hover:bg-neutral-800 rounded-md text-neutral-400 hover:text-white" title="Копировать ссылку">
                             <Copy className="w-4 h-4" />
                           </button>
                           <Link to={`/stream/${room.id}`} target="_blank" className="p-2 hover:bg-neutral-800 rounded-md text-neutral-400 hover:text-blue-400" title="Открыть">
                             <ExternalLink className="w-4 h-4" />
                           </Link>
                        </div>
                      </div>
                      
                      <div>
                        <p className="text-xs text-neutral-400 mb-1 font-medium tracking-wide uppercase">Viewer (OBS Source)</p>
                        <div className="flex items-center space-x-2 bg-neutral-950 border border-neutral-800 p-2 rounded-lg">
                           <span className="flex-1 truncate text-sm text-neutral-300 font-mono select-all">
                             {viewLink}
                           </span>
                           <button onClick={() => copyLink(viewLink)} className="p-2 hover:bg-neutral-800 rounded-md text-neutral-400 hover:text-white" title="Копировать ссылку">
                             <Copy className="w-4 h-4" />
                           </button>
                           <Link to={`/view/${room.id}`} target="_blank" className="p-2 hover:bg-neutral-800 rounded-md text-neutral-400 hover:text-green-400" title="Открыть">
                             <OuterLink className="w-4 h-4" />
                           </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
             </div>
          )}
        </section>
      </div>
    </div>
  );
}

// Just a quick alias as OuterLink for ExternalLink wasn't imported with that exact name
const OuterLink = ExternalLink;
