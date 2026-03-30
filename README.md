# cem-plugin-examples

A [Custom Elements Manifest](https://custom-elements-manifest.open-wc.org/) analyzer plugin that extracts `@example` JSDoc tags into a structured `examples` array on each declaration.

Unlike plugins that embed examples into the `description` field as HTML, this plugin writes clean structured data — making it easy for tools like MCP servers, documentation generators, and IDEs to consume examples directly.

## Installation

```bash
npm install -D cem-plugin-examples
```

## Usage

Add the plugin to your CEM analyzer config:

```js
// custom-elements-manifest.config.mjs
import { cemExamplesPlugin } from "cem-plugin-examples";

export default {
  plugins: [
    cemExamplesPlugin(),
  ],
};
```

## JSDoc Format

Add `@example` tags to your component class JSDoc. The first line is the title, followed by a fenced code block:

```ts
/**
 * A button component.
 *
 * @example Primary button
 * ```html
 * <my-button variant="primary">Click me</my-button>
 * ```
 *
 * @example Button with icon
 * ```html
 * <my-button icon="check">Confirm</my-button>
 * ```
 */
export class MyButton extends HTMLElement { }
```

You can also use `<caption>` tags (for compatibility with existing JSDoc conventions):

```ts
/**
 * @example <caption>Primary button</caption>
 * ```html
 * <my-button variant="primary">Click me</my-button>
 * ```
 */
```

## Output

The plugin adds an `examples` array to the declaration in `custom-elements.json`:

```json
{
  "kind": "class",
  "name": "MyButton",
  "tagName": "my-button",
  "description": "A button component.",
  "examples": [
    {
      "title": "Primary button",
      "code": "<my-button variant=\"primary\">Click me</my-button>",
      "lang": "html"
    },
    {
      "title": "Button with icon",
      "code": "<my-button icon=\"check\">Confirm</my-button>",
      "lang": "html"
    }
  ]
}
```

Each example has:

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | The example caption/title |
| `code` | `string` | The code content (without fenced block markers) |
| `lang` | `string?` | The language identifier from the fenced block (e.g., `html`, `js`) |

## Options

```js
cemExamplesPlugin({
  // Name of the property to write examples to (default: "examples")
  propertyName: "examples",
});
```

## Supported Declarations

The plugin extracts `@example` tags from:

- Classes (including web component classes)
- Class properties and methods
- Standalone functions

## License

MIT
