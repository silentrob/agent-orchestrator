import { readFileSync } from "node:fs";
import chalk from "chalk";
import type { Command } from "commander";
import { approvePlanArtifactInWorkspace, loadConfig } from "@composio/ao-core";
import { getSessionManager } from "../lib/create-session-manager.js";

async function readMessageInput(opts: { file?: string }, messageParts: string[]): Promise<string> {
  const inlineMessage = messageParts.join(" ");
  if (!opts.file && !inlineMessage) {
    console.error(chalk.red("No message provided"));
    process.exit(1);
  }

  if (!opts.file) {
    return inlineMessage;
  }

  try {
    return readFileSync(opts.file, "utf-8");
  } catch (err) {
    console.error(chalk.red(`Cannot read file: ${opts.file} (${err})`));
    process.exit(1);
  }
}

function planArtifactRelPathFromMetadata(metadata: Record<string, string>): string | undefined {
  const rel = metadata["planArtifactRelPath"]?.trim();
  return rel || undefined;
}

/**
 * `ao plan approve` / `ao plan send` — plan artifact approval and planner feedback (0007).
 */
export function registerPlan(program: Command): void {
  const plan = program
    .command("plan")
    .description("Plan artifact helpers for planner sessions (approve, send)");

  plan
    .command("approve")
    .description("Mark the plan artifact as human-approved (updates YAML frontmatter)")
    .argument("<session>", "Session id")
    .option("--approved-by <name>", "Optional approver name (stored in frontmatter)")
    .action(async (sessionId: string, opts: { approvedBy?: string }) => {
      try {
        const config = loadConfig();
        const sessionManager = await getSessionManager(config);
        const session = await sessionManager.get(sessionId);
        if (!session) {
          console.error(chalk.red(`Session '${sessionId}' not found`));
          process.exit(1);
        }
        if (!session.workspacePath) {
          console.error(chalk.red("Session has no workspace path"));
          process.exit(1);
        }
        const rel = planArtifactRelPathFromMetadata(session.metadata);
        const result = approvePlanArtifactInWorkspace(
          session.workspacePath,
          rel,
          opts.approvedBy !== undefined ? { approvedBy: opts.approvedBy } : undefined,
        );
        console.log(chalk.green(`Plan approved: ${result.path}`));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
        process.exit(1);
      }
    });

  plan
    .command("send")
    .description("Send a message to a session (same path as ao send when AO-managed)")
    .argument("<session>", "Session name")
    .argument("[message...]", "Message to send")
    .option("-f, --file <path>", "Send contents of a file instead")
    .action(async (session: string, messageParts: string[], opts: { file?: string }) => {
      const message = await readMessageInput(opts, messageParts);
      try {
        const config = loadConfig();
        const sessionManager = await getSessionManager(config);
        const existing = await sessionManager.get(session);
        if (!existing) {
          console.error(chalk.red(`Session '${session}' not found`));
          process.exit(1);
        }
        await sessionManager.send(session, message);
        console.log(chalk.green("Message sent and processing"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
        process.exit(1);
      }
    });
}
