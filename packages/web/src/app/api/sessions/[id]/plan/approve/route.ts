import { type NextRequest } from "next/server";
import { approvePlanArtifactInWorkspace } from "@composio/ao-core";
import { getServices } from "@/lib/services";
import { validateIdentifier } from "@/lib/validation";
import {
  getCorrelationId,
  jsonWithCorrelation,
  recordApiObservation,
  resolveProjectIdForSessionId,
} from "@/lib/observability";

function planArtifactRelPathFromMetadata(metadata: Record<string, string>): string | undefined {
  const rel = metadata["planArtifactRelPath"]?.trim();
  return rel || undefined;
}

function statusCodeForApproveError(message: string): number {
  if (message.includes("outside workspace") || message.includes("invalid")) return 400;
  if (message.includes("not found")) return 404;
  return 500;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const correlationId = getCorrelationId(request);
  const startedAt = Date.now();
  const { id } = await params;

  try {
    const idErr = validateIdentifier(id, "id");
    if (idErr) {
      return jsonWithCorrelation({ error: idErr }, { status: 400 }, correlationId);
    }

    const { config, sessionManager } = await getServices();
    const projectId = resolveProjectIdForSessionId(config, id);
    const session = await sessionManager.get(id);

    if (!session) {
      recordApiObservation({
        config,
        method: "POST",
        path: "/api/sessions/[id]/plan/approve",
        correlationId,
        startedAt,
        outcome: "failure",
        statusCode: 404,
        projectId,
        sessionId: id,
        reason: "Session not found",
      });
      return jsonWithCorrelation({ error: "Session not found" }, { status: 404 }, correlationId);
    }

    if (session.metadata["workerRole"] !== "planner") {
      recordApiObservation({
        config,
        method: "POST",
        path: "/api/sessions/[id]/plan/approve",
        correlationId,
        startedAt,
        outcome: "failure",
        statusCode: 403,
        projectId: session.projectId,
        sessionId: id,
        reason: "Not a planner session",
      });
      return jsonWithCorrelation(
        { error: "Only planner sessions can approve the plan" },
        { status: 403 },
        correlationId,
      );
    }

    if (!session.workspacePath) {
      recordApiObservation({
        config,
        method: "POST",
        path: "/api/sessions/[id]/plan/approve",
        correlationId,
        startedAt,
        outcome: "failure",
        statusCode: 400,
        projectId: session.projectId,
        sessionId: id,
        reason: "No workspace path",
      });
      return jsonWithCorrelation(
        { error: "Session has no workspace" },
        { status: 400 },
        correlationId,
      );
    }

    const rel = planArtifactRelPathFromMetadata(session.metadata);

    try {
      approvePlanArtifactInWorkspace(session.workspacePath, rel);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const statusCode = statusCodeForApproveError(errorMsg);
      recordApiObservation({
        config,
        method: "POST",
        path: "/api/sessions/[id]/plan/approve",
        correlationId,
        startedAt,
        outcome: "failure",
        statusCode,
        projectId: session.projectId,
        sessionId: id,
        reason: errorMsg,
      });
      if (statusCode >= 500) {
        console.error("Plan approve failed:", errorMsg);
      }
      return jsonWithCorrelation({ error: errorMsg }, { status: statusCode }, correlationId);
    }

    recordApiObservation({
      config,
      method: "POST",
      path: "/api/sessions/[id]/plan/approve",
      correlationId,
      startedAt,
      outcome: "success",
      statusCode: 200,
      projectId: session.projectId,
      sessionId: id,
    });

    return jsonWithCorrelation({ ok: true }, { status: 200 }, correlationId);
  } catch (error) {
    console.error("POST /api/sessions/[id]/plan/approve:", error);
    const { config } = await getServices().catch(() => ({ config: undefined }));
    if (config) {
      recordApiObservation({
        config,
        method: "POST",
        path: "/api/sessions/[id]/plan/approve",
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
