import type { FileContext } from "./types";

export interface DetectedStack {
  frameworks: string[];
  languages: string[];
  databases: string[];
  infra: string[];
}

const FRAMEWORK_SIGNALS: [RegExp, string][] = [
  [/^next$/, "Next.js"],
  [/^react$/, "React"],
  [/^vue$/, "Vue"],
  [/^svelte$/, "Svelte"],
  [/^express$/, "Express"],
  [/^fastify$/, "Fastify"],
  [/^hono$/, "Hono"],
  [/^@nestjs\/core$/, "NestJS"],
  [/^@angular\/core$/, "Angular"],
  [/^astro$/, "Astro"],
  [/^nuxt$/, "Nuxt"],
  [/^@remix-run\/react$/, "Remix"],
  [/^koa$/, "Koa"],
];

const DB_SIGNALS: [RegExp, string][] = [
  [/^(pg|postgres|postgresql)$/, "PostgreSQL"],
  [/^mysql2?$/, "MySQL"],
  [/^(mongodb|mongoose)$/, "MongoDB"],
  [/^(ioredis|redis)$/, "Redis"],
  [/^sqlite3?$/, "SQLite"],
  [/^drizzle-orm$/, "Drizzle ORM"],
  [/^(prisma|@prisma\/client)$/, "Prisma"],
  [/^typeorm$/, "TypeORM"],
  [/^sequelize$/, "Sequelize"],
  [/^@supabase\/supabase-js$/, "Supabase"],
  [/^@planetscale\/database$/, "PlanetScale"],
];

const INFRA_SIGNALS: [RegExp, string][] = [
  [/^stripe$/, "Stripe"],
  [/^@aws-sdk\//, "AWS SDK"],
  [/^@google-cloud\//, "GCP"],
  [/^@azure\//, "Azure"],
  [/^@cloudflare\//, "Cloudflare"],
  [/^@vercel\//, "Vercel"],
  [/^(resend|nodemailer|@sendgrid\/mail)$/, "Email"],
  [/^(openai|@anthropic-ai\/sdk|@google\/generative-ai)$/, "AI/LLM"],
];

function packageNames(content: string): Set<string> {
  try {
    const manifest = JSON.parse(content) as Record<string, unknown>;
    const names = new Set<string>();
    for (const section of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      const dependencies = manifest[section];
      if (dependencies && typeof dependencies === "object" && !Array.isArray(dependencies)) {
        for (const name of Object.keys(dependencies)) names.add(name.toLowerCase());
      }
    }
    return names;
  } catch {
    return new Set();
  }
}

function addMatching(
  names: Iterable<string>,
  signals: [RegExp, string][],
  output: Set<string>,
): void {
  for (const name of names) {
    for (const [pattern, label] of signals) {
      if (pattern.test(name)) output.add(label);
    }
  }
}

export function detectStack(files: FileContext[]): DetectedStack {
  const frameworks = new Set<string>();
  const languages = new Set<string>();
  const databases = new Set<string>();
  const infra = new Set<string>();

  for (const file of files) {
    if ([".ts", ".tsx", ".mts", ".cts"].includes(file.ext)) languages.add("TypeScript");
    else if ([".js", ".jsx", ".mjs", ".cjs"].includes(file.ext)) languages.add("JavaScript");
    else if (file.ext === ".py") languages.add("Python");
    else if (file.ext === ".go") languages.add("Go");
    else if (file.ext === ".rb") languages.add("Ruby");
    else if (file.ext === ".php") languages.add("PHP");
    else if (file.ext === ".java") languages.add("Java");
    else if (file.ext === ".kt") languages.add("Kotlin");
    else if (file.ext === ".rs") languages.add("Rust");
    else if (file.ext === ".swift") languages.add("Swift");
    else if (file.ext === ".cs") languages.add("C#");

    const basename = file.path.split("/").pop() ?? "";
    if (basename === "Dockerfile") infra.add("Docker");
    if (/^docker-compose(?:\.|$)/i.test(basename)) infra.add("Docker Compose");
    if (file.path.endsWith(".tf")) infra.add("Terraform");
    if (file.path.includes(".github/workflows")) infra.add("GitHub Actions");
    if (basename === "wrangler.toml") infra.add("Cloudflare");
    if (basename === "vercel.json") infra.add("Vercel");

    if (basename === "package.json") {
      const names = packageNames(file.content);
      addMatching(names, FRAMEWORK_SIGNALS, frameworks);
      addMatching(names, DB_SIGNALS, databases);
      addMatching(names, INFRA_SIGNALS, infra);
    }

    if (
      basename === "requirements.txt" ||
      basename === "pyproject.toml" ||
      basename === "Pipfile"
    ) {
      if (/(^|\n)\s*django(?:[<=~!;\s'"]|$)/im.test(file.content)) frameworks.add("Django");
      if (/(^|\n)\s*flask(?:[<=~!;\s'"]|$)/im.test(file.content)) frameworks.add("Flask");
      if (/(^|\n)\s*fastapi(?:[<=~!;\s'"]|$)/im.test(file.content)) frameworks.add("FastAPI");
      if (/(^|\n)\s*sqlalchemy(?:[<>~=!;\s'"]|$)/im.test(file.content)) databases.add("SQLAlchemy");
      if (/(^|\n)\s*psycopg(?:2)?(?:\[[^\]]+\])?(?:[<>~=!;\s'"]|$)/im.test(file.content)) databases.add("PostgreSQL");
      if (/(^|\n)\s*pymongo(?:[<>~=!;\s'"]|$)/im.test(file.content)) databases.add("MongoDB");
      if (/(^|\n)\s*redis(?:[<>~=!;\s'"]|$)/im.test(file.content)) databases.add("Redis");
      if (/(^|\n)\s*celery(?:[<>~=!;\s'"]|$)/im.test(file.content)) infra.add("Celery");
      if (/(^|\n)\s*(openai|anthropic)(?:[<>~=!;\s'"]|$)/im.test(file.content)) infra.add("AI/LLM");
    }

    if (basename === "go.mod") {
      if (/github\.com\/gin-gonic\/gin(?:\/v\d+)?\s/.test(file.content)) frameworks.add("Gin");
      if (/github\.com\/gofiber\/fiber(?:\/v\d+)?\s/.test(file.content)) frameworks.add("Fiber");
      if (/gorm\.io\/gorm\s/.test(file.content)) databases.add("GORM");
    }
  }

  if (languages.has("TypeScript")) languages.delete("JavaScript");

  return {
    frameworks: [...frameworks],
    languages: [...languages],
    databases: [...databases],
    infra: [...infra],
  };
}

export function formatDetectedStack(stack: DetectedStack): string {
  return [
    ...stack.languages,
    ...stack.frameworks,
    ...stack.databases,
    ...stack.infra,
  ].join(", ");
}
