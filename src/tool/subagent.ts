import { Agent } from "@/agent";
import type { LLM } from "@/llm";
import type { ToolParameters } from "@/llm/types";
import type { Session } from "@/session";
import { ToolBase } from "@/tool";

const SUBAGENT_SYSTEM_PROMPT = `
You are a focused execution agent.

Your job is to complete the given task based only on the user prompt.

Rules:
- Follow the instructions strictly.
- Do not change or reinterpret the task.
- Do not ask unnecessary questions.
- Do not introduce new goals or assumptions.
- Keep your response concise and relevant.
- If the task is unclear, make the simplest reasonable assumption and proceed.

Output:
- Return only the final result.
- Do not include explanations unless explicitly requested.
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
    session: Session,
    llm: LLM,
  ): Promise<string> {
    const { prompt } = args;

    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("Argument 'prompt' must be a non-empty string.");
    }

    const subSession: Session = {
      messages: [
        {
          role: "system",
          content: SUBAGENT_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      tools: session.tools.filter((t) => t.name !== "subagent"),
    };
    const agent = new Agent(llm, subSession);
    await agent.loop();

    const last = subSession.messages[subSession.messages.length - 1];

    if (!last || last.role !== "assistant" || !last.content?.trim()) {
      throw new Error("Sub-agent returned empty result.");
    }

    return last.content;
  }
}
