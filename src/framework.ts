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

		this.agent.events.on("assistant", async (message) =>
			this.onAssistant(message),
		);
		this.channel.events.on("receive", async (content) =>
			this.onReceived(content),
		);
	}

	async onAssistant(message: AssistantMessage) {
		this.channel.send(message);

		if (this.queue.length > 0) {
			this.messages.push(...this.queue);
			this.queue = [];
			this.agent.loop(this.messages);
		}
	}

	async onReceived(content: string) {
		if (this.actions(content)) return;

		if (this.agent.getState() !== "idle") {
			this.queue.push({ role: "user", content });
			return;
		}

		this.messages.push({ role: "user", content });
		this.agent.loop(this.messages);
	}

	actions(content: string) {
		switch (content) {
			case ",quit": {
				this.close();
				return true;
			}
			case ",status": {
				console.log(this.agent.getState());
				return true;
			}
		}

		return false;
	}

	start() {
		this.channel.start();
	}

	close() {
		this.channel.close();
		console.log(this.messages);
	}
}
