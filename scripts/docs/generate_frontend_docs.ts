/**
 * Generate frontend API reference docs from TypeScript source using ts-morph.
 *
 * Extracts exported interfaces, components, hooks, and their JSDoc comments
 * into Docusaurus-compatible markdown.
 *
 * Usage:
 *   bun run scripts/docs/generate_frontend_docs.ts
 */

import { Project, SyntaxKind, type SourceFile, type Node } from "ts-morph";
import { mkdirSync, writeFileSync } from "fs";
import { resolve, relative, basename, dirname } from "path";
import { globSync } from "fs";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
const DOCS_DIR = resolve(REPO_ROOT, "docs-site", "docs", "frontend");
const FRONTEND_ROOT = resolve(REPO_ROOT, "frontend");

interface DocEntry {
  name: string;
  kind: "component" | "hook" | "interface" | "type" | "function" | "const";
  signature?: string;
  description?: string;
  props?: PropEntry[];
  filePath: string;
}

interface PropEntry {
  name: string;
  type: string;
  optional: boolean;
  description?: string;
}

const SOURCE_GROUPS: { label: string; glob: string; outDir: string }[] = [
  {
    label: "Tool pages",
    glob: "apps/web/app/(tools)/*/page.tsx",
    outDir: "tools",
  },
  {
    label: "Components",
    glob: "apps/web/components/*.tsx",
    outDir: "components",
  },
  {
    label: "Lib",
    glob: "apps/web/lib/*.ts",
    outDir: "lib",
  },
  {
    label: "Settings context",
    glob: "apps/web/lib/settings-context.tsx",
    outDir: "lib",
  },
  {
    label: "UI components",
    glob: "packages/ui/src/components/*.tsx",
    outDir: "ui",
  },
];

function getJsDoc(node: Node): string | undefined {
  const jsDocs = (node as any).getJsDocs?.();
  if (!jsDocs || jsDocs.length === 0) return undefined;
  return jsDocs
    .map((doc: any) => doc.getDescription?.()?.trim())
    .filter(Boolean)
    .join("\n\n");
}

function extractInterfaces(sourceFile: SourceFile): DocEntry[] {
  const entries: DocEntry[] = [];

  for (const iface of sourceFile.getInterfaces()) {
    if (!iface.isExported()) continue;

    const props: PropEntry[] = iface.getProperties().map((prop) => ({
      name: prop.getName(),
      type: prop.getType().getText(prop),
      optional: prop.hasQuestionToken(),
      description: getJsDoc(prop),
    }));

    entries.push({
      name: iface.getName(),
      kind: "interface",
      description: getJsDoc(iface),
      props,
      filePath: sourceFile.getFilePath(),
    });
  }

  for (const typeAlias of sourceFile.getTypeAliases()) {
    if (!typeAlias.isExported()) continue;
    entries.push({
      name: typeAlias.getName(),
      kind: "type",
      signature: `type ${typeAlias.getName()} = ${typeAlias.getType().getText(typeAlias)}`,
      description: getJsDoc(typeAlias),
      filePath: sourceFile.getFilePath(),
    });
  }

  return entries;
}

function extractComponents(sourceFile: SourceFile): DocEntry[] {
  const entries: DocEntry[] = [];

  for (const fn of sourceFile.getFunctions()) {
    if (!fn.isExported() && !fn.isDefaultExport()) continue;
    const name = fn.getName() || "default";
    const isHook = name.startsWith("use");

    entries.push({
      name,
      kind: isHook ? "hook" : "component",
      description: getJsDoc(fn),
      signature: `function ${name}(${fn
        .getParameters()
        .map((p) => p.getText())
        .join(", ")})`,
      filePath: sourceFile.getFilePath(),
    });
  }

  for (const varDecl of sourceFile.getVariableDeclarations()) {
    const stmt = varDecl.getVariableStatement();
    if (!stmt?.isExported()) continue;
    const name = varDecl.getName();
    const isHook = name.startsWith("use");
    const init = varDecl.getInitializer();
    const isArrowFn =
      init?.getKind() === SyntaxKind.ArrowFunction ||
      init?.getKind() === SyntaxKind.FunctionExpression;

    if (isArrowFn) {
      entries.push({
        name,
        kind: isHook ? "hook" : "component",
        description: getJsDoc(stmt),
        filePath: sourceFile.getFilePath(),
      });
    } else {
      entries.push({
        name,
        kind: "const",
        signature: `const ${name}: ${varDecl.getType().getText(varDecl)}`,
        description: getJsDoc(stmt),
        filePath: sourceFile.getFilePath(),
      });
    }
  }

  return entries;
}

function renderMarkdown(
  title: string,
  filePath: string,
  entries: DocEntry[]
): string {
  const relPath = relative(REPO_ROOT, filePath);
  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`\`${relPath}\``);
  lines.push("");

  for (const entry of entries) {
    const icon =
      entry.kind === "component"
        ? "Component"
        : entry.kind === "hook"
          ? "Hook"
          : entry.kind === "interface"
            ? "Interface"
            : entry.kind === "type"
              ? "Type"
              : entry.kind === "function"
                ? "Function"
                : "Const";

    lines.push(`## \`${entry.name}\` {#${entry.name.toLowerCase()}}`);
    lines.push("");
    lines.push(`**${icon}**`);
    lines.push("");

    if (entry.description) {
      lines.push(entry.description);
      lines.push("");
    }

    if (entry.signature) {
      lines.push("```typescript");
      lines.push(entry.signature);
      lines.push("```");
      lines.push("");
    }

    if (entry.props && entry.props.length > 0) {
      lines.push("| Prop | Type | Required | Description |");
      lines.push("|------|------|----------|-------------|");
      for (const prop of entry.props) {
        const req = prop.optional ? "No" : "Yes";
        const desc = prop.description || "";
        const escapedType = prop.type
          .replace(/\|/g, "\\|")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        lines.push(`| \`${prop.name}\` | \`${escapedType}\` | ${req} | ${desc} |`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

function resolveGlob(pattern: string): string[] {
  const { globSync } = require("glob");
  return globSync(resolve(FRONTEND_ROOT, pattern));
}

function main() {
  console.log("Generating frontend docs...");

  const project = new Project({
    tsConfigFilePath: resolve(FRONTEND_ROOT, "apps/web/tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
  });

  const seen = new Set<string>();

  for (const group of SOURCE_GROUPS) {
    const files = resolveGlob(group.glob);
    const outDir = resolve(DOCS_DIR, group.outDir);
    mkdirSync(outDir, { recursive: true });

    for (const filePath of files) {
      if (seen.has(filePath)) continue;
      seen.add(filePath);

      const sourceFile = project.addSourceFileAtPath(filePath);
      const interfaces = extractInterfaces(sourceFile);
      const components = extractComponents(sourceFile);
      const allEntries = [...interfaces, ...components];

      if (allEntries.length === 0) continue;

      let docFileName: string;
      let title: string;
      if (group.outDir === "tools") {
        const toolName = basename(dirname(filePath));
        docFileName = toolName;
        title =
          toolName.charAt(0).toUpperCase() + toolName.slice(1) + " (page)";
      } else {
        docFileName = basename(filePath, ".tsx").replace(/\.ts$/, "");
        title = docFileName.charAt(0).toUpperCase() + docFileName.slice(1);
      }

      const md = renderMarkdown(title, filePath, allEntries);
      const dest = resolve(outDir, `${docFileName}.md`);
      writeFileSync(dest, md);
      console.log(`  ${relative(REPO_ROOT, dest)}`);
    }
  }

  console.log("Done.");
}

main();
