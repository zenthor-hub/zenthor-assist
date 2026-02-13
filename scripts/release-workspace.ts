import { execSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

type BumpType = "major" | "minor" | "patch";
type WorkspaceName = "agent" | "backend" | "web";

interface WorkspaceConfig {
  packageJson: string;
  changelog: string;
  tagPrefix: string;
}

interface ParsedArgs {
  workspace: WorkspaceName | undefined;
  bump: BumpType | undefined;
  dryRun: boolean;
  ci: boolean;
}

interface ReleaseBuckets {
  Added: string[];
  Changed: string[];
  Fixed: string[];
  Security: string[];
}

const WORKSPACES: Record<WorkspaceName, WorkspaceConfig> = {
  agent: {
    packageJson: "apps/agent/package.json",
    changelog: "apps/agent/CHANGELOG.md",
    tagPrefix: "agent-v",
  },
  backend: {
    packageJson: "apps/backend/package.json",
    changelog: "apps/backend/CHANGELOG.md",
    tagPrefix: "backend-v",
  },
  web: {
    packageJson: "apps/web/package.json",
    changelog: "apps/web/CHANGELOG.md",
    tagPrefix: "web-v",
  },
};

const options = parseArgs(process.argv.slice(2));
if (!options.workspace || !options.bump) {
  printUsage();
  console.error("workspace and bump are required.");
  process.exit(1);
}

const config = WORKSPACES[options.workspace];
const packagePath = resolve(config.packageJson);
if (!existsSync(packagePath)) {
  throw new Error(`Workspace package.json not found: ${config.packageJson}`);
}

const changelogPath = resolve(config.changelog);
if (!existsSync(changelogPath)) {
  throw new Error(`Workspace changelog not found: ${config.changelog}`);
}

const workspacePkg = JSON.parse(readFileSync(packagePath, "utf8")) as { version?: string };
if (!workspacePkg.version) {
  throw new Error(`Workspace package version missing: ${config.packageJson}`);
}

const fromVersion = workspacePkg.version;
const toVersion = bumpVersion(fromVersion, options.bump);
const tag = `${config.tagPrefix}${toVersion}`;

const lastTag = getLatestTag(config.tagPrefix);
const commitRange = lastTag ? `${lastTag}..HEAD` : "HEAD";
const commitEntries = getReleaseCommits(commitRange, `apps/${options.workspace}`);
const buckets = bucketCommits(commitEntries);
const summary = makeSummary(toVersion, fromVersion, buckets);

if (!options.dryRun) {
  workspacePkg.version = toVersion;
  writeFileSync(packagePath, `${JSON.stringify(workspacePkg, null, 2)}\n`, "utf8");
  prependWorkspaceRelease(changelogPath, summary, buckets);
  updateMonorepoIndex(options.workspace, toVersion);

  if (options.ci) {
    const notesPath = writeReleaseNotesFile(options.workspace, toVersion, buckets);
    appendGhOutput("RELEASE_WORKSPACE", options.workspace);
    appendGhOutput("RELEASE_VERSION", toVersion);
    appendGhOutput("RELEASE_TAG", tag);
    appendGhOutput("RELEASE_NOTES_PATH", notesPath);
    appendGhOutput("RELEASE_COMMIT_COUNT", String(commitEntries.length));
  }
}

console.info(`workspace=${options.workspace}`);
console.info(`from=${fromVersion}`);
console.info(`to=${toVersion}`);
console.info(`tag=${tag}`);
console.info(`commits=${commitEntries.length}`);
console.info("release_summary:");
for (const line of summary) {
  console.info(line);
}

function parseArgs(argv: string[]): ParsedArgs {
  let workspace: WorkspaceName | undefined;
  let bump: BumpType | undefined;
  let dryRun = false;
  let ci = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if ((arg === "--workspace" || arg === "-w") && i + 1 < argv.length) {
      const value = argv[i + 1];
      if (value === "agent" || value === "backend" || value === "web") {
        workspace = value;
      } else {
        console.error(`Unknown workspace: ${value}`);
        printUsage();
        process.exit(1);
      }
      i += 1;
      continue;
    }

    if ((arg === "--bump" || arg === "-b") && i + 1 < argv.length) {
      const value = argv[i + 1];
      if (value === "major" || value === "minor" || value === "patch") {
        bump = value;
      } else {
        console.error(`Unknown bump type: ${value}`);
        printUsage();
        process.exit(1);
      }
      i += 1;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--ci") {
      ci = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    console.error(`Unknown argument: ${arg}`);
    printUsage();
    process.exit(1);
  }

  return { workspace, bump, dryRun, ci };
}

function printUsage(): void {
  console.info(`Usage:
  bun run scripts/release-workspace.ts --workspace <agent|backend|web> --bump <major|minor|patch> [--dry-run] [--ci]`);
}

function bumpVersion(version: string, bumpType: BumpType): string {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Invalid version '${version}', expected semver x.y.z`);
  }

  const [major, minor, patch] = parts;
  if (bumpType === "major") return `${major + 1}.0.0`;
  if (bumpType === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function getLatestTag(prefix: string): string {
  const output = execSync(`git tag --list "${prefix}*" --sort=-creatordate`, {
    encoding: "utf8",
  }) as string;
  const tags = output
    .split("\n")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return tags[0] ?? "";
}

function getReleaseCommits(range: string, pathFilter: string): string[] {
  const separator = "\u0000";
  const pretty = `%B${separator}`;
  const cmd =
    range === "HEAD"
      ? `git log --pretty=format:${JSON.stringify(pretty)} -- ${pathFilter}`
      : `git log ${range} --pretty=format:${JSON.stringify(pretty)} -- ${pathFilter}`;
  const raw = execSync(cmd, {
    encoding: "utf8",
    maxBuffer: 10_485_760,
  }) as string;

  return raw
    .split(separator)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function bucketCommits(commits: string[]): ReleaseBuckets {
  const buckets: ReleaseBuckets = {
    Added: [],
    Changed: [],
    Fixed: [],
    Security: [],
  };

  for (const raw of commits) {
    const lines = raw.split("\n").map((line) => line.trim());
    const subject = lines[0] ?? "";
    const body = lines.slice(1).join(" ");
    const match = /^(\w+)(\([^)]+\))?!?:\s+(.*)$/.exec(subject);
    const commitMessage = body.length > 0 ? body : subject;
    const normalized = commitMessage.toLowerCase();

    if (normalized.includes("breaking change") || normalized.includes("security")) {
      buckets.Security.push(`Security: ${subject || "Security-related update"}`);
      continue;
    }

    if (!match) {
      if (subject) {
        buckets.Changed.push(subject);
      }
      continue;
    }

    const type = match[1];
    const message = match[3]?.trim() ?? subject;
    if (type === "feat") buckets.Added.push(`Feature: ${message}`);
    else if (type === "fix") buckets.Fixed.push(`Fix: ${message}`);
    else if (type === "docs" || type === "refactor" || type === "perf")
      buckets.Changed.push(`Update: ${message}`);
    else buckets.Changed.push(subject);
  }

  if (buckets.Added.length === 0) buckets.Added.push("No new features in this release.");
  if (buckets.Fixed.length === 0) buckets.Fixed.push("No bug fixes in this release.");
  if (buckets.Security.length === 0) buckets.Security.push("No security updates in this release.");
  if (buckets.Changed.length === 0)
    buckets.Changed.push("No additional change items in this release.");

  return buckets;
}

function makeSummary(version: string, fromVersion: string, buckets: ReleaseBuckets): string[] {
  return [
    `## [${version}] - ${new Date().toISOString().slice(0, 10)}`,
    `- Previous version: ${fromVersion}`,
    `- New version: ${version}`,
    `- Added: ${buckets.Added.length} item(s)`,
    `- Changed: ${buckets.Changed.length} item(s)`,
    `- Fixed: ${buckets.Fixed.length} item(s)`,
    `- Security: ${buckets.Security.length} item(s)`,
  ];
}

