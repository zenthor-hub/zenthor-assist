import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { assertValidServiceKey, isValidServiceKey } from "./auth";

describe("isValidServiceKey", () => {
  const originalSecret = process.env["AGENT_SECRET"];
  const originalNodeEnv = process.env["NODE_ENV"];

  afterEach(() => {
    if (originalSecret !== undefined) {
      process.env["AGENT_SECRET"] = originalSecret;
    } else {
      delete process.env["AGENT_SECRET"];
    }

    if (originalNodeEnv !== undefined) {
      process.env["NODE_ENV"] = originalNodeEnv;
    } else {
      delete process.env["NODE_ENV"];
    }
  });

  it("allows any key in non-production when AGENT_SECRET is missing", () => {
    process.env["NODE_ENV"] = "development";
    delete process.env["AGENT_SECRET"];

    expect(isValidServiceKey()).toBe(true);
    expect(isValidServiceKey("anything")).toBe(true);
  });

  it("fails closed in production when AGENT_SECRET is missing", () => {
    process.env["NODE_ENV"] = "production";
    delete process.env["AGENT_SECRET"];

    expect(isValidServiceKey()).toBe(false);
    expect(isValidServiceKey("anything")).toBe(false);
  });

  it("requires an exact key match when AGENT_SECRET is set", () => {
    process.env["NODE_ENV"] = "production";
    process.env["AGENT_SECRET"] = "test-secret";

    expect(isValidServiceKey("test-secret")).toBe(true);
    expect(isValidServiceKey("wrong")).toBe(false);
    expect(isValidServiceKey(undefined)).toBe(false);
  });

  it("assertValidServiceKey throws when key is invalid", () => {
    process.env["NODE_ENV"] = "production";
    process.env["AGENT_SECRET"] = "test-secret";

    expect(() => assertValidServiceKey("wrong")).toThrowError("Forbidden");
  });
});

describe("auth wrapper boundary regression", () => {
  const convexDir = path.resolve(__dirname, "..");
  const skipDirs = new Set(["_generated", "auth", "lib", "clerk"]);
  const skipFiles = new Set(["http.ts", "crons.ts"]);

  const allowedRawPublic: Record<string, string> = {
    "healthCheck.ts:get": "Public health endpoint",
    "users.ts:getOrCreateFromClerk": "Bootstrap flow before user doc exists",
  };

  function listConvexFiles(rootDir: string): string[] {
    const rootFiles = fs
      .readdirSync(rootDir)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && !skipFiles.has(name));

    const nestedFiles: string[] = [];
    for (const entry of fs.readdirSync(rootDir)) {
      const fullPath = path.join(rootDir, entry);
      if (!fs.statSync(fullPath).isDirectory()) continue;
      if (skipDirs.has(entry)) continue;

      for (const name of fs.readdirSync(fullPath)) {
        if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
        if (skipFiles.has(name)) continue;
        nestedFiles.push(path.join(entry, name));
      }
    }

    return [...rootFiles, ...nestedFiles];
  }

  it("all public queries/mutations use wrapper builders or explicit allowlist", () => {
    const builderRegex =
      /export\s+const\s+(\w+)\s*=\s*(query|mutation|authQuery|authMutation|adminQuery|adminMutation|serviceQuery|serviceMutation)\s*\(/g;
    const violations: string[] = [];

    for (const relativeFile of listConvexFiles(convexDir)) {
      const filePath = path.join(convexDir, relativeFile);
      const source = fs.readFileSync(filePath, "utf-8");

      const matches = source.matchAll(builderRegex);
      for (const match of matches) {
        const functionName = match[1];
        const builder = match[2];
        if (!functionName || !builder) continue;

        const key = `${path.basename(relativeFile)}:${functionName}`;
        const isRawPublic = builder === "query" || builder === "mutation";
        if (!isRawPublic) continue;
        if (key in allowedRawPublic) continue;

        violations.push(`${key} (builder: ${builder})`);
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Public functions using raw query/mutation:\n${violations.map((v) => `  - ${v}`).join("\n")}`,
      );
    }
  });

  it("allowlist entries still exist", () => {
    const stale: string[] = [];

    for (const [key] of Object.entries(allowedRawPublic)) {
      const [fileName, functionName] = key.split(":");
      if (!fileName || !functionName) continue;

      const filePath = path.join(convexDir, fileName);
      if (!fs.existsSync(filePath)) {
        stale.push(`${key} — file not found`);
        continue;
      }

      const source = fs.readFileSync(filePath, "utf-8");
      const functionRegex = new RegExp(`export\\s+const\\s+${functionName}\\s*=`);
      if (!functionRegex.test(source)) {
        stale.push(`${key} — function not found`);
      }
    }

    if (stale.length > 0) {
      throw new Error(
        `Stale raw-function allowlist entries:\n${stale.map((line) => `  - ${line}`).join("\n")}`,
      );
    }
  });
});
