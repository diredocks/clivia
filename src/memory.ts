import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Message } from "@/llm/types";
import { createLogFn } from "@/log";

const log = createLogFn("memory");

export class MemoryStore {
  private readonly filePath: string;

  constructor(filePath = resolve(process.cwd(), ".clivia", "memory.jsonl")) {
    this.filePath = filePath;
  }

  load(fallback: Message[] = []): Message[] {
    this.ensureDir();

    if (!existsSync(this.filePath)) {
      log(`load miss path=${this.filePath} fallback=${fallback.length}`);
      return [...fallback];
    }

    const messages = readFileSync(this.filePath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Message);

    if (messages.length > 0) {
      log(`load hit path=${this.filePath} messages=${messages.length}`);
      return messages;
    }

    log(`load empty path=${this.filePath} fallback=${fallback.length}`);
    return [...fallback];
  }

  save(messages: Message[]): void {
    this.ensureDir();
    const content = messages.map((message) => JSON.stringify(message)).join("\n");
    writeFileSync(this.filePath, content ? `${content}\n` : "", "utf8");
    log(`save path=${this.filePath} messages=${messages.length}`);
  }

  private ensureDir() {
    mkdirSync(dirname(this.filePath), { recursive: true });
  }
}

export const memoryStore = new MemoryStore();
