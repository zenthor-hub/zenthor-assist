import { readFile } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";

import { env } from "@zenthor-assist/env/agent";

export const CODE_READ_TOOL_NAMES = [
  "code_list_files",
  "code_read_file",
  "code_search_files",
] as const;
export const CODE_WRITE_TOOL_NAMES = ["code_write_file", "code_apply_patch"] as const;
export const CODE_TOOL_NAMES = [...CODE_READ_TOOL_NAMES, ...CODE_WRITE_TOOL_NAMES] as const;

export const DEFAULT_CODE_CONTEXT_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "CHANGELOG.md",
  "package.json",
  "OPENCLAW-COMPARISON.md",
] as const;

const DEFAULT_CODE_CONTEXT_MAX_BYTES = 96_000;

function splitCommaList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function isCodeAwarenessEnabled(): boolean {
  return env.CODE_AWARENESS_ENABLED === true;
}

export function isCodeMaintenanceEnabled(): boolean {
  return isCodeAwarenessEnabled() && env.CODE_MAINTENANCE_MODE === true;
}

export function resolveWorkspaceRoot(override?: string): string {
  return resolve(override ?? env.CODE_WORKSPACE_ROOT ?? process.cwd());
}

export function getCodeContextFiles(raw?: string): string[] {
  const configured = splitCommaList(raw);
  return configured.length > 0 ? configured : [...DEFAULT_CODE_CONTEXT_FILES];
}

export function getCodeContextMaxBytes(): number {
  return env.CODE_CONTEXT_MAX_BYTES ?? DEFAULT_CODE_CONTEXT_MAX_BYTES;
}

export function getCodeToolNames(): string[] {
  return isCodeMaintenanceEnabled() ? [...CODE_TOOL_NAMES] : [...CODE_READ_TOOL_NAMES];
}

export function isInsideWorkspace(root: string, target: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedTarget = resolve(target);
  return (
    normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${sep}`)
  );
}

export function resolveWorkspacePath(root: string, relativePath: string): string {
  const normalizedTarget = resolve(root, relativePath);
  if (!isInsideWorkspace(root, normalizedTarget)) {
    throw new Error(`Path '${relativePath}' is outside the workspace root.`);
  }
  return normalizedTarget;
}

export async function loadCodeWorkspaceContext(input?: {
  workspaceRoot?: string;
  contextFiles?: string[];
  maxBytes?: number;
}): Promise<string> {
  const workspaceRoot = resolveWorkspaceRoot(input?.workspaceRoot);
  const contextFiles =
    input?.contextFiles?.length && input.contextFiles.length > 0
      ? input.contextFiles
      : getCodeContextFiles(env.CODE_CONTEXT_FILES);
  const maxBytes = input?.maxBytes ?? getCodeContextMaxBytes();

  let remainingBudget = maxBytes;
  const sections: string[] = [];

  for (const fileName of contextFiles) {
    if (remainingBudget <= 0) break;
    const filePath = resolveWorkspacePath(workspaceRoot, fileName);
    const relativeName = relative(workspaceRoot, filePath);

    try {
      const rawContent = await readFile(filePath, "utf-8");
      const truncated = rawContent.length > remainingBudget;
      const content = truncated
        ? rawContent.slice(0, Math.max(remainingBudget - 1, 0))
        : rawContent;

      if (!content.length) continue;

      const rendered = truncated
        ? `${content}\n\n[truncated to avoid exceeding context budget]`
        : content;
      sections.push(`### ${relativeName}\n${rendered}`);
      remainingBudget -= rendered.length;
    } catch {
      continue;
    }
  }

  if (sections.length === 0) return "";
  return `Workspace root: ${workspaceRoot}\n\n${sections.join("\n\n")}`;
}
