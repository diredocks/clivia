import { EventEmitter } from "@/emitter";
import type { LLM } from "@/llm";
import type { AssistantMessage, Message, Response } from "@/llm/types";

export type AgentEvents = {
	assistant: (message: AssistantMessage) => void | Promise<void>;
	idle: () => void | Promise<void>;
	loop: () => void | Promise<void>;
};

export type AgentStates = "loop" | "idle";

export class Agent {
	private state: AgentStates = "idle";
	private abortController = new AbortController();
	readonly events = new EventEmitter<AgentEvents>();

	constructor(private llm: LLM) {}

	async iteration(messages: Message[]) {
		let response: Response;

		try {
			response = await this.llm.messages(messages, this.abortController.signal);
		} catch {
			this.switch("idle");
			return;
		}

		const choice = response.choices[0];
		if (!choice) throw new Error("No response from LLM");

		messages.push(choice.message);

		if (choice.message.role !== "assistant") {
			throw Error("LLM responded message which role != assistant");
		}

		if (choice.message.content.trim()) {
			this.events.emit("assistant", choice.message);
		}

		if (choice.message.toolCalls?.length) {
			// await this.handleToolCalls(messages, choice.message.toolCalls, tools);
			throw new Error("Tool calling not implemented yet");
		} else {
			this.switch("idle");
		}
	}

	async loop(messages: Message[]) {
		this.switch("loop");
		while (this.state === "loop") {
			await this.iteration(messages);
		}
	}

	private switch(target: AgentStates) {
		this.state = target;
		this.events.emit(target);
	}

	close() {
		this.abortController.abort();
	}

	getState() {
		return this.state;
	}
}
