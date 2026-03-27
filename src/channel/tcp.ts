import { createServer, type Server, type Socket } from "node:net";
import { Channel } from "@/channel";
import type { AssistantMessage } from "@/llm/types";

export type TCPChannelOptions = {
  host?: string;
  port: number;
};

export class TCPChannel extends Channel {
  private readonly host: string;
  private readonly port: number;
  private readonly sockets = new Set<Socket>();
  private readonly buffers = new Map<Socket, string>();
  private server: Server | null = null;

  constructor(options: TCPChannelOptions) {
    super();
    this.host = options.host ?? "127.0.0.1";
    this.port = options.port;
  }

  prepare(): boolean {
    if (this.server) return true;

    this.server = createServer((socket) => {
      socket.setEncoding("utf8");
      this.sockets.add(socket);
      this.buffers.set(socket, "");

      socket.on("data", (chunk) =>
        this.onData(
          socket,
          typeof chunk === "string" ? chunk : chunk.toString("utf8"),
        ),
      );
      socket.on("close", () => this.onSocketClose(socket));
      socket.on("error", () => this.onSocketClose(socket));
    });

    return true;
  }

  send(message: AssistantMessage | string): void {
    const content = typeof message === "string" ? message : message.content;
    const payload = `${content}\n`;

    for (const socket of this.sockets) {
      if (socket.destroyed) {
        this.onSocketClose(socket);
        continue;
      }
      socket.write(payload);
    }
  }

  start(): Promise<void> | void {
    if (!this.server) throw new Error("TCP channel is not prepared");
    if (this.server.listening) return;

    return new Promise<void>((resolve, reject) => {
      const server = this.server;
      if (!server) {
        reject(new Error("TCP channel is not prepared"));
        return;
      }

      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.port, this.host);
    });
  }

  close(): void {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();
    this.buffers.clear();

    this.server?.close();
    this.server = null;
  }

  private onData(socket: Socket, chunk: string) {
    const buffer = `${this.buffers.get(socket) ?? ""}${chunk}`;
    const lines = buffer.split(/\r?\n/);
    const rest = lines.pop() ?? "";

    this.buffers.set(socket, rest);
    for (const line of lines) {
      this.events.emit("receive", line);
    }
  }

  private onSocketClose(socket: Socket) {
    const rest = this.buffers.get(socket)?.trim();
    if (rest) this.events.emit("receive", rest);

    this.buffers.delete(socket);
    this.sockets.delete(socket);
  }
}
