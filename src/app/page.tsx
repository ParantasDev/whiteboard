"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

export default function HomePage() {
  const router = useRouter();
  const [roomId, setRoomId] = useState("");

  const handleCreate = () => {
    const id = uuidv4().slice(0, 8);
    router.push(`/room/${id}`);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = roomId.trim();
    if (!trimmed) return;
    router.push(`/room/${trimmed}`);
  };

  return (
    <main className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        {/* Logo / title */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-lg font-bold select-none">
            W
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-none">Whiteboard</h1>
            <p className="text-slate-400 text-xs mt-0.5">Real-time collaborative drawing</p>
          </div>
        </div>

        {/* Features */}
        <ul className="text-slate-400 text-xs space-y-1 mb-7">
          {["Freehand pen & eraser", "Shapes: rect, ellipse, line, arrow", "Text tool", "9 colours + custom fill", "Live cursor sync"].map(
            (f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="text-indigo-400">✓</span>
                {f}
              </li>
            )
          )}
        </ul>

        <button
          onClick={handleCreate}
          className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold rounded-xl py-3 transition mb-4"
        >
          Create new room
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-slate-700" />
          <span className="text-slate-500 text-xs">or join existing</span>
          <div className="flex-1 h-px bg-slate-700" />
        </div>

        <form onSubmit={handleJoin} className="flex gap-2">
          <input
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Room ID"
            className="flex-1 bg-slate-700 border border-slate-600 text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500 placeholder-slate-500"
          />
          <button
            type="submit"
            disabled={!roomId.trim()}
            className="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition"
          >
            Join
          </button>
        </form>
      </div>
    </main>
  );
}
