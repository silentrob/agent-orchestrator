import { type NextRequest } from "next/server";
import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { getServices } from "@/lib/services";
import { getCorrelationId, jsonWithCorrelation, recordApiObservation } from "@/lib/observability";
import { parsePlanMarkdown, resolvePlanArtifactPath } from "@/lib/plan-artifact";

const MAX_PLAN_BYTES = 256 * 1024;

function readUtf8FileCapped(absolutePath: string, maxBytes: number): string {
  const fd = openSync(absolutePath, "r");
  try {
    const size = statSync(absolutePath).size;
    const len = Math.min(size, maxBytes);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, 0);
    return buf.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const correlationId = getCorrelationId(_request);
  const startedAt = Date.now();
  const { id } = await params;

  try {
    const { config, sessionManager } = await getServices();
    const session = await sessionManager.get(id);

    if (!session) {
      recordApiObservation({
        config,
        method: "GET",
        path: "/api/sessions/[id]/plan",
        correlationId,
        startedAt,
        outcome: "failure",
        statusCode: 404,
        sessionId: id,
        reason: "Session not found",
      });
      return jsonWithCorrelation({ error: "Session not found" }, { status: 404 }, correlationId);
    }

    if (!session.workspacePath) {
      recordApiObservation({
        config,
        method: "GET",
        path: "/api/sessions/[id]/plan",
        correlationId,
        startedAt,
        outcome: "failure",
        statusCode: 404,
        projectId: session.projectId,
        sessionId: id,
        reason: "No workspace path",
      });
      return jsonWithCorrelation({ error: "No workspace path" }, { status: 404 }, correlationId);
    }

    const rel = session.metadata["planArtifactRelPath"];
    const planPath = resolvePlanArtifactPath(session.workspacePath, rel);
    if (!planPath) {
      recordApiObservation({
        config,
        method: "GET",
        path: "/api/sessions/[id]/plan",
        correlationId,
        startedAt,
        outcome: "failure",
        statusCode: 404,
        projectId: session.projectId,
        sessionId: id,
        reason: "Invalid plan path",
      });
      return jsonWithCorrelation({ error: "Invalid plan path" }, { status: 404 }, correlationId);
    }

    if (!existsSync(planPath)) {
      recordApiObservation({
        config,
        method: "GET",
        path: "/api/sessions/[id]/plan",
        correlationId,
        startedAt,
        outcome: "failure",
        statusCode: 404,
        projectId: session.projectId,
        sessionId: id,
        reason: "Plan file not found",
      });
      return jsonWithCorrelation({ error: "Plan file not found" }, { status: 404 }, correlationId);
    }

    let raw: string;
    try {
      raw = readUtf8FileCapped(planPath, MAX_PLAN_BYTES);
    } catch {
      recordApiObservation({
        config,
        method: "GET",
        path: "/api/sessions/[id]/plan",
        correlationId,
        startedAt,
        outcome: "failure",
        statusCode: 500,
        projectId: session.projectId,
        sessionId: id,
        reason: "Failed to read plan file",
      });
      return jsonWithCorrelation(
        { error: "Failed to read plan file" },
        { status: 500 },
        correlationId,
      );
    }

    const { frontmatter, body } = parsePlanMarkdown(raw);

    recordApiObservation({
      config,
      method: "GET",
      path: "/api/sessions/[id]/plan",
      correlationId,
      startedAt,
      outcome: "success",
      statusCode: 200,
      projectId: session.projectId,
      sessionId: id,
    });

    return jsonWithCorrelation(
      {
        path: planPath,
        body,
        frontmatter,
        issueId: session.issueId,
      },
      { status: 200 },
      correlationId,
    );
  } catch (error) {
    const { config } = await getServices().catch(() => ({ config: undefined }));
    if (config) {
      recordApiObservation({
        config,
        method: "GET",
        path: "/api/sessions/[id]/plan",
        correlationId,
        startedAt,
        outcome: "failure",
        statusCode: 500,
        sessionId: id,
        reason: error instanceof Error ? error.message : "Internal server error",
      });
    }
    return jsonWithCorrelation({ error: "Internal server error" }, { status: 500 }, correlationId);
  }
}
