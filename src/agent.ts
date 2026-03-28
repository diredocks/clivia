import type { Context } from "@/context";
import { EventEmitter } from "@/emitter";
import type { LLM } from "@/llm";
import type {
  AssistantMessage,
  Response,
  ToolCall,
  ToolMessage,
  ToolResult,
} from "@/llm/types";
import { createLogFn } from "@/log";

const log = createLogFn("agent");

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
    private context: Context,
  ) {}

  async iteration() {
    let response: Response;

    try {
      response = await this.llm.messages(
        this.context.messages,
        this.context.tools.map((e) => e.toDefinition()),
        this.context.abortController.signal,
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

    this.context.messages.push(choice.message);

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
    } else {
      this.switch("idle");
    }
  }

  async loop() {
    log("loop in");
    this.state = "loop";
    while (this.state === "loop") {
      await this.iteration();
    }
    log("loop out");
  }

  private async handleToolCalls(call: ToolCall) {
    log(`toolCall id=${call.id} name=${call.name}`);
    this.events.emit("toolCall", call);
    const message = {
      role: "tool",
      toolCallId: call.id,
      content: "",
    } as ToolMessage;

    const tool = this.context.tools.find((t) => t.name === call.name);
    if (tool) {
      const result: ToolResult = await tool.invoke(call, this.llm);
      message.content = result.content;
    } else {
      message.content = `Error: Unknown tool '${call.name}'`;
    }

    this.context.messages.push(message);
    this.events.emit("toolResult", message);
    log(
      `toolCall id=${message.toolCallId} result=${message.content.slice(0, 20).trim()}...`,
    );
  }

  private switch(target: AgentStates) {
    log(`state ${this.state} -> ${target}`);
    this.state = target;
    this.events.emit(target);
  }

  close() {
    this.context.abortController.abort();
  }

  get State() {
    return this.state;
  }
}

export class AgentManager {
  private agents: Map<string, Agent> = new Map();

  create(llm: LLM, context: Context, id?: string): [string, Agent] {
    const Id = id ?? crypto.randomUUID();
    const agent = new Agent(llm, context);
    this.agents.set(Id, agent);
    log(`agent ${Id} created`);
    return [Id, agent];
  }

  get(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  require(id: string): Agent {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }
    return agent;
  }

  delete(id: string): boolean {
    log(`agent ${id} deleted`);
    return this.agents.delete(id);
  }

  clear(): void {
    this.agents.clear();
  }

  list(): Agent[] {
    return [...this.agents.values()];
  }
}

export const agentManager = new AgentManager();
