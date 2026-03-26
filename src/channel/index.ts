import { EventEmitter } from "@/emitter";
import type { AssistantMessage } from "@/llm/types";

// TODO: support for Telegram and Feishu

export type ChannelEvents = {
  receive: (content: string) => void;
};

export abstract class Channel {
  readonly events = new EventEmitter<ChannelEvents>();

  abstract prepare(): boolean | Promise<boolean>;
  abstract send(message: AssistantMessage | string): void | Promise<void>;
  abstract start(): void | Promise<void>;
  abstract close(): void | Promise<void>;
}
