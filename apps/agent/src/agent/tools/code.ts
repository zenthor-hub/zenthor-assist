import { readFile, readdir, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import { env } from "@zenthor-assist/env/agent";
import { tool } from "ai";
import { z } from "zod";

import { resolveWorkspacePath, resolveWorkspaceRoot, isInsideWorkspace } from "../code-context";

const DEFAULT_MAX_LIST_DEPTH = 5;
const DEFAULT_LIST_LIMIT = 200;
const DEFAULT_SEARCH_LIMIT = 40;
const DEFAULT_SEARCH_FILE_LIMIT = 300;
const MAX_TEXT_FILE_BYTES = 256_000;
const MAX_TOOL_FILE_BYTES = 1_024_000;
const MAX_PATCH_BYTES = 1_024_000;

const DEFAULT_LIST_IGNORE = new Set([
  ".git",
  ".next",
  ".turbo",
  ".auth",
  ".vscode",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "out",
]);

function ensureReadableText(content: Buffer, maxBytes: number): string {
  if (content.length > maxBytes) {
    throw new Error(`File exceeds ${maxBytes} byte limit`);
  }
  if (content.includes(0)) {
    throw new Error("Binary file detected");
  }
  return content.toString("utf-8");
}

function shouldIgnoreEntry(name: string, includeHidden: boolean): boolean {
  if (!includeHidden && name.startsWith(".")) return true;
  return DEFAULT_LIST_IGNORE.has(name);
}

async function readTextFile(path: string, maxBytes: number): Promise<string> {
  const buffer = await readFile(path);
  return ensureReadableText(buffer, maxBytes);
}

async function collectFilesRecursively(
  workspaceRoot: string,
  currentDir: string,
  depth: number,
  maxFiles: number,
  includeHidden: boolean,
  extensions: string[] | undefined,
  files: string[],
): Promise<void> {
  if (files.length >= maxFiles) return;

  const entries = await readdir(currentDir, { withFileTypes: true });
  const sorted = entries.toSorted((a, b) => a.name.localeCompare(b.name));

  for (const entry of sorted) {
    if (files.length >= maxFiles) break;
    if (shouldIgnoreEntry(entry.name, includeHidden)) continue;

    const entryPath = join(currentDir, entry.name);
    const normalized = resolve(entryPath);
    if (!isInsideWorkspace(workspaceRoot, normalized)) continue;

    if (entry.isSymbolicLink()) {
      continue;
    }
    if (entry.isDirectory()) {
      if (depth <= 0) continue;
      await collectFilesRecursively(
        workspaceRoot,
        entryPath,
        depth - 1,
        maxFiles,
        includeHidden,
        extensions,
        files,
      );
      continue;
    }

    if (!entry.isFile()) continue;

    if (extensions && extensions.length > 0) {
      const extension = entry.name.includes(".")
        ? entry.name.slice(entry.name.lastIndexOf(".") + 1).toLowerCase()
        : "";
      if (!extensions.includes(extension)) continue;
    }

    const relativePath = relative(workspaceRoot, normalized);
    files.push(relativePath);
  }
}

const listInputSchema = z.object({
  path: z.string().default("."),
  recursive: z.boolean().default(true),
  maxDepth: z.number().int().min(1).max(8).default(DEFAULT_MAX_LIST_DEPTH),
  maxFiles: z.number().int().min(1).max(1000).default(DEFAULT_LIST_LIMIT),
  extensions: z
    .array(z.string().trim().min(1))
    .optional()
    .transform((values) =>
      values ? values.map((value) => value.toLowerCase().replace(/^\./, "")) : undefined,
    ),
  includeHidden: z.boolean().default(false),
});

export const codeListFiles = tool({
  description:
    "List files under the configured workspace. Use this before reading or writing to locate target files.",
  inputSchema: listInputSchema,
  execute: async ({ path: rawPath, recursive, maxDepth, maxFiles, extensions, includeHidden }) => {
    const workspaceRoot = resolveWorkspaceRoot(env.CODE_WORKSPACE_ROOT);
    const basePath = resolveWorkspacePath(workspaceRoot, rawPath);
    const files: string[] = [];

    const stats = await stat(basePath);
    if (!stats.isDirectory()) {
      throw new Error("Path must be a directory");
    }

    await collectFilesRecursively(
      workspaceRoot,
      basePath,
      recursive ? maxDepth : 0,
      maxFiles,
      includeHidden,
      extensions,
      files,
    );

    if (files.length === 0) return `No files found under ${rawPath}`;
    return files.join("\n");
  },
});

export const codeReadFile = tool({
  description: "Read a text file from the workspace with strict size and binary-file protection.",
  inputSchema: z.object({
    path: z.string().trim().min(1),
    maxBytes: z.number().int().min(1).max(MAX_TOOL_FILE_BYTES).default(MAX_TEXT_FILE_BYTES),
  }),
  execute: async ({ path: rawPath, maxBytes }) => {
    const workspaceRoot = resolveWorkspaceRoot(env.CODE_WORKSPACE_ROOT);
    const filePath = resolveWorkspacePath(workspaceRoot, rawPath);

    const content = await readTextFile(filePath, maxBytes);
    const displayPath = relative(workspaceRoot, filePath);
    return `${displayPath}\n\n${content}`;
  },
});

const searchInputSchema = z.object({
  query: z.string().trim().min(1),
  path: z.string().default("."),
  maxFiles: z.number().int().min(1).max(1000).default(DEFAULT_SEARCH_FILE_LIMIT),
  maxMatches: z.number().int().min(1).max(250).default(DEFAULT_SEARCH_LIMIT),
  caseSensitive: z.boolean().default(false),
  extensions: z
    .array(z.string().trim().min(1))
    .optional()
    .transform((values) =>
      values ? values.map((value) => value.toLowerCase().replace(/^\./, "")) : undefined,
    ),
  includeHidden: z.boolean().default(false),
});

export const codeSearchFiles = tool({
  description:
    "Search plain-text files in the workspace for a substring and return matching line snippets.",
  inputSchema: searchInputSchema,
  execute: async ({
    query,
    path: rawPath,
    maxFiles,
    maxMatches,
    caseSensitive,
    extensions,
    includeHidden,
  }) => {
    const workspaceRoot = resolveWorkspaceRoot(env.CODE_WORKSPACE_ROOT);
    const basePath = resolveWorkspacePath(workspaceRoot, rawPath);
    const fileList: string[] = [];

    const stats = await stat(basePath);
    if (!stats.isDirectory()) {
      throw new Error("Path must be a directory");
    }

    await collectFilesRecursively(
      workspaceRoot,
      basePath,
      DEFAULT_MAX_LIST_DEPTH,
      maxFiles,
      includeHidden,
      extensions,
      fileList,
    );

    const matches: string[] = [];

    for (const relativePath of fileList) {
      if (matches.length >= maxMatches) break;
      const filePath = resolve(workspaceRoot, relativePath);
      let content: string;
      try {
        content = await readTextFile(filePath, MAX_TEXT_FILE_BYTES);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("File exceeds")) {
          continue;
        }
        continue;
      }

      const lines = content.split("\n");
      const lineNeedle = caseSensitive ? query : query.toLowerCase();
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        if (
          lineNeedle &&
          (caseSensitive ? line.includes(lineNeedle) : line.toLowerCase().includes(lineNeedle))
        ) {
          matches.push(`${relativePath}:${index + 1}: ${line.trim()}`);
          if (matches.length >= maxMatches) break;
        }
      }
    }

    if (matches.length === 0) return `No matches found for '${query}' under ${rawPath}.`;
    return matches.join("\n");
  },
});

