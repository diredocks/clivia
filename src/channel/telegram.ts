import { Bot } from "gramio";
import { Channel } from "@/channel";
import type { AssistantMessage } from "@/llm/types";

export class TelegramChannel extends Channel {
  private bot: Bot | null = null;

  constructor(
    private token: string,
    private chatId: string,
  ) {
    super();
  }

  prepare(): boolean {
    if (this.bot) return true;
    this.bot = new Bot(this.token);
    this.bot.on("message", (ctx) => {
      this.events.emit("receive", ctx.text ?? "(empty)");
    });
    return true;
  }

  send(message: AssistantMessage | string) {
    const content = typeof message === "string" ? message : message.content;
    const payload = `${content}`;

    this.bot?.api.sendMessage({ chat_id: this.chatId, text: payload });
  }

  start() {
    if (!this.bot) throw new Error("Telegram channel is not prepared");
    this.bot.start();
  }

  async close() {
    await this.bot?.api.deleteWebhook({ drop_pending_updates: true });
    await this.bot?.api.close();
    this.bot = null;
  }
}
