import { createInterface, type Interface } from "node:readline";
import { Channel } from "@/channel";
import type { AssistantMessage } from "@/llm/types";

export class CLIChannel extends Channel {
	private rl: Interface | null = null;

	prepare(): boolean {
		return true;
	}

	send(message: AssistantMessage | string) {
		if (typeof message === "string") {
			process.stdout.write(message);
			return;
		}
		process.stdout.write(`${message.content}\n`);
	}

	start(): void {
		if (this.rl) return;
		this.rl = createInterface({
			input: process.stdin,
			output: process.stdout,
			// terminal: false,
		});

		this.rl.on("line", (line) => this.events.emit("receive", line));
		this.rl.on("close", () => this.close());
	}

	close(): void {
		if (!this.rl) return;
		this.rl.close();
		this.rl = null;
	}
}
