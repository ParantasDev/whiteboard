"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import WhiteboardCanvas from "./WhiteboardCanvas";
import type { DrawElement, RemoteCursor, RemotePreview } from "@/types/whiteboard";

interface WhiteboardProps {
  roomId: string;
}

export default function Whiteboard({ roomId }: WhiteboardProps) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [elements, setElements] = useState<DrawElement[]>([]);
  const [remoteCursor, setRemoteCursor] = useState<RemoteCursor | null>(null);
  const [remotePreview, setRemotePreview] = useState<RemotePreview | null>(null);

  useEffect(() => {
    const socket = io({ path: "/api/socketio" });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("room:join", { roomId });
    });

    socket.on("disconnect", () => {
      setConnected(false);
      setRemoteCursor(null);
      setRemotePreview(null);
    });

    // Full state (on join or after undo/clear)
    socket.on(
      "room:state",
      ({ elements, playerIndex }: { elements: DrawElement[]; playerIndex: number }) => {
        setElements(elements);
        setPlayerIndex(playerIndex);
      }
    );

    // Partial update (after undo/clear synced to all)
    socket.on("room:elements", (els: DrawElement[]) => {
      setElements(els);
    });

    // Remote committed a new element
    socket.on("draw:element", (el: DrawElement) => {
      setElements((prev) => [...prev, el]);
    });

    // Remote erased elements by id
    socket.on("draw:erase", ({ ids }: { ids: string[] }) => {
      const set = new Set(ids);
      setElements((prev) => prev.filter((el) => !set.has(el.id)));
    });

    // Remote is drawing (preview)
    socket.on("draw:preview", (data: RemotePreview) => {
      setRemotePreview(data ?? null);
    });

    // Remote cursor moved
    socket.on("cursor:move", (data: RemoteCursor) => {
      setRemoteCursor(data);
    });

    // Remote disconnected
    socket.on("player:left", () => {
      setRemoteCursor(null);
      setRemotePreview(null);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId]);

  const handleElementComplete = useCallback((el: DrawElement) => {
    setElements((prev) => [...prev, el]);
    socketRef.current?.emit("draw:element", el);
  }, []);

  const handlePreviewUpdate = useCallback((preview: RemotePreview | null) => {
    socketRef.current?.emit("draw:preview", preview);
  }, []);

  const handleCursorMove = useCallback((x: number, y: number) => {
    socketRef.current?.emit("cursor:move", { x, y });
  }, []);

  const handleUndo = useCallback(
    (localPlayerIndex: number) => {
      setElements((prev) => {
        const copy = [...prev];
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].playerIndex === localPlayerIndex) {
            copy.splice(i, 1);
            break;
          }
        }
        return copy;
      });
      socketRef.current?.emit("draw:undo");
    },
    []
  );

  const handleErase = useCallback((ids: string[]) => {
    const set = new Set(ids);
    setElements((prev) => prev.filter((el) => !set.has(el.id)));
    socketRef.current?.emit("draw:erase", { ids });
  }, []);

  const handleClear = useCallback(() => {
    setElements([]);
    socketRef.current?.emit("draw:clear");
  }, []);

  return (
    <div className="relative flex flex-col w-full h-full">
      {/* Canvas */}
      <div className="flex-1 overflow-hidden">
        <WhiteboardCanvas
          elements={elements}
          remoteCursor={remoteCursor}
          remotePreview={remotePreview}
          playerIndex={playerIndex}
          onElementComplete={handleElementComplete}
          onPreviewUpdate={handlePreviewUpdate}
          onCursorMove={handleCursorMove}
          onUndo={handleUndo}
          onErase={handleErase}
          onClear={handleClear}
        />
      </div>
    </div>
  );
}
