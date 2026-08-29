import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCRIPT = join(ROOT, "scripts", "sync-opencode-catalog.mjs");
const FIXTURE = join(ROOT, "scripts", "fixtures", "opencode-models.snapshot.txt");
const COMMITTED = join(ROOT, "src", "shared", "data", "opencodeCatalog.generated.ts");

function regenerate(outPath: string): string {
  execFileSync(process.execPath, [SCRIPT, "--source", "stdin", "--output", outPath], {
    input: readFileSync(FIXTURE, "utf8"),
    encoding: "utf8",
  });
  return readFileSync(outPath, "utf8");
}

describe("sync-opencode-catalog.mjs", () => {
  it("is deterministic: two runs on the same input produce identical bytes", () => {
    const dir = mkdtempSync(join(tmpdir(), "keyport-catalog-"));
    try {
      const a = regenerate(join(dir, "a.ts"));
      const b = regenerate(join(dir, "b.ts"));
      expect(a).toBe(b);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("regenerating from the committed snapshot reproduces the committed file", () => {
    const dir = mkdtempSync(join(tmpdir(), "keyport-catalog-"));
    try {
      const out = regenerate(join(dir, "out.ts"));
      expect(out).toBe(readFileSync(COMMITTED, "utf8"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("snapshot fixture exists for hermetic tests", () => {
    expect(existsSync(FIXTURE)).toBe(true);
  });
});