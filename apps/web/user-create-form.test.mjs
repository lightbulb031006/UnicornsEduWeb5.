import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "./node_modules/typescript/lib/typescript.js";

function loadTsModule(relativePath, mocks = {}) {
  const sourcePath = path.join(import.meta.dirname, relativePath);
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const exports = {};
  const require = (specifier) => {
    if (specifier in mocks) return mocks[specifier];
    throw new Error(`Unexpected import: ${specifier}`);
  };

  new Function("exports", "require", compiled)(exports, require);

  return exports;
}

const userNameDto = loadTsModule("dtos/user-name.dto.ts");
const { buildCreateUserPayload, validateCreateUserForm } = loadTsModule(
  "lib/user-create-form.ts",
  {
    "@/dtos/user-name.dto": userNameDto,
  },
);

test("validateCreateUserForm requires student name for student accounts", () => {
  const errors = validateCreateUserForm({
    accountHandle: "student.phuong",
    email: "phuong@example.com",
    password: "secret123",
    confirmPassword: "secret123",
    roleType: "student",
    staffRoles: [],
    studentName: " ",
  });

  assert.equal(errors.studentName, "Vui lòng nhập tên học sinh.");
});

test("buildCreateUserPayload sends canonical student name parts", () => {
  const payload = buildCreateUserPayload({
    accountHandle: " student.phuong ",
    email: " phuong@example.com ",
    password: "secret123",
    confirmPassword: "secret123",
    roleType: "student",
    staffRoles: ["teacher"],
    studentName: " Vũ Minh Phương ",
  });

  assert.deepEqual(payload, {
    accountHandle: "student.phuong",
    email: "phuong@example.com",
    password: "secret123",
    roleType: "student",
    first_name: "Phương",
    last_name: "Vũ Minh",
  });
});

test("buildCreateUserPayload sends emailVerified when set", () => {
  const payload = buildCreateUserPayload({
    accountHandle: "assistant.hien",
    email: "hien@example.com",
    password: "secret123",
    confirmPassword: "secret123",
    roleType: "staff",
    staffRoles: ["assistant"],
    studentName: "",
    emailVerified: true,
  });

  assert.deepEqual(payload, {
    accountHandle: "assistant.hien",
    email: "hien@example.com",
    password: "secret123",
    roleType: "staff",
    staffRoles: ["assistant"],
    emailVerified: true,
  });
});

