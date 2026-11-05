// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { prepareRichHtml, sanitizeRichHtml } from "@/lib/rich-html";
import { renderMathInHtml } from "@/lib/math-render";

describe("sanitizeRichHtml — payload XSS", () => {
  it.each([
    ["<p>a</p><script>alert(1)</script>", "<script"],
    ['<img src="x" onerror="alert(1)">', "onerror"],
    ['<a href="javascript:alert(1)">x</a>', "javascript:"],
    ['<svg><script>alert(1)</script></svg>', "<script"],
    ['<iframe src="https://evil.test"></iframe>', "<iframe"],
    ['<p style="background:url(javascript:alert(1))">x</p>', "style="],
    ['<div onclick="alert(1)">x</div>', "onclick"],
  ])("loại %s", (payload, forbidden) => {
    expect(sanitizeRichHtml(payload).toLowerCase()).not.toContain(forbidden);
  });
});

describe("sanitizeRichHtml — giữ định dạng đề Tin", () => {
  it("giữ node công thức Tiptap và vẫn render KaTeX", () => {
    const html = '<p>Tính <span data-type="inline-math" data-latex="x^2"></span></p>';
    const clean = sanitizeRichHtml(html);
    expect(clean).toContain('data-latex="x^2"');
    expect(renderMathInHtml(clean)).toContain("katex");
  });

  it("giữ bảng, ảnh https, code có ngôn ngữ và code song song", () => {
    const html =
      '<table><tbody><tr><th><p>MaHS</p></th></tr><tr><td><p>1</p></td></tr></tbody></table>' +
      '<img src="https://cdn.test/a.png">' +
      '<div data-code-parallel=""><pre><code class="language-python">print(1)</code></pre><pre><code class="language-cpp">cout &lt;&lt; 1;</code></pre></div>';
    const clean = prepareRichHtml(html);
    expect(clean).toContain("<table>");
    expect(clean).toContain('<img src="https://cdn.test/a.png">');
    expect(clean).toContain("data-code-parallel");
    expect(clean).toContain('class="language-cpp"');
    expect(clean).toContain("cout &lt;&lt; 1;");
    expect(clean.match(/code-line/g)).toHaveLength(2);
  });
});
