import type { Message } from "@/llm/types";
import type { ToolBase } from "@/tool";
import { ExecTool } from "@/tool/exec";
import { SubAgent } from "@/tool/subagent";

export class Context {
  readonly messages: Message[];
  public tools: ToolBase[] = [new ExecTool(), new SubAgent()];

  constructor(
    readonly abortController: AbortController,
    messages?: Message[],
  ) {
    this.messages = messages ?? [];
  }
}

export class ContextManager {
  private contexts: Map<string, Context> = new Map();
  // shared controller, but this may end up
  // causing ending subagent also kills root agent
  private controller = new AbortController();

  create(messages?: Message[], id?: string): [string, Context] {
    const Id = id ?? crypto.randomUUID();
    const context = new Context(this.controller, messages);
    this.contexts.set(Id, context);
    return [Id, context];
  }

  get(id: string): Context | undefined {
    return this.contexts.get(id);
  }

  require(id: string): Context {
    const context = this.contexts.get(id);
    if (!context) {
      throw new Error(`Context not found: ${id}`);
    }
    return context;
  }

  delete(id: string): boolean {
    return this.contexts.delete(id);
  }

  clear(): void {
    this.contexts.clear();
  }

  list(): Context[] {
    return [...this.contexts.values()];
  }
}

export const contextManager = new ContextManager();
