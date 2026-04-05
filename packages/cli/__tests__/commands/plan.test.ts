import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";

const { mockConfigRef, mockSessionManager, mockApprove } = vi.hoisted(() => ({
  mockConfigRef: { current: null as Record<string, unknown> | null },
  mockSessionManager: {
    get: vi.fn(),
    send: vi.fn(),
  },
  mockApprove: vi.fn(),
}));

vi.mock("@composio/ao-core", () => ({
  loadConfig: () => {
    if (!mockConfigRef.current) {
      throw new Error("no config");
    }
    return mockConfigRef.current;
  },
  approvePlanArtifactInWorkspace: (
    workspacePath: string,
    relPath: string | undefined,
    opts?: { approvedBy?: string },
  ) => mockApprove(workspacePath, relPath, opts),
}));

vi.mock("../../src/lib/create-session-manager.js", () => ({
  getSessionManager: async () => mockSessionManager,
  getPluginRegistry: async () => ({ get: vi.fn(), list: vi.fn(), register: vi.fn() }),
}));

import { Command } from "commander";
import { registerPlan } from "../../src/commands/plan.js";

let program: Command;
let consoleSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: MockInstance;

beforeEach(() => {
  program = new Command();
  program.exitOverride();
  registerPlan(program);
  consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
    throw new Error(`process.exit(${code})`);
  });
  mockConfigRef.current = { projects: { p1: {} }, defaults: {}, configPath: "/x.yaml" };
  mockSessionManager.get.mockReset();
  mockSessionManager.send.mockReset();
  mockApprove.mockReset();
  mockApprove.mockReturnValue({ path: "/work/.ao/plan.md" });
});

afterEach(() => {
  consoleSpy.mockRestore();
  consoleErrorSpy.mockRestore();
  exitSpy.mockRestore();
});

describe("plan command", () => {
  describe("approve", () => {
    it("exits when session is not found", async () => {
      mockSessionManager.get.mockResolvedValue(null);

      await expect(
        program.parseAsync(["node", "test", "plan", "approve", "missing"]),
      ).rejects.toThrow("process.exit(1)");

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("not found"));
      expect(mockApprove).not.toHaveBeenCalled();
    });

    it("exits when session has no workspace", async () => {
      mockSessionManager.get.mockResolvedValue({
        id: "s1",
        workspacePath: null,
        metadata: {},
      });

      await expect(program.parseAsync(["node", "test", "plan", "approve", "s1"])).rejects.toThrow(
        "process.exit(1)",
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("no workspace"));
      expect(mockApprove).not.toHaveBeenCalled();
    });

    it("calls approvePlanArtifactInWorkspace and prints success", async () => {
      mockSessionManager.get.mockResolvedValue({
        id: "planner-1",
        workspacePath: "/work",
        metadata: { planArtifactRelPath: ".ao/plan.md" },
      });

      await program.parseAsync(["node", "test", "plan", "approve", "planner-1"]);

      expect(mockApprove).toHaveBeenCalledWith("/work", ".ao/plan.md", undefined);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Plan approved:"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("/work/.ao/plan.md"));
    });

    it("passes --approved-by to approve helper", async () => {
      mockSessionManager.get.mockResolvedValue({
        id: "p1",
        workspacePath: "/w",
        metadata: {},
      });

      await program.parseAsync(["node", "test", "plan", "approve", "p1", "--approved-by", "alice"]);

      expect(mockApprove).toHaveBeenCalledWith("/w", undefined, { approvedBy: "alice" });
    });
  });

  describe("send", () => {
    it("exits when session is not found", async () => {
      mockSessionManager.get.mockResolvedValue(null);

      await expect(
        program.parseAsync(["node", "test", "plan", "send", "missing", "hi"]),
      ).rejects.toThrow("process.exit(1)");

      expect(mockSessionManager.send).not.toHaveBeenCalled();
    });

    it("delegates to sessionManager.send", async () => {
      mockSessionManager.get.mockResolvedValue({
        id: "planner-1",
        workspacePath: "/work",
        metadata: {},
      });
      mockSessionManager.send.mockResolvedValue(undefined);

      await program.parseAsync(["node", "test", "plan", "send", "planner-1", "hello", "world"]);

      expect(mockSessionManager.send).toHaveBeenCalledWith("planner-1", "hello world");
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Message sent"));
    });

    it("sends file contents with -f", async () => {
      const tmp = join(tmpdir(), `ao-plan-send-${Date.now()}.txt`);
      writeFileSync(tmp, "from file\n", "utf-8");
      mockSessionManager.get.mockResolvedValue({
        id: "planner-1",
        workspacePath: "/work",
        metadata: {},
      });
      mockSessionManager.send.mockResolvedValue(undefined);

      try {
        await program.parseAsync(["node", "test", "plan", "send", "planner-1", "-f", tmp]);
      } finally {
        try {
          unlinkSync(tmp);
        } catch {
          // ignore
        }
      }

      expect(mockSessionManager.send).toHaveBeenCalledWith("planner-1", "from file\n");
    });
  });
});
