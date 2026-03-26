import { EventEmitter } from "@/emitter";
import type { LLM } from "@/llm";
import type {
  AssistantMessage,
  Response,
  ToolCall,
  ToolMessage,
  ToolResult,
} from "@/llm/types";
import type { Session } from "@/session";

export type AgentEvents = {
  assistant: (message: AssistantMessage) => void | Promise<void>;
  idle: () => void | Promise<void>;
  loop: () => void | Promise<void>;
  toolCall: (call: ToolCall) => void | Promise<void>;
  toolResult: (message: ToolMessage) => void | Promise<void>;
};

export type AgentStates = "loop" | "idle";

export class Agent {
  private state: AgentStates = "idle";
  readonly events = new EventEmitter<AgentEvents>();

  constructor(
    private llm: LLM,
    private session: Session,
  ) {}

  async iteration() {
    let response: Response;

    try {
      response = await this.llm.messages(
        this.session.messages,
        this.session.tools.map((e) => e.toDefinition()),
        this.session.abortController.signal,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        this.switch("idle");
        return;
      }
      throw err;
    }

    const choice = response.choices[0];
    if (!choice) throw new Error("No response from LLM");

    this.session.messages.push(choice.message);

    if (choice.message.role !== "assistant") {
      throw Error("LLM responded message which role != assistant");
    }

    if (choice.message.content.trim()) {
      this.events.emit("assistant", choice.message);
    }

    if (choice.message.toolCalls?.length) {
      for (const call of choice.message.toolCalls) {
        await this.handleToolCalls(call);
      }
      this.switch("loop");
    } else {
      this.switch("idle");
    }
  }

  async loop() {
    this.switch("loop");
    while (this.state === "loop") {
      await this.iteration();
    }
  }

  private async handleToolCalls(call: ToolCall) {
    this.events.emit("toolCall", call);
    const message = {
      role: "tool",
      toolCallId: call.id,
      content: "",
    } as ToolMessage;

    const tool = this.session.tools.find((t) => t.name === call.name);
    if (tool) {
      const result: ToolResult = await tool.invoke(
        call,
        this.session,
        this.llm,
      );
      message.content = result.content;
    } else {
      message.content = `Error: Unknown tool '${call.name}'`;
    }

    this.session.messages.push(message);
    this.events.emit("toolResult", message);
  }

  private switch(target: AgentStates) {
    this.state = target;
    this.events.emit(target);
  }

  close() {
    this.session.abortController.abort();
  }

  getState() {
    return this.state;
  }
}
