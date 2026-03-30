/**
 * cem-plugin-examples
 *
 * CEM analyzer plugin that extracts @example JSDoc tags into a structured
 * `examples` array on each declaration — no description mutation, no HTML
 * wrapping, just clean structured data.
 *
 * @example Basic usage
 * ```js
 * // custom-elements-manifest.config.mjs
 * import { cemExamplesPlugin } from "cem-plugin-examples";
 *
 * export default {
 *   plugins: [cemExamplesPlugin()],
 * };
 * ```
 */

// ---------------------------------------------------------------------------
// Types (kept minimal — we only use what the analyzer passes us)
// ---------------------------------------------------------------------------

interface TS {
  isClassDeclaration(node: ASTNode): boolean;
  isPropertyDeclaration(node: ASTNode): boolean;
  isMethodDeclaration(node: ASTNode): boolean;
  isFunctionDeclaration(node: ASTNode): boolean;
  SyntaxKind: { StaticKeyword: number };
}

interface ASTNode {
  name?: { getText(): string };
  jsDoc?: JSDoc[];
  parent?: ASTNode;
  modifiers?: Array<{ kind: number }>;
}

interface JSDoc {
  tags?: JSDocTag[];
}

interface JSDocTag {
  tagName: { getText(): string };
  comment?: string;
}

interface Declaration {
  name: string;
  members?: Declaration[];
  examples?: Example[];
  [key: string]: unknown;
}

interface ModuleDoc {
  path: string;
  declarations?: Declaration[];
}

interface AnalyzePhaseParams {
  ts: TS;
  node: ASTNode;
  moduleDoc: ModuleDoc;
  context: { dev?: boolean };
}

export interface Example {
  title: string;
  code: string;
  lang?: string;
}

export interface PluginOptions {
  /**
   * Name of the property to write examples to on each declaration.
   * @default "examples"
   */
  propertyName?: string;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * `<caption>...</caption>` followed by the rest.
 */
const CAPTION_RE = /^<caption>(?<caption>.*)<\/caption>\s*(?<rest>.*)/ms;

/**
 * First line of plain text as caption, rest is content.
 */
const NEWLINE_RE = /^(?<caption>[^\n]+)\n(?<rest>.*)/ms;

/**
 * Extract lang and code from a fenced code block: ```lang\ncode\n```
 */
const CODEBLOCK_RE = /^```(?<lang>\w*)\s*\n(?<code>[\s\S]*?)```\s*$/m;

function parseExample(comment: string): Example | null {
  const RE = comment.startsWith("<caption>") ? CAPTION_RE : NEWLINE_RE;
  const match = comment.match(RE);
  if (!match?.groups) return null;

  const { caption, rest } = match.groups;
  const title = caption.trim();
  const body = rest.trim();

  // Try to extract code from a fenced block
  const codeMatch = body.match(CODEBLOCK_RE);
  if (codeMatch?.groups) {
    return {
      title,
      code: codeMatch.groups.code.trim(),
      lang: codeMatch.groups.lang || undefined,
    };
  }

  // Fallback: treat the entire rest as code
  return { title, code: body };
}

// ---------------------------------------------------------------------------
// Declaration lookup
// ---------------------------------------------------------------------------

function getDeclaration(
  moduleDoc: ModuleDoc,
  name: string,
): Declaration | undefined {
  return moduleDoc.declarations?.find((d) => d.name === name);
}

function getMemberDoc(
  moduleDoc: ModuleDoc,
  className: string,
  memberName: string,
): Declaration | undefined {
  const classDoc = getDeclaration(moduleDoc, className);
  return classDoc?.members?.find(
    (m) => m.name === memberName,
  );
}

// ---------------------------------------------------------------------------
// Core: extract @example tags → examples array
// ---------------------------------------------------------------------------

function extractExamples(
  node: ASTNode,
  doc: Declaration,
  propName: string,
): void {
  if (!node.jsDoc) return;

  for (const jsdoc of node.jsDoc) {
    if (!Array.isArray(jsdoc.tags)) continue;

    for (const tag of jsdoc.tags) {
      try {
        if (tag.tagName.getText() !== "example") continue;
      } catch {
        continue;
      }

      if (typeof tag.comment !== "string") continue;

      const example = parseExample(tag.comment);
      if (!example) continue;

      if (!doc[propName]) {
        doc[propName] = [];
      }
      (doc[propName] as Example[]).push(example);
    }
  }
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export function cemExamplesPlugin(options: PluginOptions = {}) {
  const propName = options.propertyName ?? "examples";

  return {
    name: "cem-plugin-examples",

    analyzePhase({ ts, node, moduleDoc, context }: AnalyzePhaseParams): void {
      if (!("jsDoc" in node)) return;

      if (ts.isClassDeclaration(node)) {
        const name = node.name?.getText();
        if (!name) return;
        const doc = getDeclaration(moduleDoc, name);
        if (!doc) {
          if (context.dev)
            console.warn(
              `[cem-plugin-examples] Class ${name} not found in ${moduleDoc.path}`,
            );
          return;
        }
        extractExamples(node, doc, propName);
      } else if (ts.isPropertyDeclaration(node) || ts.isMethodDeclaration(node)) {
        const memberName = node.name?.getText();
        const className = node.parent?.name?.getText();
        if (!memberName || !className) return;
        const doc = getMemberDoc(moduleDoc, className, memberName);
        if (!doc) {
          if (context.dev)
            console.warn(
              `[cem-plugin-examples] Member ${className}.${memberName} not found in ${moduleDoc.path}`,
            );
          return;
        }
        extractExamples(node, doc, propName);
      } else if (ts.isFunctionDeclaration(node)) {
        const name = node.name?.getText();
        if (!name) return;
        const doc = getDeclaration(moduleDoc, name);
        if (!doc) {
          if (context.dev)
            console.warn(
              `[cem-plugin-examples] Function ${name} not found in ${moduleDoc.path}`,
            );
          return;
        }
        extractExamples(node, doc, propName);
      }
    },
  };
}
