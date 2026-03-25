import type { LLM } from "@/llm";
import type { Tool, ToolCall, ToolParameters, ToolResult } from "@/llm/types";
import type { Session } from "@/session";

export abstract class ToolBase {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: ToolParameters;

  abstract execute(
    args: Record<string, unknown>,
    session: Session,
    llm: LLM,
  ): Promise<string> | string;

  toDefinition(): Tool {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters as unknown as Record<string, unknown>,
    };
  }

  async invoke(
    toolCall: ToolCall,
    session: Session,
    llm: LLM,
  ): Promise<ToolResult> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(toolCall.arguments) as Record<string, unknown>;
    } catch {
      return {
        toolCallId: toolCall.id,
        content: `Error: Invalid JSON arguments: ${toolCall.arguments}`,
      };
    }

    try {
      const result = await this.execute(args, session, llm);
      return {
        toolCallId: toolCall.id,
        content: result,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        toolCallId: toolCall.id,
        content: `Error: ${errorMessage}`,
      };
    }
  }
}
