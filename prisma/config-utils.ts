import fs from "node:fs";
import path from "node:path";

function normalizeFilePath(targetPath: string): string {
  return path.resolve(targetPath).replace(/\\/g, "/").toLowerCase();
}

function readCliArgument(name: string): string | null {
  const prefix = `${name}=`;

  for (let index = 0; index < process.argv.length; index += 1) {
    const argument = process.argv[index];

    if (argument === name) {
      return process.argv[index + 1] ?? null;
    }

    if (argument.startsWith(prefix)) {
      return argument.slice(prefix.length);
    }
  }

  return null;
}

function parseDotEnvContents(contents: string): Record<string, string> {
  const entries: Record<string, string> = {};
  const lines = String(contents || "").split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const match = trimmedLine.match(/^(?:export\s+)?([\w.-]+)\s*=\s*(.*)$/);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    let value = rawValue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }

    entries[key] = value;
  }

  return entries;
}

function loadEnvFileIfPresent(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const entries = parseDotEnvContents(fs.readFileSync(filePath, "utf8"));

  for (const [key, value] of Object.entries(entries)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return true;
}

function buildRejContEnvCandidates(projectRoot: string): string[] {
  const explicitEnvFile = process.env.REJ_CONT_ENV_FILE || process.env.PRISMA_ENV_FILE;

  if (explicitEnvFile) {
    return [
      path.resolve(process.cwd(), explicitEnvFile),
      path.resolve(projectRoot, explicitEnvFile),
    ];
  }

  return [
    path.join(projectRoot, ".env.test"),
    path.join(projectRoot, ".env"),
  ];
}

function loadRejContEnv(projectRoot: string): void {
  const seenCandidates = new Set<string>();

  for (const candidatePath of buildRejContEnvCandidates(projectRoot)) {
    const normalizedCandidatePath = normalizeFilePath(candidatePath);

    if (seenCandidates.has(normalizedCandidatePath)) {
      continue;
    }

    seenCandidates.add(normalizedCandidatePath);

    if (loadEnvFileIfPresent(candidatePath)) {
      break;
    }
  }
}

export function getRejContDatasourceUrl(projectRoot: string): string {
  loadRejContEnv(projectRoot);
  return String(process.env.POSTGRES_DATABASE_URL || process.env.DATABASE_URL || "").trim();
}

export function getRejContShadowDatabaseUrl(projectRoot: string): string | undefined {
  loadRejContEnv(projectRoot);

  const shadowDatabaseUrl = String(
    process.env.REJ_CONT_SHADOW_DATABASE_URL ||
      process.env.POSTGRES_SHADOW_DATABASE_URL ||
      ""
  ).trim();

  return shadowDatabaseUrl || undefined;
}

export function isRejContSchemaSelected(projectRoot: string): boolean {
  const cliSchemaPath = readCliArgument("--schema");

  if (!cliSchemaPath) {
    return false;
  }

  const resolvedCliSchemaPath = normalizeFilePath(path.resolve(process.cwd(), cliSchemaPath));
  const rejContSchemaPath = normalizeFilePath(path.join(projectRoot, "prisma", "rej-cont", "schema.prisma"));

  return resolvedCliSchemaPath === rejContSchemaPath;
}
