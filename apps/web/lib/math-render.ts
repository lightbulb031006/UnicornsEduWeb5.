import katex from "katex";

function decodeMathEntities(str: string): string {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Parses an HTML string and renders all LaTeX math delimiters with KaTeX:
 * - Block math: `$$...$$` and `\[...\]`
 * - Inline math: `$...$` and `\(...\)`
 * Leaves `<pre>`, `<code>`, `<script>`, and `<style>` blocks intact.
 */
export function renderMathInHtml(html: string): string {
  if (!html) return "";

  // Split by code/pre/script/style tags to avoid parsing math inside code blocks
  const parts = html.split(
    /(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>)/gi,
  );

  return parts
    .map((part, index) => {
      // Odd indices are code/pre blocks
      if (index % 2 === 1) return part;

      // 1. Block math: $$ ... $$
      let processed = part.replace(/\$\$([\s\S]+?)\$\$/g, (match, tex) => {
        try {
          return katex.renderToString(decodeMathEntities(tex).trim(), {
            displayMode: true,
            throwOnError: false,
          });
        } catch {
          return match;
        }
      });

      // 1b. Block math: \[ ... \]
      processed = processed.replace(/\\\[([\s\S]+?)\\\]/g, (match, tex) => {
        try {
          return katex.renderToString(decodeMathEntities(tex).trim(), {
            displayMode: true,
            throwOnError: false,
          });
        } catch {
          return match;
        }
      });

      // 2. Inline math: \( ... \)
      processed = processed.replace(/\\\(([\s\S]+?)\\\)/g, (match, tex) => {
        try {
          return katex.renderToString(decodeMathEntities(tex).trim(), {
            displayMode: false,
            throwOnError: false,
          });
        } catch {
          return match;
        }
      });

      // 3. Inline math: $ ... $
      processed = processed.replace(
        /(^|[^\\])\$([^\$\n]+?)\$/g,
        (match, prefix, tex) => {
          if (tex.includes("<") && !tex.includes("&lt;")) {
            return match;
          }
          try {
            const rendered = katex.renderToString(
              decodeMathEntities(tex).trim(),
              {
                displayMode: false,
                throwOnError: false,
              },
            );
            return prefix + rendered;
          } catch {
            return match;
          }
        },
      );

      return processed;
    })
    .join("");
}
