// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isFromNestedInteractive } from "./row-link";

function setup(html: string) {
  document.body.innerHTML = `<div id="row" role="link" tabindex="0">${html}</div><button id="outside">x</button>`;
  return document.getElementById("row") as HTMLElement;
}

describe("isFromNestedInteractive", () => {
  it("cho qua click vào chữ thường trong card", () => {
    const row = setup(`<p><span id="t">Tên</span></p>`);
    expect(isFromNestedInteractive(document.getElementById("t"), row)).toBe(
      false,
    );
  });

  it("cho qua click thẳng vào card (card có role=link)", () => {
    const row = setup(`<p>Tên</p>`);
    expect(isFromNestedInteractive(row, row)).toBe(false);
  });

  it("bỏ qua click từ nút / link con, kể cả icon bên trong nút", () => {
    const row = setup(
      `<button><svg id="icon"></svg></button><a id="mail" href="mailto:a@b.c">a</a>`,
    );
    expect(isFromNestedInteractive(document.getElementById("icon"), row)).toBe(
      true,
    );
    expect(isFromNestedInteractive(document.getElementById("mail"), row)).toBe(
      true,
    );
  });

  it("bỏ qua vùng đánh dấu data-row-link-ignore", () => {
    const row = setup(`<div data-row-link-ignore><span id="t">x</span></div>`);
    expect(isFromNestedInteractive(document.getElementById("t"), row)).toBe(
      true,
    );
  });

  it("bỏ qua sự kiện từ ngoài card (portal dialog)", () => {
    const row = setup(`<p>Tên</p>`);
    expect(
      isFromNestedInteractive(document.getElementById("outside"), row),
    ).toBe(true);
  });
});
