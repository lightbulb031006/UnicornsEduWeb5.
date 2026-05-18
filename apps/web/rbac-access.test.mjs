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
      jsx: ts.JsxEmit.ReactJSX,
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

const authDto = {
  Role: {
    admin: "admin",
    staff: "staff",
    student: "student",
    guest: "guest",
  },
};
const staffLessonWorkspace = compileModule("lib/staff-lesson-workspace.ts", {
  "@/dtos/Auth.dto": authDto,
});
const adminShellAccess = compileModule("lib/admin-shell-access.ts", {
  "@/dtos/Auth.dto": authDto,
});
const staffShellAccess = compileModule("lib/staff-shell-access.ts", {
  "@/dtos/Auth.dto": authDto,
  "@/lib/staff-lesson-workspace": staffLessonWorkspace,
});
const authRedirect = compileModule("lib/auth-redirect.ts", {
  "@/dtos/Auth.dto": authDto,
  "@/lib/admin-shell-access": adminShellAccess,
  "@/lib/staff-shell-access": staffShellAccess,
});

test("post-login redirect sends accountant to staff shell", () => {
  assert.equal(
    authRedirect.resolvePostLoginRedirect({
      id: "accountant-user",
      accountHandle: "accountant",
      roleType: "staff",
      requiresPasswordSetup: false,
      canAccessRestrictedRoutes: true,
      staffRoles: ["accountant"],
      hasStaffProfile: true,
      hasStudentProfile: false,
    }),
    "/staff",
  );
});

test("post-login redirect sends verified staff without data consent to consent page", () => {
  assert.equal(
    authRedirect.resolvePostLoginRedirect({
      id: "staff-user",
      accountHandle: "staff-user",
      roleType: "staff",
      requiresPasswordSetup: false,
      canAccessRestrictedRoutes: true,
      requiresStaffDataConsent: true,
      staffRoles: ["teacher"],
      hasStaffProfile: true,
      hasStudentProfile: false,
    }),
    "/staff/data-consent",
  );
});

test("post-login redirect ignores admin next paths for non-admin staff", () => {
  assert.equal(
    authRedirect.resolvePostLoginRedirect(
      {
        id: "accountant-user",
        accountHandle: "accountant",
        roleType: "staff",
        requiresPasswordSetup: false,
        canAccessRestrictedRoutes: true,
        staffRoles: ["accountant"],
        hasStaffProfile: true,
        hasStudentProfile: false,
      },
      "/admin/classes",
    ),
    "/staff",
  );
});

test("post-login redirect sends staff admin role to staff shell", () => {
  assert.equal(
    authRedirect.resolvePostLoginRedirect({
      id: "staff-admin-user",
      accountHandle: "staff-admin",
      roleType: "staff",
      requiresPasswordSetup: false,
      canAccessRestrictedRoutes: true,
      staffRoles: ["admin"],
      hasStaffProfile: true,
      hasStudentProfile: false,
      effectiveRoleTypes: ["staff", "admin"],
      access: { admin: { canAccess: true, tier: "full" } },
      preferredRedirect: "/admin/dashboard",
    }),
    "/staff",
  );
});

test("post-login redirect sends primary student to student shell", () => {
  assert.equal(
    authRedirect.resolvePostLoginRedirect({
      id: "student-staff-user",
      accountHandle: "student-staff",
      roleType: "student",
      requiresPasswordSetup: false,
      canAccessRestrictedRoutes: true,
      staffRoles: ["teacher"],
      hasStaffProfile: true,
      hasStudentProfile: true,
      effectiveRoleTypes: ["student", "staff"],
      preferredRedirect: "/staff",
    }),
    "/student",
  );
});

test("post-login redirect sends primary admin to admin shell", () => {
  const session = {
    id: "admin-user",
    accountHandle: "admin",
    roleType: "admin",
    requiresPasswordSetup: false,
    canAccessRestrictedRoutes: true,
    staffRoles: [],
    hasStaffProfile: false,
    hasStudentProfile: false,
  };

  assert.equal(authRedirect.resolvePostLoginRedirect(session), "/admin/dashboard");
  assert.equal(
    authRedirect.resolvePostLoginRedirect(session, "/admin/users"),
    "/admin/users",
  );
});

