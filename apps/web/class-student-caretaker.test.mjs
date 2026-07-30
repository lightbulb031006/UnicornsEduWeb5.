import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "./node_modules/typescript/lib/typescript.js";

function compileModule(relativePath, requireMap = {}) {
  const sourcePath = path.join(import.meta.dirname, relativePath);
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const exports = {};
  const moduleShim = { exports };
  const localRequire = (id) => {
    if (id in requireMap) return requireMap[id];
    throw new Error(`Unexpected require: ${id}`);
  };
  new Function("exports", "module", "require", compiled)(
    exports,
    moduleShim,
    localRequire,
  );
  return moduleShim.exports;
}

const { resolveClassStudentCaretakerHref } = compileModule(
  "lib/class-student-caretaker.ts",
  {
    "@/lib/admin-shell-access": {},
    "@/lib/admin-shell-paths": compileModule("lib/admin-shell-paths.ts"),
    "@/dtos/class.dto": {},
  },
);

const caretaker = { id: "UNISTAFF-abcdef0123", fullName: "Nguyễn CSKH" };

test("admin/assistant/accountant_expense link to customer care detail", () => {
  assert.equal(
    resolveClassStudentCaretakerHref({
      routeBase: "/admin",
      caretaker,
      access: {
        isAdmin: true,
        isAssistant: false,
        isAccountantExpense: false,
        isCustomerCare: false,
      },
    }),
    `/admin/customer_care_detail/${encodeURIComponent(caretaker.id)}`,
  );

  assert.equal(
    resolveClassStudentCaretakerHref({
      routeBase: "/staff",
      caretaker,
      access: {
        isAdmin: false,
        isAssistant: true,
        isAccountantExpense: false,
        isCustomerCare: false,
      },
    }),
    `/staff/customer-care-detail/${encodeURIComponent(caretaker.id)}`,
  );

  assert.equal(
    resolveClassStudentCaretakerHref({
      routeBase: "/admin",
      caretaker,
      access: {
        isAdmin: false,
        isAssistant: false,
        isAccountantExpense: true,
        isCustomerCare: false,
      },
    }),
    `/admin/customer_care_detail/${encodeURIComponent(caretaker.id)}`,
  );
});

test("customer care only links to self detail", () => {
  assert.equal(
    resolveClassStudentCaretakerHref({
      routeBase: "/staff",
      caretaker,
      access: {
        isAdmin: false,
        isAssistant: false,
        isAccountantExpense: false,
        isCustomerCare: true,
      },
      viewerStaffId: caretaker.id,
    }),
    "/staff/customer-care-detail",
  );

  assert.equal(
    resolveClassStudentCaretakerHref({
      routeBase: "/staff",
      caretaker,
      access: {
        isAdmin: false,
        isAssistant: false,
        isAccountantExpense: false,
        isCustomerCare: true,
      },
      viewerStaffId: "UNISTAFF-other0001",
    }),
    null,
  );
});

test("teacher/training and empty caretaker have no link", () => {
  assert.equal(
    resolveClassStudentCaretakerHref({
      routeBase: "/staff",
      caretaker,
      access: {
        isAdmin: false,
        isAssistant: false,
        isAccountantExpense: false,
        isCustomerCare: false,
      },
    }),
    null,
  );

  assert.equal(
    resolveClassStudentCaretakerHref({
      routeBase: "/admin",
      caretaker: null,
      access: {
        isAdmin: true,
        isAssistant: false,
        isAccountantExpense: false,
        isCustomerCare: false,
      },
    }),
    null,
  );
});
