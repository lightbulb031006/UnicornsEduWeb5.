import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "./node_modules/typescript/lib/typescript.js";

function loadUserNameDto() {
  const sourcePath = path.join(import.meta.dirname, "dtos/user-name.dto.ts");
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const exports = {};

  new Function("exports", compiled)(exports);

  return exports;
}

const { resolveCanonicalUserName, splitCanonicalUserName } = loadUserNameDto();

test("resolveCanonicalUserName formats Vietnamese names in family/middle/given order", () => {
  assert.equal(
    resolveCanonicalUserName({
      first_name: "Phương",
      last_name: "Vũ Minh",
    }),
    "Vũ Minh Phương",
  );
});

test("resolveCanonicalUserName falls back when stored name parts are blank", () => {
  assert.equal(
    resolveCanonicalUserName({
      first_name: " ",
      last_name: null,
      accountHandle: "staff.phuong",
      email: "phuong@example.com",
    }),
    "staff.phuong",
  );
});

test("splitCanonicalUserName stores given name separately from family and middle name", () => {
  assert.deepEqual(splitCanonicalUserName("Vũ Minh Phương"), {
    first_name: "Phương",
    last_name: "Vũ Minh",
  });
});
