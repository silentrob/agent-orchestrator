import { type NextRequest } from "next/server";
import type { WorkerRole } from "@composio/ao-core";
import { validateIdentifier, validateConfiguredProject } from "@/lib/validation";
import { getServices } from "@/lib/services";
import { sessionToDashboard } from "@/lib/serialize";
import { getCorrelationId, jsonWithCorrelation, recordApiObservation } from "@/lib/observability";

const WORKER_ROLES: readonly WorkerRole[] = ["planner", "executor", "validator", "reproducer"];
const MAX_SPAWN_PROMPT_CHARS = 200_000;

/** POST /api/spawn — Spawn a new session */
export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request);
  const startedAt = Date.now();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return jsonWithCorrelation({ error: "Invalid JSON body" }, { status: 400 }, correlationId);
  }

  const projectErr = validateIdentifier(body.projectId, "projectId");
  if (projectErr) {
    return jsonWithCorrelation({ error: projectErr }, { status: 400 }, correlationId);
  }

  if (body.issueId !== undefined && body.issueId !== null) {
    const issueErr = validateIdentifier(body.issueId, "issueId");
    if (issueErr) {
      return jsonWithCorrelation({ error: issueErr }, { status: 400 }, correlationId);
    }
  }

  let prompt: string | undefined;
  if (body.prompt !== undefined && body.prompt !== null) {
    if (typeof body.prompt !== "string") {
      return jsonWithCorrelation(
        { error: "prompt must be a string" },
        { status: 400 },
        correlationId,
      );
    }
    if (body.prompt.length > MAX_SPAWN_PROMPT_CHARS) {
      return jsonWithCorrelation(
        { error: `prompt must be at most ${MAX_SPAWN_PROMPT_CHARS} characters` },
        { status: 400 },
        correlationId,
      );
    }
    prompt = body.prompt;
  }

  let workerRole: WorkerRole | undefined;
  if (body.workerRole !== undefined && body.workerRole !== null) {
    if (typeof body.workerRole !== "string") {
      return jsonWithCorrelation(
        { error: "workerRole must be a string" },
        { status: 400 },
        correlationId,
      );
    }
    const trimmed = body.workerRole.trim();
    if (trimmed !== "" && !WORKER_ROLES.includes(trimmed as WorkerRole)) {
      return jsonWithCorrelation(
        { error: `Invalid workerRole. Use one of: ${WORKER_ROLES.join(", ")}` },
        { status: 400 },
        correlationId,
      );
    }
    if (trimmed !== "") {
      workerRole = trimmed as WorkerRole;
    }
  }

  try {
    const { config, sessionManager } = await getServices();
    const projectId = body.projectId as string;
    const projectErr = validateConfiguredProject(config.projects, projectId);
    if (projectErr) {
      recordApiObservation({
        config,
        method: "POST",
        path: "/api/spawn",
        correlationId,
        startedAt,
        outcome: "failure",
        statusCode: 404,
        projectId,
        reason: projectErr,
        data: { issueId: body.issueId },
      });
      return jsonWithCorrelation({ error: projectErr }, { status: 404 }, correlationId);
    }

    const session = await sessionManager.spawn({
      projectId,
      issueId: (body.issueId as string) ?? undefined,
      ...(prompt !== undefined ? { prompt } : {}),
      ...(workerRole !== undefined ? { workerRole } : {}),
    });

    recordApiObservation({
      config,
      method: "POST",
      path: "/api/spawn",
      correlationId,
      startedAt,
      outcome: "success",
      statusCode: 201,
      projectId: session.projectId,
      sessionId: session.id,
      data: { issueId: session.issueId },
    });

    return jsonWithCorrelation(
      { session: sessionToDashboard(session) },
      { status: 201 },
      correlationId,
    );
  } catch (err) {
    const { config } = await getServices().catch(() => ({ config: undefined }));
    if (config) {
      recordApiObservation({
        config,
        method: "POST",
        path: "/api/spawn",
        correlationId,
        startedAt,
        outcome: "failure",
        statusCode: 500,
        projectId: typeof body.projectId === "string" ? body.projectId : undefined,
        reason: err instanceof Error ? err.message : "Failed to spawn session",
        data: { issueId: body.issueId },
      });
    }
    return jsonWithCorrelation(
      { error: err instanceof Error ? err.message : "Failed to spawn session" },
      { status: 500 },
      correlationId,
    );
  }
}
