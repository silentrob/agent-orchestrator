import { describe, expect, it } from "vitest";
import {
  TRUST_GATE_METADATA_KEY_LIST,
  trustGateMetadataKey,
} from "../issue-lifecycle-gates.js";
import { TRUST_GATE_KINDS } from "../issue-lifecycle-types.js";

describe("issue-lifecycle-gates", () => {
  it("maps every TrustGateKind to a stable metadata key via trustGateMetadataKey", () => {
    for (const kind of TRUST_GATE_KINDS) {
      const key = trustGateMetadataKey(kind);
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
      expect(key.startsWith("trustGate")).toBe(true);
    }
  });

  it("has no duplicate metadata keys across gates", () => {
    const keys = TRUST_GATE_KINDS.map((k) => trustGateMetadataKey(k));
    expect(new Set(keys).size).toBe(TRUST_GATE_KINDS.length);
  });

  it("TRUST_GATE_METADATA_KEY_LIST matches per-kind keys in TRUST_GATE_KINDS order", () => {
    expect(TRUST_GATE_METADATA_KEY_LIST.length).toBe(TRUST_GATE_KINDS.length);
    for (let i = 0; i < TRUST_GATE_KINDS.length; i++) {
      expect(TRUST_GATE_METADATA_KEY_LIST[i]).toBe(trustGateMetadataKey(TRUST_GATE_KINDS[i]!));
    }
  });
});