function prependWorkspaceRelease(
  changelogPath: string,
  summary: string[],
  buckets: ReleaseBuckets,
): void {
  const existing = readFileSync(changelogPath, "utf8");
  const marker = "## [Unreleased]";
  const markerIdx = existing.indexOf(marker);
  if (markerIdx === -1) {
    throw new Error(`Unexpected changelog format: missing ${marker}`);
  }

  const summaryHeading = summary[0] ?? "## [Unreleased]";
  const releaseSection = `${summaryHeading}\n\n### Added\n${buckets.Added.map((item) => `- ${item}`).join("\n")}\n\n### Changed\n${buckets.Changed.map((item) => `- ${item}`).join("\n")}\n\n### Fixed\n${buckets.Fixed.map((item) => `- ${item}`).join("\n")}\n\n### Security\n${buckets.Security.map((item) => `- ${item}`).join("\n")}\n\n`;

  const insertIndex = existing.indexOf("\n", markerIdx + marker.length);
  if (insertIndex === -1) {
    throw new Error("Unexpected changelog format: cannot insert release section");
  }

  const before = existing.slice(0, insertIndex + 1);
  const after = existing.slice(insertIndex + 1);
  writeFileSync(changelogPath, `${before}${releaseSection}\n${after}`, "utf8");
}

function updateMonorepoIndex(workspace: WorkspaceName, version: string): void {
  const changelogPath = resolve("CHANGELOG.md");
  const existing = readFileSync(changelogPath, "utf8");
  const marker = "## Workspace release index";
  const markerIdx = existing.indexOf(marker);
  if (markerIdx === -1) {
    throw new Error("Root changelog missing workspace release index section");
  }

  const indexLine = `- \`${workspace}\` — latest release is \`${version}\``;
  const lines = existing.split("\n");
  const markerLineIdx = lines.findIndex((line) => line === marker);
  if (markerLineIdx === -1) {
    throw new Error("Root changelog missing workspace release index marker");
  }

  const existingLineIndex = lines.findIndex((line) =>
    line.startsWith(`- \`${workspace}\` — latest release is`),
  );
  if (existingLineIndex !== -1) {
    lines[existingLineIndex] = indexLine;
  } else {
    lines.splice(markerLineIdx + 1, 0, indexLine);
  }

  writeFileSync(changelogPath, `${lines.join("\n")}\n`, "utf8");
}

function writeReleaseNotesFile(
  workspace: WorkspaceName,
  version: string,
  buckets: ReleaseBuckets,
): string {
  const dir = resolve(".github/release-notes");
  mkdirSync(dir, { recursive: true });

  const notesFile = `.github/release-notes/${workspace}-v${version}.md`;
  const notesPath = resolve(notesFile);
  const lines = [
    `# ${workspace} v${version}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Added",
    ...buckets.Added.map((item) => `- ${item}`),
    "",
    "## Changed",
    ...buckets.Changed.map((item) => `- ${item}`),
    "",
    "## Fixed",
    ...buckets.Fixed.map((item) => `- ${item}`),
    "",
    "## Security",
    ...buckets.Security.map((item) => `- ${item}`),
  ];

  writeFileSync(notesPath, `${lines.join("\n")}\n`, "utf8");
  return notesFile;
}

function appendGhOutput(name: string, value: string): void {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) return;
  appendFileSync(outputFile, `${name}=${value}\n`, "utf8");
}
