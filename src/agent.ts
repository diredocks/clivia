import { EventEmitter } from "@/emitter";
import type { LLM } from "@/llm";
import type { AssistantMessage, Message } from "@/llm/types";

export type AgentEvents = {
	assistant: (message: AssistantMessage) => void | Promise<void>;
};

export class Agent {
	private state: "loop" | "idle" = "idle";
	readonly events = new EventEmitter<AgentEvents>();

	constructor(private llm: LLM) {}

	async iteration(messages: Message[]) {
		const response = await this.llm.messages(messages);
		const choice = response.choices[0];
		if (!choice) throw new Error("No response from LLM");

		messages.push(choice.message);

		if (choice.message.role === "assistant") {
			if (choice.message.content.trim()) {
				this.events.emit("assistant", choice.message);
			}

			if (choice.message.toolCalls?.length) {
				// await this.handleToolCalls(messages, choice.message.toolCalls, tools);
				throw new Error("Not Implemented");
			} else {
				this.state = "idle";
			}
		}
	}

	async loop(messages: Message[]) {
		this.state = "loop";
		while (this.state === "loop") {
			await this.iteration(messages);
		}
	}

	getState() {
		return this.state;
	}
}
