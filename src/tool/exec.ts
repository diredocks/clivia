import type { ToolParameters } from "@/llm/types";
import { ToolBase } from "@/tool";

// TODO: timeout, background, black and white list

export class ExecTool extends ToolBase {
  readonly name = "exec";
  readonly description =
    "Execute a shell command in the current working directory and return its result.";
  readonly parameters: ToolParameters = {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute.",
      },
    },
    required: ["command"],
  };

  override async execute(args: Record<string, unknown>): Promise<string> {
    const { command } = args;

    if (typeof command !== "string" || !command.trim()) {
      throw new Error("Argument 'command' must be a non-empty string.");
    }

    const proc = Bun.spawn(["sh", "-lc", command], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, _stderr, _exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    return stdout.trim() ?? "(empty)";
  }
}
