import { Server as HTTPServer } from "http";
import { Server as SocketIOServer } from "socket.io";

let io: SocketIOServer | null = null;

export const initSocket = (httpServer: HTTPServer) => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: "http://localhost:5173",
      credentials: true,
    },
  });
  return io;
};

// Use a standard function declaration for better compatibility
export function getIO() {
  return io;
}
