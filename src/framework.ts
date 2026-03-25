import { Agent } from "@/agent";
import type { Channel } from "@/channel";
import type { LLM } from "@/llm";
import type { AssistantMessage, UserMessage } from "@/llm/types";
import type { Session } from "@/session";
import { ExecTool } from "@/tool/exec";
import { SubAgent } from "@/tool/subagent";

export class Framework {
  private session: Session = {
    messages: [],
    tools: [new ExecTool(), new SubAgent()],
  };
  private agent: Agent;
  private queue: UserMessage[] = [];

  constructor(
    private llm: LLM,
    private channel: Channel,
  ) {
    if (!channel.prepare()) throw new Error("Failed to prepare channel");

    this.agent = new Agent(this.llm, this.session);

    this.agent.events.on("assistant", (message) => this.onAssistant(message));
    this.agent.events.on("idle", () => this.processQueue());
    this.channel.events.on("receive", (content) => this.onReceived(content));
  }

  async onAssistant(message: AssistantMessage) {
    this.channel.send(message);
  }

  async onReceived(content: string) {
    if (this.actions(content)) return;
    if (content.trim() === "") return;
    this.queue.push({ role: "user", content });
    this.processQueue();
  }

  private async processQueue() {
    if (this.agent.getState() === "loop") return;
    if (this.queue.length === 0) return;
    this.session.messages.push(...this.queue);
    this.queue = [];
    await this.agent.loop();
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
      case "session": {
        this.channel.send(
          `count=${this.session.messages.length} tool=${this.session.messages.filter((e) => e.role === "tool").length}`,
        );
        return true;
      }
      case "status": {
        this.channel.send(`${this.agent.getState()}`);
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
    this.agent.close();
    this.channel.close();
  }
}
