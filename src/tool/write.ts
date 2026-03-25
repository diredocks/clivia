import { resolve } from "node:path";

import type { ToolParameters } from "@/llm/types";
import { ToolBase } from "@/tool";

export class WriteTool extends ToolBase {
  readonly name = "write";
  readonly description =
    "Write UTF-8 text content to a file and overwrite any existing content.";
  readonly parameters: ToolParameters = {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "The file path to write. Relative paths are resolved from the current working directory.",
      },
      content: {
        type: "string",
        description: "The UTF-8 text content to write into the file.",
      },
    },
    required: ["path", "content"],
  };

  override async execute(args: Record<string, unknown>): Promise<string> {
    const { path, content } = args;

    if (typeof path !== "string" || !path.trim()) {
      throw new Error("Argument 'path' must be a non-empty string.");
    }

    if (typeof content !== "string") {
      throw new Error("Argument 'content' must be a string.");
    }

    const filePath = resolve(path);
    await Bun.write(filePath, content);

    return `Wrote ${content.length} characters to ${filePath}`;
  }
}