test("post-login redirect lets primary admin keep staff workspace next path", () => {
  const session = {
    id: "admin-user",
    accountHandle: "admin",
    roleType: "admin",
    requiresPasswordSetup: false,
    canAccessRestrictedRoutes: true,
    staffRoles: [],
    hasStaffProfile: false,
    hasStudentProfile: false,
    effectiveRoleTypes: ["admin"],
    access: { admin: { canAccess: true, tier: "full" } },
  };

  assert.equal(
    authRedirect.resolvePostLoginRedirect(session, "/staff/classes"),
    "/staff/classes",
  );
});

test("linked staff roles unlock staff shell even when primary role is student", () => {
  assert.equal(
    staffShellAccess.resolveStaffShellRouteAccess(
      {
        id: "student-staff-user",
        accountHandle: "student-staff",
        roleType: "student",
        requiresPasswordSetup: false,
        canAccessRestrictedRoutes: true,
        staffRoles: ["technical"],
        hasStaffProfile: true,
        hasStudentProfile: true,
      },
      "/staff/technical-detail",
    ).isAllowed,
    true,
  );
});

test("staff data consent route is accessible while consent is required", () => {
  assert.equal(
    staffShellAccess.resolveStaffShellRouteAccess(
      {
        id: "staff-user",
        accountHandle: "staff-user",
        roleType: "staff",
        requiresPasswordSetup: false,
        canAccessRestrictedRoutes: true,
        requiresStaffDataConsent: true,
        staffRoles: ["teacher"],
        hasStaffProfile: true,
        hasStudentProfile: false,
      },
      "/staff/data-consent",
    ).isAllowed,
    true,
  );
});

test("linked staff teacher unlocks class detail when primary role is student", () => {
  assert.equal(
    staffShellAccess.resolveStaffShellRouteAccess(
      {
        id: "student-teacher-user",
        accountHandle: "student-teacher",
        roleType: "student",
        requiresPasswordSetup: false,
        canAccessRestrictedRoutes: true,
        staffRoles: ["teacher"],
        hasStaffProfile: true,
        hasStudentProfile: true,
      },
      "/staff/classes/class-1",
    ).isAllowed,
    true,
  );
});

test("primary admin bypasses staff shell profile requirement", () => {
  const session = {
    id: "admin-user",
    accountHandle: "admin",
    roleType: "admin",
    requiresPasswordSetup: false,
    canAccessRestrictedRoutes: true,
    staffRoles: [],
    hasStaffProfile: false,
    hasStudentProfile: false,
    effectiveRoleTypes: ["admin"],
    access: { admin: { canAccess: true, tier: "full" } },
  };

  assert.equal(
    staffShellAccess.resolveStaffShellRouteAccess(
      session,
      "/staff/classes/class-1",
    ).isAllowed,
    true,
  );
  assert.equal(
    staffShellAccess.resolveStaffShellRouteAccess(session, "/staff/users")
      .isAllowed,
    true,
  );
  assert.equal(
    staffShellAccess.resolveStaffShellRouteAccess(session, "/staff/profile")
      .redirectHref,
    null,
  );
});

test("linked staff admin gets full admin shell even when primary role is student", () => {
  const access = adminShellAccess.resolveAdminShellAccess({
    id: "student-staff-admin",
    accountHandle: "student-staff-admin",
    roleType: "student",
    requiresPasswordSetup: false,
    canAccessRestrictedRoutes: true,
    staffRoles: ["admin"],
    hasStaffProfile: true,
    hasStudentProfile: true,
  });

  assert.equal(access.isAdmin, true);
  assert.equal(adminShellAccess.canAccessAdminShellRoute(access, "/admin/users"), true);
});

test("linked staff admin gets full staff shell routes even when primary role is student", () => {
  const session = {
    id: "student-staff-admin",
    accountHandle: "student-staff-admin",
    roleType: "student",
    requiresPasswordSetup: false,
    canAccessRestrictedRoutes: true,
    staffRoles: ["admin"],
    hasStaffProfile: true,
    hasStudentProfile: true,
    effectiveRoleTypes: ["student", "staff", "admin"],
    access: { admin: { canAccess: true, tier: "full" } },
  };

  assert.equal(
    staffShellAccess.resolveStaffShellRouteAccess(
      session,
      "/staff/calendar",
    ).isAllowed,
    true,
  );
  assert.equal(
    staffShellAccess.resolveStaffShellRouteAccess(
      session,
      "/staff/classes/class-1",
    ).isAllowed,
    true,
  );
});
