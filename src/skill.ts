import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";

export const PROJECT_SKILLS_DIR = ".clivia/skills";
export const LEGACY_SKILLS_DIR = ".clivia/skill";
export const SKILL_FILE_NAME = "SKILL.md";
export const SKILL_SOURCES = ["project", "global"] as const;

export type SkillSource = (typeof SKILL_SOURCES)[number];

export interface SkillMetadata {
  name: string;
  description: string;
  location: string;
  source: SkillSource;
  metadata: Record<string, string>;
  body(): string;
}

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FRONT_MATTER_PATTERN = /^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/;

export function discoverSkills(workspacePath = process.cwd()): SkillMetadata[] {
  const skillsByName = new Map<string, SkillMetadata>();

  for (const [root, source] of iterSkillRoots(workspacePath)) {
    if (!existsSync(root)) continue;

    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      const metadata = readSkill(resolve(root, entry.name), source);
      if (!metadata) continue;

      const key = metadata.name.toLowerCase();
      if (!skillsByName.has(key)) {
        skillsByName.set(key, metadata);
      }
    }
  }

  return [...skillsByName.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export function renderSkillsPrompt(
  skills: SkillMetadata[],
  expandedSkills: Iterable<string> = [],
): string {
  if (skills.length === 0) return "";

  const expanded = new Set(
    [...expandedSkills].map((name) => name.toLowerCase()),
  );
  const lines = ["<available_skills>"];

  for (const skill of skills) {
    let line = `- ${skill.name}: ${skill.description}`;
    if (expanded.has(skill.name.toLowerCase())) {
      line += `\n  Location: ${skill.location}`;
      const body = skill.body();
      if (body) line += `\n${body}`;
    }
    lines.push(line);
  }

  lines.push("</available_skills>");
  return lines.join("\n");
}

function readSkill(
  skillDir: string,
  source: SkillSource,
): SkillMetadata | undefined {
  const skillFile = resolve(skillDir, SKILL_FILE_NAME);
  if (!existsSync(skillFile)) return undefined;

  let content = "";
  try {
    content = readFileSync(skillFile, "utf8").trim();
  } catch {
    return undefined;
  }

  const frontmatter = parseFrontmatter(content);
  if (!isValidFrontmatter(skillDir, frontmatter)) return undefined;

  const name = frontmatter.name!.trim();
  const description = frontmatter.description!.trim();

  return {
    name,
    description,
    location: skillFile,
    source,
    metadata: normalizeMetadata(frontmatter.metadata),
    body() {
      return renderSkillBody(skillFile, content);
    },
  };
}

function renderSkillBody(skillFile: string, content: string): string {
  return content
    .replace(FRONT_MATTER_PATTERN, "")
    .trim()
    .replaceAll("${SKILL_DIR}", dirname(skillFile))
    .replaceAll("${PROJECT_DIR}", process.cwd())
    .replaceAll("${HOME}", homedir());
}

function parseFrontmatter(content: string): Record<string, unknown> {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return {};

  const endIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === "---",
  );
  if (endIndex <= 0) return {};

  const metadata: Record<string, unknown> = {};
  let currentMapKey: string | undefined;

  for (const rawLine of lines.slice(1, endIndex)) {
    if (!rawLine.trim()) continue;

    const mapMatch = rawLine.match(/^([A-Za-z0-9_-]+):\s*$/);
    if (mapMatch) {
      currentMapKey = mapMatch[1]!.toLowerCase();
      metadata[currentMapKey] = {};
      continue;
    }

    const nestedMatch = rawLine.match(/^\s+([A-Za-z0-9_.-]+):\s*(.+?)\s*$/);
    if (nestedMatch && currentMapKey) {
      const currentValue = metadata[currentMapKey];
      if (isMutableStringMap(currentValue)) {
        currentValue[nestedMatch[1]!] = stripQuotes(nestedMatch[2]!);
        continue;
      }
    }

    const scalarMatch = rawLine.match(/^([A-Za-z0-9_-]+):\s*(.+?)\s*$/);
    if (scalarMatch) {
      currentMapKey = undefined;
      metadata[scalarMatch[1]!.toLowerCase()] = stripQuotes(scalarMatch[2]!);
      continue;
    }
  }

  return metadata;
}

function normalizeMetadata(value: unknown): Record<string, string> {
  if (!isStringMap(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key.toLowerCase(), entry]),
  );
}

function isValidFrontmatter(
  skillDir: string,
  metadata: Record<string, unknown>,
): metadata is {
  name: string;
  description: string;
  metadata?: Record<string, string>;
} {
  return (
    isValidName(metadata.name, skillDir) &&
    isValidDescription(metadata.description) &&
    isValidMetadataField(metadata.metadata)
  );
}

function isValidName(name: unknown, skillDir: string): name is string {
  if (typeof name !== "string") return false;

  const normalized = name.trim();
  if (normalized.length === 0 || normalized.length > 64) return false;
  if (normalized !== basename(skillDir)) return false;

  return SKILL_NAME_PATTERN.test(normalized);
}

function isValidDescription(description: unknown): description is string {
  if (typeof description !== "string") return false;

  const normalized = description.trim();
  return normalized.length > 0 && normalized.length <= 1024;
}

function isValidMetadataField(
  metadata: unknown,
): metadata is Record<string, string> | undefined {
  if (metadata === undefined) return true;
  return isStringMap(metadata);
}

function isStringMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  return Object.entries(value).every(
    ([key, entry]) => typeof key === "string" && typeof entry === "string",
  );
}

function isMutableStringMap(value: unknown): value is Record<string, string> {
  return isStringMap(value) || isEmptyObject(value);
}

function iterSkillRoots(workspacePath: string): Array<[string, SkillSource]> {
  const projectRoot = resolve(workspacePath, PROJECT_SKILLS_DIR);
  const legacyRoot = resolve(workspacePath, LEGACY_SKILLS_DIR);
  const globalRoot = resolve(homedir(), PROJECT_SKILLS_DIR);

  const roots: Array<[string, SkillSource]> = [[projectRoot, "project"]];
  if (existsSync(legacyRoot)) {
    roots.push([legacyRoot, "project"]);
  }
  roots.push([globalRoot, "global"]);

  return roots;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function isEmptyObject(value: unknown): value is Record<string, never> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
