import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import next from "next";
import type { DrawElement } from "./src/types/whiteboard";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "localhost";
const port = parseInt(process.env.PORT ?? "3001", 10);

interface RoomData {
  elements: DrawElement[];
  socketToPlayer: Map<string, number>;
  nextIndex: number;
}

const rooms = new Map<string, RoomData>();

function getOrCreateRoom(roomId: string): RoomData {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { elements: [], socketToPlayer: new Map(), nextIndex: 0 });
  }
  return rooms.get(roomId)!;
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handle);

  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*" },
    path: "/api/socketio",
  });

  io.on("connection", (socket) => {
    let currentRoom: string | null = null;
    let myPlayerIndex = 0;

    socket.on("room:join", ({ roomId }: { roomId: string }) => {
      currentRoom = roomId;
      socket.join(roomId);

      const room = getOrCreateRoom(roomId);
      myPlayerIndex = room.nextIndex;
      room.nextIndex++;
      room.socketToPlayer.set(socket.id, myPlayerIndex);

      // Send full state to the new joiner
      socket.emit("room:state", {
        elements: room.elements,
        playerIndex: myPlayerIndex,
      });

      socket.to(roomId).emit("player:joined", { playerIndex: myPlayerIndex });
    });

    // A completed shape/stroke/text element
    socket.on("draw:element", (element: DrawElement) => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      const el = { ...element, playerIndex: myPlayerIndex };
      room.elements.push(el);
      socket.to(currentRoom).emit("draw:element", el);
    });

    // In-progress preview (throttled by client)
    socket.on("draw:preview", (data: unknown) => {
      if (!currentRoom) return;
      socket.to(currentRoom).emit("draw:preview", { ...(data as object), playerIndex: myPlayerIndex });
    });

    // Cursor position
    socket.on("cursor:move", (pos: { x: number; y: number }) => {
      if (!currentRoom) return;
      socket.to(currentRoom).emit("cursor:move", { ...pos, playerIndex: myPlayerIndex });
    });

    // Undo last element by this player
    socket.on("draw:undo", () => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      for (let i = room.elements.length - 1; i >= 0; i--) {
        if (room.elements[i].playerIndex === myPlayerIndex) {
          room.elements.splice(i, 1);
          break;
        }
      }
      io.to(currentRoom).emit("room:elements", room.elements);
    });

    // Erase specific elements by id
    socket.on("draw:erase", ({ ids }: { ids: string[] }) => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      const set = new Set(ids);
      room.elements = room.elements.filter((el) => !set.has(el.id));
      socket.to(currentRoom).emit("draw:erase", { ids });
    });

    // Clear entire board
    socket.on("draw:clear", () => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      room.elements = [];
      io.to(currentRoom).emit("room:elements", []);
    });

    socket.on("disconnect", () => {
      if (currentRoom) {
        const room = rooms.get(currentRoom);
        if (room) room.socketToPlayer.delete(socket.id);
        socket.to(currentRoom).emit("player:left", { playerIndex: myPlayerIndex });
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Whiteboard ready at http://${hostname}:${port}`);
  });
});
