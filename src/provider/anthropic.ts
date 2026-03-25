import type { Request, Response, Tool, ToolCall, ToolMessage } from "@/llm/types";
import { Provider } from "@/provider";

interface AnthropicTextBlock {
	type: "text";
	text: string;
}

interface AnthropicToolUseBlock {
	type: "tool_use";
	id: string;
	name: string;
	input: unknown;
}

interface AnthropicToolResultBlock {
	type: "tool_result";
	tool_use_id: string;
	content: string;
}

type AnthropicContentBlock =
	| AnthropicTextBlock
	| AnthropicToolUseBlock
	| AnthropicToolResultBlock;

interface AnthropicMessage {
	role: "user" | "assistant";
	content: string | AnthropicContentBlock[];
}

interface AnthropicUsage {
	input_tokens: number;
	output_tokens: number;
}

interface AnthropicResponse {
	id: string;
	model: string;
	stop_reason: string | null;
	content: AnthropicContentBlock[];
	usage?: AnthropicUsage;
}

interface AnthropicTool {
	name: string;
	description?: string;
	input_schema: Record<string, unknown>;
}

interface AnthropicRequestBody {
	model: string;
	max_tokens: number;
	system?: string;
	messages: AnthropicMessage[];
	tools?: AnthropicTool[];
	tool_choice?:
		| { type: "auto" }
		| { type: "any" }
		| { type: "tool"; name: string };
}

const DEFAULT_BASE_URL = "https://api.anthropic.com/v1";
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

export class AnthropicProvider extends Provider {
	constructor(apiKey: string, baseURL = DEFAULT_BASE_URL) {
		super(baseURL, apiKey);
	}

	override async completion(request: Request): Promise<Response> {
		const body = this.buildRequestBody(request);
		const timeoutSignal = AbortSignal.timeout(
			request.timeOut ?? DEFAULT_TIMEOUT_MS,
		);
		const signal = request.signal
			? AbortSignal.any([request.signal, timeoutSignal])
			: timeoutSignal;
		const rawResponse = await fetch(`${this.baseURL}/messages`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-api-key": this.apiKey,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify(body),
			signal,
		});

		if (!rawResponse.ok) {
			const errorText = await rawResponse.text();
			throw new Error(
				`Anthropic request failed with status ${rawResponse.status}: ${errorText}`,
			);
		}

		const data = (await rawResponse.json()) as AnthropicResponse;
		return this.toResponse(data);
	}

	private buildRequestBody(request: Request): AnthropicRequestBody {
		const systemMessages = request.messages
			.filter((message) => message.role === "system")
			.map((message) => message.content.trim())
			.filter(Boolean);

		const messages = this.toAnthropicMessages(request.messages);

		const body: AnthropicRequestBody = {
			model: request.model,
			max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
			messages,
		};

		if (systemMessages.length > 0) {
			body.system = systemMessages.join("\n\n");
		}

		if (request.tools && request.tools.length > 0) {
			body.tools = request.tools.map((tool) => this.toAnthropicTool(tool));
		}

		if (request.toolChoice) {
			body.tool_choice = this.toAnthropicToolChoice(request.toolChoice);
		}

		return body;
	}

	private toAnthropicMessages(messages: Request["messages"]): AnthropicMessage[] {
		const anthropicMessages: AnthropicMessage[] = [];

		for (const message of messages) {
			if (message.role === "system") continue;

			if (message.role === "tool") {
				const lastMessage = anthropicMessages[anthropicMessages.length - 1];
				const toolResultBlock = this.toAnthropicToolResultBlock(message);

				if (
					lastMessage?.role === "user" &&
					Array.isArray(lastMessage.content) &&
					lastMessage.content.every((block) => block.type === "tool_result")
				) {
					lastMessage.content.push(toolResultBlock);
					continue;
				}

				anthropicMessages.push({
					role: "user",
					content: [toolResultBlock],
				});
				continue;
			}

			anthropicMessages.push(this.toAnthropicMessage(message));
		}

		return anthropicMessages;
	}

	private toAnthropicRole(
		role: Request["messages"][number]["role"],
	): "user" | "assistant" {
		if (role === "assistant") return "assistant";
		return "user";
	}

	private toAnthropicMessage(
		message: Request["messages"][number],
	): AnthropicMessage {
		if (message.role === "assistant") {
			const content: AnthropicContentBlock[] = [];
			if (message.content) {
				content.push({
					type: "text",
					text: message.content,
				});
			}
			if (message.toolCalls) {
				for (const toolCall of message.toolCalls) {
					content.push({
						type: "tool_use",
						id: toolCall.id,
						name: toolCall.name,
						input: JSON.parse(toolCall.arguments),
					});
				}
			}
			return {
				role: "assistant",
				content,
			};
		}

		return {
			role: this.toAnthropicRole(message.role),
			content: message.content,
		};
	}

	private toAnthropicToolResultBlock(
		message: ToolMessage,
	): AnthropicToolResultBlock {
		return {
			type: "tool_result",
			tool_use_id: message.toolCallId,
			content: message.content,
		};
	}

	private toAnthropicTool(tool: Tool): AnthropicTool {
		return {
			name: tool.name,
			description: tool.description,
			input_schema: tool.parameters ?? {
				type: "object",
				properties: {},
			},
		};
	}

	private toAnthropicToolChoice(
		toolChoice: NonNullable<Request["toolChoice"]>,
	): AnthropicRequestBody["tool_choice"] {
		if (toolChoice === "auto") return { type: "auto" };
		if (toolChoice === "none") return undefined;
		return { type: "tool", name: toolChoice.name };
	}

	private toResponse(response: AnthropicResponse): Response {
		const textContent = response.content
			.filter((block): block is AnthropicTextBlock => block.type === "text")
			.map((block) => block.text)
			.join("");
		const toolCalls = this.toToolCalls(response.content);

		return {
			id: response.id,
			model: response.model,
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: textContent,
						toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
					},
					finishReason: this.toFinishReason(response.stop_reason, toolCalls),
				},
			],
			usage: response.usage
				? {
						promptTokens: response.usage.input_tokens,
						completionTokens: response.usage.output_tokens,
						totalTokens:
							response.usage.input_tokens + response.usage.output_tokens,
					}
				: undefined,
		};
	}

	private toToolCalls(content: AnthropicContentBlock[]): ToolCall[] {
		return content
			.filter(
				(block): block is AnthropicToolUseBlock => block.type === "tool_use",
			)
			.map((block) => ({
				id: block.id,
				name: block.name,
				arguments: JSON.stringify(block.input ?? {}),
			}));
	}

	private toFinishReason(
		stopReason: AnthropicResponse["stop_reason"],
		toolCalls: ToolCall[],
	): Response["choices"][number]["finishReason"] {
		if (toolCalls.length > 0 || stopReason === "tool_use") {
			return "tool_calls";
		}
		if (stopReason === "max_tokens") {
			return "length";
		}
		return stopReason ?? "stop";
	}
}

export default AnthropicProvider;
