import type { Message, Response, Tool } from "@/llm/types";
import type { Provider } from "@/provider";
import AnthropicProvider from "@/provider/anthropic";
import OpenAIProvider from "@/provider/openai";

export class LLM {
  private provider: Provider;

  constructor(
    type: "anthropic" | "openai",
    baseURL: string,
    apiKey: string,
    readonly model: string,
  ) {
    switch (type) {
      case "openai":
        this.provider = new OpenAIProvider(apiKey, baseURL);
        break;
      default:
        this.provider = new AnthropicProvider(apiKey, baseURL);
    }
  }

  async prompt(prompt: string, maxTokens?: number): Promise<string> {
    const response = await this.provider.completion({
      model: this.model,
      messages: [{ role: "user", content: prompt }],
      maxTokens,
    });
    const content = response.choices[0]?.message.content;
    if (!content) throw new Error("Chat message shoun't be empty");
    return content;
  }

  async messages(
    messages: Message[],
    tools: Tool[],
    signal?: AbortSignal,
  ): Promise<Response> {
    return this.provider.completion({
      messages,
      model: this.model,
      tools,
      signal,
    });
  }
}
