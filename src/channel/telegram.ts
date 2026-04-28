import { markdownToFormattable } from "@gramio/format/markdown";
import { Bot } from "gramio";
import { Channel } from "@/channel";
import type { AssistantMessage } from "@/llm/types";

interface CommandConfig {
  command: string;
  description: string;
}

const COMMANDS: CommandConfig[] = [
  { command: "help", description: "Show available commands" },
  { command: "context", description: "Show context count" },
  { command: "context_root", description: "Show root context details" },
  { command: "agent", description: "Show agent count" },
  { command: "agent_root", description: "Show root agent status" },
  { command: "restart", description: "Restart the agent" },
  { command: "quit", description: "Close the agent" },
];

export const TELEGRAM_COMMANDS = COMMANDS.map((c) => c.command);

export class TelegramChannel extends Channel {
  private bot: Bot | null = null;

  constructor(
    private token: string,
    private chatId: string,
  ) {
    super();
  }

  async prepare() {
    if (this.bot) return true;
    this.bot = new Bot(this.token);
    this.bot.on("message", (ctx) => {
      this.events.emit("receive", ctx.text ?? "(empty)");
    });
    await this.registerCommands();
    return true;
  }

  private async registerCommands(): Promise<void> {
    if (!this.bot) throw new Error("Telegram channel is not prepared");
    await this.bot.api.setMyCommands({
      commands: COMMANDS.map((c) => ({
        command: c.command,
        description: c.description,
      })),
    });
  }

  send(message: AssistantMessage | string) {
    const content = typeof message === "string" ? message : message.content;
    const payload = markdownToFormattable(content);

    this.bot?.api.sendMessage({
      chat_id: this.chatId,
      text: payload.text,
      entities: payload.entities,
    });
  }

  start() {
    if (!this.bot) throw new Error("Telegram channel is not prepared");
    this.bot.start();
  }

  async close() {
    // await this.bot!.stop();
    this.bot = null;
  }
}
