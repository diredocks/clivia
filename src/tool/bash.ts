import type { ToolParameters } from "@/llm/types";
import { ToolBase } from "@/tool";

export class BashTool extends ToolBase {
  readonly name = "bash";
  readonly description =
    "Execute a shell command in a container and return its result.";
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
  private readonly commandPrefix: string[];

  constructor(containerName: string, userId: string) {
    super();
    this.commandPrefix = [
      "incus",
      "exec",
      containerName,
      "--user",
      userId,
      "--cwd",
      "/tmp",
      "--env",
      "HOME=/home/yolo",
      "--",
      "bash",
      "-lc",
    ];
  }

  override async execute(args: Record<string, unknown>): Promise<string> {
    const { command } = args;

    if (typeof command !== "string" || !command.trim()) {
      throw new Error("Argument 'command' must be a non-empty string.");
    }

    const proc = Bun.spawn(
      [...this.commandPrefix, command],
      {
        cwd: process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const [stdout, _stderr, _exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    return stdout.trim() ?? "(empty)";
  }
}
