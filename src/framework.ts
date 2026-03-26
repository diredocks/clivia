import { Agent } from "@/agent";
import type { Channel } from "@/channel";
import { type Context, contextManager } from "@/context";
import type { LLM } from "@/llm";
import type {
  AssistantMessage,
  ToolCall,
  ToolMessage,
  UserMessage,
} from "@/llm/types";

export class Framework {
  private agent: Agent;
  private queue: UserMessage[] = [];
  private context: Context;

  constructor(
    readonly llm: LLM,
    readonly channel: Channel,
  ) {
    if (!channel.prepare()) throw new Error("Failed to prepare channel");
    [, this.context] = contextManager.create([], "root");

    this.agent = new Agent(this.llm, this.context);

    this.agent.events.on("assistant", (message) => this.onAssistant(message));
    this.agent.events.on("idle", () => this.flush());
    this.agent.events.on("toolCall", (call) => this.onToolCall(call));
    this.agent.events.on("toolResult", (message) => this.onToolResult(message));
    this.channel.events.on("receive", (content) => this.onReceived(content));
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
    if (this.agent.State === "loop") return;
    if (this.queue.length === 0) return;

    this.context.messages.push(...this.queue);
    this.queue = [];

    await this.agent.loop();
  }

  private async onToolCall(call: ToolCall) {
    this.channel.send(
      `tool.call id=${call.id} name=${call.name} args=${call.arguments}`,
    );
  }

  private async onToolResult(message: ToolMessage) {
    this.channel.send(
      `tool.result id=${message.toolCallId} content=${message.content}`,
    );
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
          `count=${this.context.messages.length} tool=${this.context.messages.filter((e) => e.role === "tool").length}`,
        );
        return true;
      }
      case "status": {
        this.channel.send(`${this.agent.State}`);
        return true;
      }
    }
    this.channel.send(`unknown action "${action}"`);
    return true;
  }

  start() {
    this.channel.start();
  }

  close() {
    contextManager.clear();
    this.agent.close();
    this.channel.close();
  }
}
