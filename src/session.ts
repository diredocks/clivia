import type { Message } from "@/llm/types";
import type { ToolBase } from "@/tool";

export interface Session {
  messages: Message[];
  tools: ToolBase[];
  abortController: AbortController;
}
