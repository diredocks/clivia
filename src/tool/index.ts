import type {
  Message,
  Tool,
  ToolCall,
  ToolParameters,
  ToolResult,
} from "@/llm/types";

export abstract class ToolBase {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: ToolParameters;

  abstract execute(
    args: Record<string, unknown>,
    messages?: Message[],
  ): Promise<string> | string;

  toDefinition(): Tool {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters as unknown as Record<string, unknown>,
    };
  }

  async invoke(toolCall: ToolCall, messages?: Message[]): Promise<ToolResult> {
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
      const result = await this.execute(args, messages);
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
