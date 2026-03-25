import type { Request, Response, Tool, ToolCall, ToolMessage } from "@/llm/types";
import { Provider } from "@/provider";

interface OpenAIMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string | null;
	tool_call_id?: string;
	tool_calls?: OpenAIToolCall[];
}

interface OpenAIToolFunction {
	name: string;
	description?: string;
	parameters: Record<string, unknown>;
}

interface OpenAITool {
	type: "function";
	function: OpenAIToolFunction;
}

interface OpenAIToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

interface OpenAIChoice {
	index: number;
	finish_reason: string | null;
	message: {
		role: "assistant";
		content: string | null;
		tool_calls?: OpenAIToolCall[];
	};
}

interface OpenAIUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
}

interface OpenAIResponse {
	id: string;
	model: string;
	choices: OpenAIChoice[];
	usage?: OpenAIUsage;
}

interface OpenAIRequestBody {
	model: string;
	messages: OpenAIMessage[];
	max_tokens?: number;
	tools?: OpenAITool[];
	tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS = 60_000;

export class OpenAIProvider extends Provider {
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
		const rawResponse = await fetch(`${this.baseURL}/chat/completions`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${this.apiKey}`,
				"content-type": "application/json",
			},
			body: JSON.stringify(body),
			signal,
		});

		if (!rawResponse.ok) {
			const errorText = await rawResponse.text();
			throw new Error(
				`OpenAI request failed with status ${rawResponse.status}: ${errorText}`,
			);
		}

		const data = (await rawResponse.json()) as OpenAIResponse;
		return this.toResponse(data);
	}

	private buildRequestBody(request: Request): OpenAIRequestBody {
		const body: OpenAIRequestBody = {
			model: request.model,
			messages: request.messages.map((message) => this.toOpenAIMessage(message)),
		};

		if (request.maxTokens !== undefined) {
			body.max_tokens = request.maxTokens;
		}

		if (request.tools && request.tools.length > 0) {
			body.tools = request.tools.map((tool) => this.toOpenAITool(tool));
		}

		const toolChoice = this.toOpenAIToolChoice(request.toolChoice);
		if (toolChoice) {
			body.tool_choice = toolChoice;
		}

		return body;
	}

	private toOpenAIMessage(
		message: Request["messages"][number],
	): OpenAIMessage {
		if (message.role === "tool") {
			return this.toOpenAIToolMessage(message);
		}

		if (message.role === "assistant") {
			return {
				role: "assistant",
				content: message.content || null,
				tool_calls: message.toolCalls?.map((toolCall) => ({
					id: toolCall.id,
					type: "function",
					function: {
						name: toolCall.name,
						arguments: toolCall.arguments,
					},
				})),
			};
		}

		return {
			role: message.role,
			content: message.content,
		};
	}

	private toOpenAIToolMessage(message: ToolMessage): OpenAIMessage {
		return {
			role: "tool",
			content: message.content,
			tool_call_id: message.toolCallId,
		};
	}

	private toOpenAITool(tool: Tool): OpenAITool {
		return {
			type: "function",
			function: {
				name: tool.name,
				description: tool.description,
				parameters: tool.parameters ?? {
					type: "object",
					properties: {},
				},
			},
		};
	}

	private toOpenAIToolChoice(
		toolChoice: Request["toolChoice"],
	): OpenAIRequestBody["tool_choice"] | undefined {
		if (!toolChoice || toolChoice === "auto" || toolChoice === "none") {
			return toolChoice;
		}

		return {
			type: "function",
			function: {
				name: toolChoice.name,
			},
		};
	}

	private toResponse(response: OpenAIResponse): Response {
		return {
			id: response.id,
			model: response.model,
			choices: response.choices.map((choice) => {
				const toolCalls = this.toToolCalls(choice.message.tool_calls);

				return {
					index: choice.index,
					message: {
						role: "assistant",
						content: choice.message.content ?? "",
						toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
					},
					finishReason: this.toFinishReason(choice.finish_reason, toolCalls),
				};
			}),
			usage: response.usage
				? {
						promptTokens: response.usage.prompt_tokens,
						completionTokens: response.usage.completion_tokens,
						totalTokens: response.usage.total_tokens,
					}
				: undefined,
		};
	}

	private toToolCalls(toolCalls: OpenAIToolCall[] | undefined): ToolCall[] {
		if (!toolCalls) return [];

		return toolCalls.map((toolCall) => ({
			id: toolCall.id,
			name: toolCall.function.name,
			arguments: toolCall.function.arguments,
		}));
	}

	private toFinishReason(
		finishReason: string | null,
		toolCalls: ToolCall[],
	): Response["choices"][number]["finishReason"] {
		if (toolCalls.length > 0 || finishReason === "tool_calls") {
			return "tool_calls";
		}
		if (finishReason === "length") {
			return "length";
		}
		return finishReason ?? "stop";
	}
}

export default OpenAIProvider;
