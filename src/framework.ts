import { type Agent, agentManager } from "@/agent";
import type { Channel } from "@/channel";
import { type Context, contextManager } from "@/context";
import type { LLM } from "@/llm";
import type { AssistantMessage, Message, UserMessage } from "@/llm/types";
import { createLogFn } from "@/log";
import { memoryStore } from "@/memory";

// TODO: memory system and skill discovery
// TODO: heartbeat / cron

const SYSTEM_PROMPT = `
You're clivia, an AI agent.
Follow these rules:
1. Reply as short as possible in user's language, no emoji.
When calling tools:
2. Reply with an complete sentence without colon in the end
3. Tell user what tool you called and your intension.
`;

const SYSTEM_MESSAGE: Message = { role: "system", content: SYSTEM_PROMPT };

const log = createLogFn("framework");

export class Framework {
  private queue: UserMessage[] = [];
  private flushing = false;
  private agent!: Agent;
  private context!: Context;

  constructor(
    readonly llm: LLM,
    readonly channel: Channel,
  ) {
    log("clivia, an experimental agent");

    if (!channel.prepare()) throw new Error("Failed to prepare channel");
    this.initialize(true);
    this.channel.events.on("receive", (content) => this.onReceived(content));
  }

  private initialize(loadMemory = false) {
    const messages = loadMemory
      ? memoryStore.load([SYSTEM_MESSAGE])
      : [SYSTEM_MESSAGE];

    [, this.context] = contextManager.create(messages, "root");
    [, this.agent] = agentManager.create(this.llm, this.context, "root");

    this.agent.events.on("assistant", (message) => this.onAssistant(message));
    this.agent.events.on("idle", () => this.flush());
  }

  async onAssistant(message: AssistantMessage) {
    this.channel.send(message);
  }

  async onReceived(content: string) {
    if (this.actions(content)) return;
    if (content.trim() === "") return;
    this.queue.push({ role: "user", content });
    this.flush();
  }

  private async flush() {
    if (this.flushing) return;
    if (this.agent.State === "loop") return;
    if (this.queue.length === 0) return;

    this.flushing = true;
    log(`flush in queue=${this.queue.length}`);
    this.context.messages.push(...this.queue);
    this.queue = [];

    await this.agent.loop();
    log(`flush out queue=${this.queue.length}`);
    this.flushing = false;

    if (this.queue.length > 0) void this.flush();
  }

  actions(content: string) {
    if (!content.startsWith(",")) return false;
    const action = content.slice(1);
    switch (action) {
      case "quit":
      case "exit":
      case "close": {
        this.close();
        return true;
      }
      case "help": {
        this.channel.send("i'm too lazy to write help");
        return true;
      }
      case "context": {
        this.channel.send(`count=${contextManager.list().length}`);
        return true;
      }
      case "context.root": {
        this.channel.send(
          `messages=${this.context.messages.length} tool=${this.context.messages.filter((e) => e.role === "tool").length}`,
        );
        return true;
      }
      case "agent": {
        this.channel.send(`count=${agentManager.list().length}`);
        return true;
      }
      case "agent.root": {
        this.channel.send(`status=${this.agent.State}`);
        return true;
      }
      case "restart": {
        this.restart();
        return true;
      }
    }
    this.channel.send(`unknown action "${action}"`);
    return true;
  }

  start() {
    this.channel.start();
    log("start");
  }

  restart() {
    log("restarting");

    memoryStore.save(this.context.messages);
    this.agent.close();
    agentManager.clear();
    contextManager.clear();
    contextManager.resetController();

    this.queue = [];
    this.flushing = false;

    this.initialize(true);
    this.channel.send("restarted");

    log("restarted");
  }

  close() {
    memoryStore.save(this.context.messages);
    contextManager.clear();
    this.agent.close();
    this.channel.close();
    log("closed");
  }
}
