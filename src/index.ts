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

interface TS {
  isClassDeclaration(node: ASTNode): boolean;
  isPropertyDeclaration(node: ASTNode): boolean;
  isMethodDeclaration(node: ASTNode): boolean;
  isFunctionDeclaration(node: ASTNode): boolean;
  SyntaxKind: { StaticKeyword: number };
}

interface ASTNode {
  name?: { getText(): string; escapedText?: string };
  jsDoc?: JSDoc[];
  parent?: ASTNode;
  modifiers?: Array<{ kind: number }>;
}

interface JSDoc {
  tags?: JSDocTag[];
}

interface JSDocTag {
  tagName: { getText(): string; escapedText?: string };
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
  /**
   * HTML for live rendering of the example (e.g. in Storybook or a reference
   * site), sourced from a matching `@render` tag. Absent when no `@render`
   * tag shares the example's title.
   */
  render?: string;
}

export interface PluginOptions {
  /**
   * Name of the property to write examples to on each declaration.
   * @default "examples"
   */
  propertyName?: string;
}

const CAPTION_RE = /^<caption>(?<caption>.*)<\/caption>\s*(?<rest>.*)/ms;
const NEWLINE_RE = /^(?<caption>[^\n]+)\n(?<rest>.*)/ms;
const CODEBLOCK_RE = /^```(?<lang>\w*)\s*\n(?<code>[\s\S]*?)```\s*$/ms;

function parseExample(comment: string): Example | null {
  const RE = comment.startsWith("<caption>") ? CAPTION_RE : NEWLINE_RE;
  const match = comment.match(RE);
  if (!match?.groups) return null;

  const { caption, rest } = match.groups;
  const title = caption.trim();
  const body = rest.trim();

  const codeMatch = body.match(CODEBLOCK_RE);
  if (codeMatch?.groups) {
    return {
      title,
      code: codeMatch.groups.code.trim(),
      lang: codeMatch.groups.lang || undefined,
    };
  }

  return { title, code: body };
}

function getNodeName(node: ASTNode): string | undefined {
  return node.name?.escapedText ?? node.name?.getText();
}

function getTagName(tag: JSDocTag): string | undefined {
  return tag.tagName.escapedText ?? tag.tagName.getText();
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

function extractExamples(
  node: ASTNode,
  doc: Declaration,
  propName: string,
  label: string,
  context: { dev?: boolean },
): void {
  if (!node.jsDoc) return;

  const examples: Example[] = [];
  const renders = new Map<string, string>();

  for (const jsdoc of node.jsDoc) {
    if (!Array.isArray(jsdoc.tags)) continue;

    for (const tag of jsdoc.tags) {
      const tagName = getTagName(tag);
      if (tagName !== "example" && tagName !== "render") continue;
      if (typeof tag.comment !== "string") continue;

      const parsed = parseExample(tag.comment);
      if (!parsed) continue;

      if (tagName === "example") {
        examples.push(parsed);
      } else {
        renders.set(normalizeTitle(parsed.title), parsed.code);
      }
    }
  }

  if (!examples.length && !renders.size) return;

  const matched = new Set<string>();
  for (const example of examples) {
    const key = normalizeTitle(example.title);
    const render = renders.get(key);
    if (render !== undefined) {
      example.render = render;
      matched.add(key);
    }
  }

  if (context.dev) {
    for (const key of renders.keys()) {
      if (!matched.has(key)) {
        console.warn(
          `[cem-plugin-examples] @render "${key}" has no matching @example in ${label}`,
        );
      }
    }
  }

  if (!examples.length) return;

  if (!doc[propName]) {
    doc[propName] = [];
  }
  (doc[propName] as Example[]).push(...examples);
}

function getDeclaration(
  moduleDoc: ModuleDoc,
  name: string,
): Declaration | undefined {
  return moduleDoc.declarations?.find((d) => d.name === name);
}

/**
 * Resolve the target declaration for a node and extract its @example tags.
 * Returns early if the node has no JSDoc or no @example tags to process.
 */
function processNode(
  node: ASTNode,
  doc: Declaration | undefined,
  label: string,
  moduleDoc: ModuleDoc,
  context: { dev?: boolean },
  propName: string,
): void {
  if (!doc) {
    if (context.dev)
      console.warn(`[cem-plugin-examples] ${label} not found in ${moduleDoc.path}`);
    return;
  }
  extractExamples(node, doc, propName, label, context);
}

export function cemExamplesPlugin(options: PluginOptions = {}) {
  const propName = options.propertyName ?? "examples";

  return {
    name: "cem-plugin-examples",

    analyzePhase({ ts, node, moduleDoc, context }: AnalyzePhaseParams): void {
      if (!node.jsDoc?.length) return;

      if (ts.isClassDeclaration(node)) {
        const name = getNodeName(node);
        if (!name) return;
        processNode(node, getDeclaration(moduleDoc, name), `Class ${name}`, moduleDoc, context, propName);
      } else if (ts.isPropertyDeclaration(node) || ts.isMethodDeclaration(node)) {
        const memberName = getNodeName(node);
        const className = node.parent ? getNodeName(node.parent) : undefined;
        if (!memberName || !className) return;
        const classDoc = getDeclaration(moduleDoc, className);
        const memberDoc = classDoc?.members?.find((m) => m.name === memberName);
        processNode(node, memberDoc, `Member ${className}.${memberName}`, moduleDoc, context, propName);
      } else if (ts.isFunctionDeclaration(node)) {
        const name = getNodeName(node);
        if (!name) return;
        processNode(node, getDeclaration(moduleDoc, name), `Function ${name}`, moduleDoc, context, propName);
      }
    },
  };
}
