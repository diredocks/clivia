import type { Agent } from "@/agent";
import type { Channel } from "@/channel";
import type { AssistantMessage, Message, UserMessage } from "@/llm/types";

export class Framework {
	private messages: Message[] = [];
	private queue: UserMessage[] = [];

	constructor(
		private agent: Agent,
		private channel: Channel,
	) {
		if (!channel.prepare()) throw new Error("Failed to prepare channel");

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
		this.messages.push(...this.queue);
		this.queue = [];
		await this.agent.loop(this.messages);
	}

	actions(content: string) {
		switch (content) {
			case ",help": {
				this.channel.send("o_0?!\n");
				return true;
			}
			case ",quit":
			case ",exit": {
				this.close();
				return true;
			}
			case ",status": {
				this.channel.send(`${this.agent.getState()}\n`);
				return true;
			}
		}

		return false;
	}

	start() {
		this.channel.start();
	}

	close() {
		this.agent.close();
		this.channel.close();
	}
}