const writeInputSchema = z.object({
  path: z.string().trim().min(1),
  content: z.string(),
  overwrite: z.boolean().default(false),
  createDirectories: z.boolean().default(true),
  maxBytes: z.number().int().min(1).max(MAX_TOOL_FILE_BYTES).default(MAX_TEXT_FILE_BYTES),
});

export const codeWriteFile = tool({
  description:
    "Overwrite or create a text file in the workspace. Requires explicit write permission context.",
  inputSchema: writeInputSchema,
  execute: async ({ path: rawPath, content, overwrite, createDirectories, maxBytes }) => {
    const workspaceRoot = resolveWorkspaceRoot(env.CODE_WORKSPACE_ROOT);
    const filePath = resolveWorkspacePath(workspaceRoot, rawPath);

    if (content.length > maxBytes) {
      throw new Error(`Content exceeds ${maxBytes} character limit`);
    }

    if (!overwrite) {
      await stat(filePath).then(
        () => {
          throw new Error(`File already exists: ${rawPath}`);
        },
        () => undefined,
      );
    }

    if (createDirectories) {
      await mkdir(dirname(filePath), { recursive: true });
    }
    await writeFile(filePath, content, "utf-8");
    const relativePath = relative(workspaceRoot, filePath);
    return `Wrote ${content.length} characters to ${relativePath}`;
  },
});

