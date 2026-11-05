import { describe, expect, it } from "vitest";
import { addCodeLineNumbers } from "@/lib/rich-html";

describe("addCodeLineNumbers", () => {
  it("bọc từng dòng code, giữ class ngôn ngữ", () => {
    const html =
      '<pre><code class="language-python">n = int(input())\nprint(n)\n</code></pre>';
    expect(addCodeLineNumbers(html)).toBe(
      '<pre><code class="language-python"><span class="code-line">n = int(input())</span><span class="code-line">print(n)</span></code></pre>',
    );
  });

  it("dòng trống vẫn giữ chỗ để số dòng không lệch", () => {
    const out = addCodeLineNumbers("<pre><code>a\n\nb</code></pre>");
    expect(out.match(/code-line/g)).toHaveLength(3);
    expect(out).toContain('<span class="code-line">​</span>');
  });

  it("idempotent và không đụng code inline", () => {
    const once = addCodeLineNumbers("<p><code>x</code></p><pre><code>a</code></pre>");
    expect(addCodeLineNumbers(once)).toBe(once);
    expect(once).toContain("<p><code>x</code></p>");
  });

  it("xử lý hai khối trong code song song", () => {
    const html =
      '<div data-code-parallel=""><pre><code class="language-python">a\nb</code></pre><pre><code class="language-cpp">c</code></pre></div>';
    expect(addCodeLineNumbers(html).match(/code-line/g)).toHaveLength(3);
  });
});
