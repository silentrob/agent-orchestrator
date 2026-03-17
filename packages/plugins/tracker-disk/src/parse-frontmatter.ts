/**
 * Minimal YAML front-matter parser for issue markdown files.
 * Supports only the fields we need; no external dependency.
 */

export interface ParsedFrontMatter {
  title: string;
  state: "open" | "in_progress" | "closed" | "cancelled";
  labels: string[];
  assignee?: string;
  priority?: number;
}

const DEFAULT_STATE = "open";

/**
 * Parse front-matter and body from markdown content.
 * Expects format:
 *   ---
 *   key: value
 *   ---
 *   body
 */
export function parseIssueFile(content: string): {
  frontMatter: ParsedFrontMatter;
  body: string;
} {
  const delim = "---";
  const first = content.indexOf(delim);
  if (first === -1) {
    return {
      frontMatter: { title: "", state: DEFAULT_STATE, labels: [] },
      body: content.trim(),
    };
  }
  const afterFirst = content.slice(first + delim.length);
  const second = afterFirst.indexOf(delim);
  if (second === -1) {
    return {
      frontMatter: parseYamlLike(afterFirst.trim()),
      body: "",
    };
  }
  const yamlBlock = afterFirst.slice(0, second).trim();
  const body = afterFirst.slice(second + delim.length).trim();
  return {
    frontMatter: parseYamlLike(yamlBlock),
    body,
  };
}

/**
 * Very minimal YAML-like parsing for our known keys.
 * Handles: title, state, labels (array or comma-sep), assignee, priority.
 */
function parseYamlLike(block: string): ParsedFrontMatter {
  const result: ParsedFrontMatter = {
    title: "",
    state: DEFAULT_STATE,
    labels: [],
  };

  const stateValues = new Set(["open", "in_progress", "closed", "cancelled"]);

  for (const line of block.split(/\r?\n/)) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let raw = line.slice(colonIdx + 1).trim();
    if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1).replace(/\\"/g, '"');
    if (raw.startsWith("'") && raw.endsWith("'")) raw = raw.slice(1, -1).replace(/\\'/g, "'");

    switch (key) {
      case "title":
        result.title = raw;
        break;
      case "state":
        result.state = stateValues.has(raw) ? (raw as ParsedFrontMatter["state"]) : DEFAULT_STATE;
        break;
      case "labels": {
        if (raw.startsWith("[") && raw.endsWith("]")) {
          const inner = raw.slice(1, -1);
          result.labels = inner
            .split(",")
            .map((s) => s.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean);
        } else {
          result.labels = raw.split(",").map((s) => s.trim()).filter(Boolean);
        }
        break;
      }
      case "assignee":
        result.assignee = raw || undefined;
        break;
      case "priority": {
        const n = Number(raw);
        if (!Number.isNaN(n)) result.priority = n;
        break;
      }
      default:
        break;
    }
  }

  return result;
}

/**
 * Serialize front-matter + body back to markdown string.
 */
export function stringifyIssueFile(
  frontMatter: ParsedFrontMatter,
  body: string,
): string {
  const lines: string[] = ["---"];
  lines.push(`title: ${escapeYamlValue(frontMatter.title)}`);
  lines.push(`state: ${frontMatter.state}`);
  if (frontMatter.labels.length > 0) {
    lines.push(`labels: [${frontMatter.labels.map((l) => escapeYamlValue(l)).join(", ")}]`);
  }
  if (frontMatter.assignee) {
    lines.push(`assignee: ${escapeYamlValue(frontMatter.assignee)}`);
  }
  if (frontMatter.priority !== undefined) {
    lines.push(`priority: ${frontMatter.priority}`);
  }
  lines.push("---");
  lines.push("");
  lines.push(body || "");
  return lines.join("\n");
}

function escapeYamlValue(s: string): string {
  if (/^[\w\s-]+$/.test(s) && !s.includes(":")) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
