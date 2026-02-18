import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Tool } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

type LoadedCodeTools = {
  codeListFiles: Tool;
  codeReadFile: Tool;
  codeSearchFiles: Tool;
  codeWriteFile: Tool;
  codeApplyPatch: Tool;
};

function makeExecutor(tool: Tool) {
  return (input: unknown) => {
    const typed = tool as {
      execute?: (input: unknown) => Promise<unknown>;
    };
    if (!typed.execute) {
      throw new Error("Expected tool execute function to be defined.");
    }
    return typed.execute(input);
  };
}

async function setupCodeTools(workspaceRoot: string): Promise<LoadedCodeTools> {
  vi.resetModules();

  vi.doMock("@zenthor-assist/env/agent", () => ({
    env: {
      CONVEX_URL: "https://test.convex.cloud",
      CODE_WORKSPACE_ROOT: workspaceRoot,
      CODE_AWARENESS_ENABLED: "false",
    },
  }));

  const imported = await import("./code");
  return {
    codeListFiles: imported.codeListFiles,
    codeReadFile: imported.codeReadFile,
    codeSearchFiles: imported.codeSearchFiles,
    codeWriteFile: imported.codeWriteFile,
    codeApplyPatch: imported.codeApplyPatch,
  };
}

async function withCodeTools<T>(test: (tools: LoadedCodeTools, root: string) => Promise<T>) {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "agent-code-tools-"));

  try {
    const tools = await setupCodeTools(workspaceRoot);
    return await test(tools, workspaceRoot);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
    vi.resetModules();
    vi.restoreAllMocks();
  }
}

describe("code tools", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("lists files while ignoring hidden entries and applying limits", async () => {
    await withCodeTools(async (tools, workspaceRoot) => {
      await mkdir(join(workspaceRoot, "sub"));
      await mkdir(join(workspaceRoot, ".config"));
      await writeFile(join(workspaceRoot, "main.ts"), "console.log('ok');");
      await writeFile(join(workspaceRoot, ".env"), "TOKEN=secret\n");
      await writeFile(join(workspaceRoot, "sub", "agent.ts"), "export const yes = true;\n");

      const list = (await makeExecutor(tools.codeListFiles)({
        path: ".",
        recursive: true,
      })) as string;

      expect(list).toContain("main.ts");
      expect(list).toContain("sub/agent.ts");
      expect(list).not.toContain(".env");
      expect(list).not.toContain(".config");
    });
  });

  it("reads files with workspace-relative prefixes", async () => {
    await withCodeTools(async (tools, workspaceRoot) => {
      await writeFile(join(workspaceRoot, "README.md"), "# Hello\nWorld\n");

      const output = (await makeExecutor(tools.codeReadFile)({ path: "README.md" })) as string;

      expect(output).toContain("README.md");
      expect(output).toContain("# Hello");
      expect(output).toContain("World");
    });
  });

  it("searches plain text content for query matches", async () => {
    await withCodeTools(async (tools, workspaceRoot) => {
      await mkdir(join(workspaceRoot, "apps"));
      await writeFile(join(workspaceRoot, "apps", "agent.ts"), "const title = 'agent loop';\n");
      await writeFile(join(workspaceRoot, "notes.txt"), "No match here.\n");

      const output = (await makeExecutor(tools.codeSearchFiles)({
        query: "agent loop",
        path: "apps",
      })) as string;

      expect(output).toContain("apps/agent.ts:1");
      expect(output).toContain("agent loop");
    });
  });

  it("writes new file and blocks overwrite unless enabled", async () => {
    await withCodeTools(async (tools, workspaceRoot) => {
      const existing = join(workspaceRoot, "data.json");
      await writeFile(existing, "{}\n");

      await expect(
        makeExecutor(tools.codeWriteFile)({
          path: "data.json",
          content: '{"ok":true}',
          overwrite: false,
        }),
      ).rejects.toThrow("already exists");

      const result = (await makeExecutor(tools.codeWriteFile)({
        path: "data.json",
        content: '{"ok":true}\n',
        overwrite: true,
      })) as string;
      expect(result).toContain("Wrote");

      const output = (await makeExecutor(tools.codeReadFile)({ path: "data.json" })) as string;
      expect(output).toContain('{"ok":true}');
    });
  });

  it("applies OpenClaw-style patch operations", async () => {
    await withCodeTools(async (tools, workspaceRoot) => {
      await mkdir(join(workspaceRoot, "targets"));
      await writeFile(join(workspaceRoot, "targets", "update.ts"), "old\n");
      await writeFile(join(workspaceRoot, "targets", "remove.ts"), "remove-me\n");

      const patch = [
        "*** Begin Patch",
        "*** Update File: targets/update.ts",
        "updated\n",
        "*** Add File: targets/new.ts",
        "created\n",
        "*** Delete File: targets/remove.ts",
        "*** End Patch",
      ].join("\n");

      const patchResult = (await makeExecutor(tools.codeApplyPatch)({ patch })) as string;

      expect(patchResult).toContain("Applied 3 patch operation(s)");
      expect(await makeExecutor(tools.codeReadFile)({ path: "targets/update.ts" })).toContain(
        "updated",
      );
      expect(await makeExecutor(tools.codeReadFile)({ path: "targets/new.ts" })).toContain(
        "created",
      );

      await expect(makeExecutor(tools.codeReadFile)({ path: "targets/remove.ts" })).rejects.toThrow(
        "ENOENT",
      );
    });
  });

  it("allows delete patch operations without body content", async () => {
    await withCodeTools(async (tools, workspaceRoot) => {
      await mkdir(join(workspaceRoot, "targets"));
      await writeFile(join(workspaceRoot, "targets", "to-delete.ts"), "bye\n");

      const patch = [
        "*** Begin Patch",
        "*** Delete File: targets/to-delete.ts",
        "*** End Patch",
      ].join("\n");

      const patchResult = (await makeExecutor(tools.codeApplyPatch)({ patch })) as string;
      expect(patchResult).toContain("Applied 1 patch operation(s): deleted targets/to-delete.ts");

      await expect(
        makeExecutor(tools.codeReadFile)({ path: "targets/to-delete.ts" }),
      ).rejects.toThrow("ENOENT");
    });
  });

  it("rejects patches missing the begin marker", async () => {
    await withCodeTools(async (tools) => {
      await expect(
        makeExecutor(tools.codeApplyPatch)({
          patch: ["*** Update File: targets/update.ts", "updated\n", "*** End Patch"].join("\n"),
        }),
      ).rejects.toThrow("Patch must start with '*** Begin Patch'");
    });
  });

  it("rejects patches missing the end marker", async () => {
    await withCodeTools(async (tools) => {
      await expect(
        makeExecutor(tools.codeApplyPatch)({
          patch: ["*** Begin Patch", "*** Update File: targets/update.ts", "updated"].join("\n"),
        }),
      ).rejects.toThrow("Patch must end with '*** End Patch'");
    });
  });

  it("rejects file updates with no patch content", async () => {
    await withCodeTools(async (tools) => {
      await expect(
        makeExecutor(tools.codeApplyPatch)({
          patch: ["*** Begin Patch", "*** Update File: targets/empty.ts", "*** End Patch"].join(
            "\n",
          ),
        }),
      ).rejects.toThrow("Patch operation for targets/empty.ts has no content");
    });
  });
});
