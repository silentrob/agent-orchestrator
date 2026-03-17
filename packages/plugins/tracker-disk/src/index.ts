/**
 * tracker-disk plugin — Disk-based issue tracker (markdown + front-matter).
 *
 * Issues are stored as one markdown file per issue; state is read/written
 * by polling the filesystem (no external API).
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  PluginModule,
  Tracker,
  Issue,
  IssueFilters,
  IssueUpdate,
  CreateIssueInput,
  ProjectConfig,
} from "@composio/ao-core";
import { parseIssueFile, stringifyIssueFile, type ParsedFrontMatter } from "./parse-frontmatter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_ISSUES_DIR = ".ao/issues";

function getIssuesDir(project: ProjectConfig): string {
  const dir = (project.tracker as { issuesDir?: string } | undefined)?.issuesDir;
  return dir ?? DEFAULT_ISSUES_DIR;
}

function issuesPath(project: ProjectConfig): string {
  return join(project.path, getIssuesDir(project));
}

function issueFilePath(identifier: string, project: ProjectConfig): string {
  const safe = identifier.replace(/\.\./g, "").replace(/[/\\]/g, "");
  return join(issuesPath(project), `${safe}.md`);
}

function mapState(state: string): Issue["state"] {
  const s = state.toLowerCase();
  if (
    s === "open" ||
    s === "in_progress" ||
    s === "closed" ||
    s === "cancelled"
  ) {
    return s as Issue["state"];
  }
  return "open";
}

function toIssue(
  id: string,
  project: ProjectConfig,
  frontMatter: ParsedFrontMatter,
  body: string,
): Issue {
  const filePath = issueFilePath(id, project);
  return {
    id,
    title: frontMatter.title,
    description: body,
    url: `file://${filePath}`,
    state: mapState(frontMatter.state),
    labels: frontMatter.labels ?? [],
    assignee: frontMatter.assignee,
    priority: frontMatter.priority,
  };
}

/** Sanitize id for use in branch names (no spaces, no path chars). */
function branchSafeId(id: string): string {
  return id.replace(/[/\\\s]+/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "issue";
}

// ---------------------------------------------------------------------------
// Tracker implementation
// ---------------------------------------------------------------------------

function createDiskTracker(): Tracker {
  return {
    name: "disk",

    async getIssue(identifier: string, project: ProjectConfig): Promise<Issue> {
      const path = issueFilePath(identifier, project);
      const raw = await readFile(path, "utf-8");
      const { frontMatter, body } = parseIssueFile(raw);
      return toIssue(identifier, project, frontMatter, body);
    },

    async isCompleted(identifier: string, project: ProjectConfig): Promise<boolean> {
      const issue = await this.getIssue(identifier, project);
      return issue.state === "closed" || issue.state === "cancelled";
    },

    issueUrl(identifier: string, project: ProjectConfig): string {
      return `file://${issueFilePath(identifier, project)}`;
    },

    issueLabel(url: string, _project: ProjectConfig): string {
      const match = url.match(/\/([^/]+)\.md$/);
      return match ? match[1] : url;
    },

    branchName(identifier: string, _project: ProjectConfig): string {
      return `feat/issue-${branchSafeId(identifier)}`;
    },

    async generatePrompt(identifier: string, project: ProjectConfig): Promise<string> {
      const issue = await this.getIssue(identifier, project);
      const lines = [
        `You are working on issue "${issue.id}": ${issue.title}`,
        `Issue file: ${issue.url}`,
        "",
      ];
      if (issue.labels.length > 0) {
        lines.push(`Labels: ${issue.labels.join(", ")}`);
      }
      if (issue.description) {
        lines.push("## Description", "", issue.description);
      }
      lines.push(
        "",
        "Please implement the changes described in this issue. When done, commit and push your changes.",
      );
      return lines.join("\n");
    },

    async listIssues(
      filters: IssueFilters,
      project: ProjectConfig,
    ): Promise<Issue[]> {
      const dir = issuesPath(project);
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return [];
        }
        throw err;
      }

      const limit = filters.limit ?? 30;
      const mdFiles = entries
        .filter((e) => e.endsWith(".md"))
        .map((e) => e.slice(0, -3));

      const issues: Issue[] = [];
      for (const id of mdFiles) {
        if (issues.length >= limit) break;
        try {
          const issue = await this.getIssue(id, project);
          if (filters.state === "closed" && issue.state !== "closed" && issue.state !== "cancelled")
            continue;
          if (filters.state === "open" && issue.state !== "open" && issue.state !== "in_progress")
            continue;
          if (filters.labels?.length && !filters.labels.every((l) => issue.labels.includes(l)))
            continue;
          if (filters.assignee && issue.assignee !== filters.assignee) continue;
          issues.push(issue);
        } catch {
          // Skip unreadable files
        }
      }
      return issues;
    },

    async updateIssue(
      identifier: string,
      update: IssueUpdate,
      project: ProjectConfig,
    ): Promise<void> {
      const path = issueFilePath(identifier, project);
      const raw = await readFile(path, "utf-8");
      const { frontMatter, body } = parseIssueFile(raw);

      if (update.state !== undefined) {
        frontMatter.state = mapState(update.state) as ParsedFrontMatter["state"];
      }
      if (update.labels !== undefined) {
        frontMatter.labels = update.labels;
      }
      if (update.removeLabels?.length) {
        frontMatter.labels = frontMatter.labels.filter(
          (l) => !update.removeLabels!.includes(l),
        );
      }
      if (update.assignee !== undefined) {
        frontMatter.assignee = update.assignee;
      }
      if (update.comment) {
        const newBody = body + "\n\n---\n\n" + update.comment;
        await writeFile(path, stringifyIssueFile(frontMatter, newBody), "utf-8");
        return;
      }

      await writeFile(path, stringifyIssueFile(frontMatter, body), "utf-8");
    },

    async createIssue(
      input: CreateIssueInput,
      project: ProjectConfig,
    ): Promise<Issue> {
      const dir = issuesPath(project);
      await mkdir(dir, { recursive: true });

      let id: string;
      try {
        const entries = await readdir(dir);
        const nums = entries
          .filter((e) => /^\d+\.md$/.test(e))
          .map((e) => parseInt(e.slice(0, -3), 10))
          .filter((n) => !Number.isNaN(n));
        const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
        id = String(next);
      } catch {
        id = "1";
      }

      const frontMatter: ParsedFrontMatter = {
        title: input.title,
        state: "open",
        labels: input.labels ?? [],
        assignee: input.assignee,
        priority: input.priority,
      };
      const body = input.description ?? "";
      const path = issueFilePath(id, project);
      await writeFile(path, stringifyIssueFile(frontMatter, body), "utf-8");
      return this.getIssue(id, project);
    },
  };
}

// ---------------------------------------------------------------------------
// Plugin module export
// ---------------------------------------------------------------------------

export const manifest = {
  name: "disk",
  slot: "tracker" as const,
  description: "Tracker plugin: disk-based issues (markdown + front-matter)",
  version: "0.1.0",
};

export function create(): Tracker {
  return createDiskTracker();
}

export default { manifest, create } satisfies PluginModule<Tracker>;