const patchFileOperationSchema = z.object({
  patch: z.string().trim().min(20),
});

interface ParsedPatchOperation {
  type: "add" | "update" | "delete";
  path: string;
  body: string;
}

function parsePatchOperations(rawPatch: string): ParsedPatchOperation[] {
  const lines = rawPatch.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "*** Begin Patch") {
    throw new Error("Patch must start with '*** Begin Patch'");
  }

  const operations: ParsedPatchOperation[] = [];
  let sawEndPatch = false;
  let currentType: ParsedPatchOperation["type"] | undefined;
  let currentPath: string | undefined;
  const bodyLines: string[] = [];

  function flushCurrentOperation() {
    if (!currentType || !currentPath) return;
    operations.push({
      type: currentType,
      path: currentPath,
      body: bodyLines.join("\n"),
    });
    currentType = undefined;
    currentPath = undefined;
    bodyLines.length = 0;
  }

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line === "*** End Patch") {
      sawEndPatch = true;
      flushCurrentOperation();
      break;
    }

    const addMatch = line.match(/^\*\*\* Add File:\s*(.+)$/)?.[1];
    if (addMatch) {
      flushCurrentOperation();
      currentType = "add";
      currentPath = addMatch.trim();
      continue;
    }

    const updateMatch = line.match(/^\*\*\* Update File:\s*(.+)$/)?.[1];
    if (updateMatch) {
      flushCurrentOperation();
      currentType = "update";
      currentPath = updateMatch.trim();
      continue;
    }

    const deleteMatch = line.match(/^\*\*\* Delete File:\s*(.+)$/)?.[1];
    if (deleteMatch) {
      flushCurrentOperation();
      currentType = "delete";
      currentPath = deleteMatch.trim();
      continue;
    }

    if (currentType === "delete" || !currentType || !currentPath) {
      continue;
    }

    bodyLines.push(line);
  }

  if (!sawEndPatch) {
    throw new Error("Patch must end with '*** End Patch'");
  }

  flushCurrentOperation();

  if (!operations.length) {
    throw new Error("No valid patch operations found");
  }
  for (const operation of operations) {
    if (operation.path.length === 0) {
      throw new Error("Patch contains an empty path");
    }
  }

  return operations;
}

export const codeApplyPatch = tool({
  description:
    "Apply an OpenClaw-style patch to workspace files. Supports Add/Update/Delete file blocks.",
  inputSchema: patchFileOperationSchema,
  execute: async ({ patch }) => {
    if (patch.length > MAX_PATCH_BYTES) {
      throw new Error(`Patch exceeds ${MAX_PATCH_BYTES} character limit`);
    }

    const operations = parsePatchOperations(patch);
    const workspaceRoot = resolveWorkspaceRoot(env.CODE_WORKSPACE_ROOT);
    const summary: string[] = [];

    for (const operation of operations) {
      const filePath = resolveWorkspacePath(workspaceRoot, operation.path);
      if (operation.type === "delete") {
        await rm(filePath, { force: true });
        summary.push(`deleted ${relative(workspaceRoot, filePath)}`);
        continue;
      }

      const safeContent = operation.body;
      if (safeContent.length === 0) {
        throw new Error(`Patch operation for ${operation.path} has no content`);
      }

      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, safeContent, "utf-8");
      summary.push(`${operation.type}d ${relative(workspaceRoot, filePath)}`);
    }

    return `Applied ${operations.length} patch operation(s): ${summary.join(", ")}`;
  },
});
