import { describe, expect, it } from "vitest";
import { renderLatexPreview, renderMathInHtml } from "@/lib/math-render";

describe("renderLatexPreview", () => {
  it("returns null for blank input", () => {
    expect(renderLatexPreview("   ", false)).toBeNull();
  });

  it("renders valid latex to KaTeX html", () => {
    const result = renderLatexPreview("\\frac{a}{b}", true);
    expect(result?.ok).toBe(true);
    expect(result?.ok && result.html).toContain("katex-display");
  });

  it("reports parse errors without the KaTeX prefix", () => {
    const result = renderLatexPreview("\\frac{a}{", false);
    expect(result?.ok).toBe(false);
    expect(result?.ok === false && result.message).not.toMatch(/^KaTeX parse error/);
  });
});

describe("renderMathInHtml — Tiptap math nodes", () => {
  it("renders inline and block nodes saved by MathRichTextEditor", () => {
    const html = renderMathInHtml(
      '<p>Cho <span data-latex="x &gt; 0" data-type="inline-math"></span>.</p>' +
        '<div data-latex="\\frac{a}{b}" data-type="block-math"></div>',
    );
    expect(html).not.toContain("data-latex");
    expect(html).toContain('<annotation encoding="application/x-tex">x &gt; 0</annotation>');
    expect(html).toContain("katex-display");
  });

  it("handles a raw > inside the attribute and leaves other empty spans alone", () => {
    const html = renderMathInHtml(
      '<p><span data-type="inline-math" data-latex="a > b"></span><span class="x"></span></p>',
    );
    expect(html).toContain("katex");
    expect(html).toContain('<span class="x"></span>');
  });

  it("does not re-process $ delimiters inside rendered node output", () => {
    const html = renderMathInHtml(
      '<p><span data-type="inline-math" data-latex="\\$5"></span> và $y$</p>',
    );
    expect(html.match(/class="katex"/g)).toHaveLength(2);
  });
});
