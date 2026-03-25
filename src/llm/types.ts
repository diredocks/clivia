export type Role = "system" | "user" | "assistant" | "tool";

interface BaseMessage {
  content: string;
}

export interface SystemMessage extends BaseMessage {
  role: "system";
}
export interface UserMessage extends BaseMessage {
  role: "user";
}
export interface AssistantMessage extends BaseMessage {
  role: "assistant";
  toolCalls?: ToolCall[];
}
export interface ToolMessage extends BaseMessage {
  role: "tool";
  toolCallId: string;
}

export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage;

export interface Tool {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface ToolParameter {
  type: string;
  description?: string;
  enum?: string[];
}

export interface ToolParameters {
  type: "object";
  properties: Record<string, ToolParameter>;
  required?: string[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
}

export interface Choice {
  index: number;
  message: Message;

  finishReason: "stop" | "length" | "tool_calls" | string;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface Response {
  id: string;
  model: string;
  choices: Choice[];
  usage?: Usage;
}

export interface Request {
  model: string;
  messages: Message[];
  timeOut?: number;
  signal?: AbortSignal;
  maxTokens?: number;
  tools?: Tool[];
  toolChoice?: "auto" | "none" | { name: string };
}
