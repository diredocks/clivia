import type { Request, Response } from "@/llm/types";

export abstract class Provider {
  constructor(
    readonly baseURL: string,
    readonly apiKey: string,
  ) {}

  abstract completion(request: Request): Promise<Response>;
}
