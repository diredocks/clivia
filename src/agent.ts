import { EventEmitter } from "@/emitter";
import type { LLM } from "@/llm";
import type {
  AssistantMessage,
  Response,
  ToolCall,
  ToolResult,
} from "@/llm/types";
import type { Session } from "@/session";

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
        this.abortController.signal,
      );
    } catch {
      this.switch("idle");
      return;
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
      for (const toolCall of choice.message.toolCalls) {
        await this.handleToolCalls(toolCall);
      }
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

  private async handleToolCalls(toolCall: ToolCall) {
    const tool = this.session.tools.find((t) => t.name === toolCall.name);
    if (!tool) {
      this.session.messages.push({
        role: "tool",
        toolCallId: toolCall.id,
        content: `Error: Unknown tool '${toolCall.name}'`,
      });
      return;
    }

    const result: ToolResult = await tool.invoke(
      toolCall,
      this.session,
      this.llm,
    );
    this.session.messages.push({
      role: "tool",
      toolCallId: result.toolCallId,
      content: result.content,
    });
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
