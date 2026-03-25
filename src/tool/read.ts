import { resolve } from "node:path";

import type { ToolParameters } from "@/llm/types";
import { ToolBase } from "@/tool";

export class ReadTool extends ToolBase {
  readonly name = "read";
  readonly description = "Read a UTF-8 text file and return its content.";
  readonly parameters: ToolParameters = {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "The file path to read. Relative paths are resolved from the current working directory.",
      },
    },
    required: ["path"],
  };

  override async execute(args: Record<string, unknown>): Promise<string> {
    const { path } = args;

    if (typeof path !== "string" || !path.trim()) {
      throw new Error("Argument 'path' must be a non-empty string.");
    }

    const filePath = resolve(path);
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      throw new Error(`File not found: ${filePath}`);
    }

    return await file.text();
  }
}
