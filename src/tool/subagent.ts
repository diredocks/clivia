import { Agent } from "@/agent";
import { contextManager } from "@/context";
import type { LLM } from "@/llm";
import type { ToolParameters } from "@/llm/types";
import { ToolBase } from "@/tool";

const SUBAGENT_SYSTEM_PROMPT = `
Execute the task exactly and return only the result.
Any extra content is considered an error.
`;

export class SubAgent extends ToolBase {
  readonly name = "subagent";
  readonly description =
    "Run a sub-agent with an isolated context and return its final response.";
  readonly parameters: ToolParameters = {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The task to give to the sub-agent.",
      },
    },
    required: ["prompt"],
  };

  override async execute(
    args: Record<string, unknown>,
    llm: LLM,
  ): Promise<string> {
    const { prompt } = args;

    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("Argument 'prompt' must be a non-empty string.");
    }

    const [id, context] = contextManager.create([
      { role: "system", content: SUBAGENT_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ]);
    context.tools = context.tools.filter((t) => t.name !== "subagent");

    const agent = new Agent(llm, context);
    await agent.loop();

    const last = context.messages[context.messages.length - 1];

    if (!last || last.role !== "assistant" || !last.content?.trim()) {
      throw new Error("Sub-agent returned empty result.");
    }

    contextManager.delete(id);
    return last.content;
  }
}
