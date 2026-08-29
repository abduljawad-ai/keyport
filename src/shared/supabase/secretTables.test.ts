// SECURITY test: the browser layer must never query secret tables.
//
// user_vaults and api_keys have no grants/policies for anon/authenticated;
// this test guards against future regressions in the frontend query layer
// by scanning the source of every non-test file under src/.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
// src/shared/supabase -> src
const SRC_DIR = join(HERE, "..", "..");

const SECRET_TABLE_PATTERN = /from\s*\(\s*["'`](user_vaults|api_keys)["'`]\s*\)/i;
const SERVICE_ROLE_PATTERN = /service_role|SUPABASE_SERVICE_ROLE/i;

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      files.push(...collectSourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

describe("frontend secret-table access", () => {
  const files = collectSourceFiles(SRC_DIR);

  it("scanned a meaningful number of source files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("no source file queries user_vaults or api_keys via the browser client", () => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return SECRET_TABLE_PATTERN.test(source);
    });
    expect(offenders.map((f) => f.replace(SRC_DIR, "src"))).toEqual([]);
  });

  it("no source file references the service role key or value", () => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      // Comments may explain the security model; actual usage cannot.
      const code = source
        .split("\n")
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join("\n");
      return /apikey\s*[:=]/i.test(code) || SERVICE_ROLE_PATTERN.test(code);
    });
    expect(offenders.map((f) => f.replace(SRC_DIR, "src"))).toEqual([]);
  });
});
