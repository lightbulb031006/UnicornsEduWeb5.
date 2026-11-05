// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  expandMarkdownInRichHtml,
  looksLikeMarkdown,
  markdownToHtml,
  normalizeMarkdownSpacing,
} from "./rich-markdown";

/** HTML TipTap lưu khi dán text/plain: mỗi dòng một `<p>`, dòng trống bị bỏ. */
const asTiptapParagraphs = (lines: string[]) => lines.map((l) => `<p>${l}</p>`).join("");

describe("looksLikeMarkdown", () => {
  it("nhận heading, bảng, blockquote", () => {
    expect(looksLikeMarkdown("# Luật an ninh mạng")).toBe(true);
    expect(looksLikeMarkdown("| a | b |\n|---|---|\n| 1 | 2 |")).toBe(true);
    expect(looksLikeMarkdown("> Ghi nhớ: ...")).toBe(true);
  });

  it("bỏ qua văn bản thường", () => {
    expect(looksLikeMarkdown("Học sinh nộp bài trước 20h.\nCảm ơn.")).toBe(false);
    expect(looksLikeMarkdown("- một dòng gạch đầu")).toBe(false);
  });
});

describe("normalizeMarkdownSpacing", () => {
  it("nối các dòng bảng bị chèn dòng trống", () => {
    expect(normalizeMarkdownSpacing("| a | b |\n\n|---|---|\n\n| 1 | 2 |")).toBe(
      "| a | b |\n|---|---|\n| 1 | 2 |",
    );
  });

  it("giữ blockquote liền một khối", () => {
    expect(normalizeMarkdownSpacing("> Mục tiêu\n\n> - Ý 1")).toBe("> Mục tiêu\n>\n> - Ý 1");
  });
});

describe("markdownToHtml", () => {
  it("công thức thành node math, gạch dưới không bị hiểu là in nghiêng", () => {
    const html = markdownToHtml("## Đề\n\nTính $a_1 + b_1$:\n\n$$\\sum_{i=1}^n x_i$$");
    expect(html).toContain('<span data-type="inline-math" data-latex="a_1 + b_1"></span>');
    expect(html).toContain('<div data-type="block-math" data-latex="\\sum_{i=1}^n x_i"></div>');
  });

  it("`<` ngoài code là chữ, trong code giữ nguyên", () => {
    const html = markdownToHtml("# So sánh\n\nnếu a<b and c>d thì `x<y`");
    expect(html).toContain("a&lt;b and c&gt;d");
    expect(html).toContain("<code>x&lt;y</code>");
  });
});

describe("expandMarkdownInRichHtml", () => {
  it("render markdown dán raw (mỗi dòng một <p>)", () => {
    const html = expandMarkdownInRichHtml(
      asTiptapParagraphs([
        "# Luật an ninh mạng (cơ bản)",
        "&gt; Mục tiêu bài học:",
        "&gt; - Kể tên được các luật",
        "| Loại | Văn bản |",
        "|---|---|",
        "| Luật | Luật An ninh mạng (2018) |",
        "- Nghị định 131/2013/NĐ-CP xử phạt:",
        "  - Sao chép tác phẩm",
      ]),
    );
    expect(html).toContain("<h1>Luật an ninh mạng (cơ bản)</h1>");
    expect(html).toMatch(/<blockquote>[\s\S]*Mục tiêu[\s\S]*<li>Kể tên/);
    expect(html).toContain("<th>Loại</th>");
    expect(html).toContain("<td>Luật An ninh mạng (2018)</td>");
    expect(html).toMatch(/<ul>[\s\S]*<ul>[\s\S]*Sao chép tác phẩm/);
  });

  it("giữ thẻ inline TipTap (đậm do paste rule, công thức)", () => {
    const html = expandMarkdownInRichHtml(
      asTiptapParagraphs([
        "## Quyền tác giả",
        'Bản <strong>phái sinh</strong> và <span data-type="inline-math" data-latex="x_1"></span>',
      ]),
    );
    expect(html).toContain("<h2>Quyền tác giả</h2>");
    expect(html).toContain("<strong>phái sinh</strong>");
    expect(html).toContain('<span data-type="inline-math" data-latex="x_1"></span>');
  });

  it("khối ``` giữ từng dòng, không chèn dòng trống", () => {
    const html = expandMarkdownInRichHtml(
      asTiptapParagraphs(["```python", "for i in range(3):", "    print(i)", "```"]),
    );
    expect(html).toContain("for i in range(3):\n    print(i)");
  });

  it("đoạn văn thường và block TipTap không đổi", () => {
    const plain = "<p>Đoạn 1</p><p>2*3*4 = 24</p><table><tbody><tr><td>x</td></tr></tbody></table>";
    expect(expandMarkdownInRichHtml(plain)).toBe(plain);
  });
});
