import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function readSessionHistoryTableSource() {
  return fs.readFileSync(
    path.join(
      import.meta.dirname,
      "components/admin/session/SessionHistoryTable.tsx",
    ),
    "utf8",
  );
}

function extractFunctionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);

  const signatureEnd = source.indexOf("}) {", start);
  assert.notEqual(signatureEnd, -1, `${functionName} should have a signature`);
  const openBrace = signatureEnd + "}) ".length;
  assert.notEqual(openBrace, -1, `${functionName} should have a body`);

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      return source.slice(openBrace + 1, index);
    }
  }

  assert.fail(`${functionName} body should be closed`);
}

test("class detail info keeps session teacher visible when entity column is hidden", () => {
  const source = readSessionHistoryTableSource();
  const body = extractFunctionBody(source, "ClassDetailInfoColumn");

  assert.match(
    body,
    /const showTeacherEntity = entityMode === "teacher";/,
  );
  assert.doesNotMatch(body, /showTeacherEntity = entityMode === "teacher" &&/);
});

test("session edit sends attendance only after attendance fields change", () => {
  const source = readSessionHistoryTableSource();

  assert.match(
    source,
    /const attendanceDirtyRef = useRef\(false\);/,
  );
  assert.match(
    source,
    /\.\.\.\(attendanceDirtyRef\.current && \{ attendance: attendancePayload \}\)/,
  );
  assert.doesNotMatch(
    source,
    /attendancePayload\.length > 0 && \{ attendance: attendancePayload \}/,
  );
});

test("session attendance edit payload excludes students no longer in the class roster", () => {
  const source = readSessionHistoryTableSource();

  assert.doesNotMatch(source, /missingExistingItems/);
  assert.doesNotMatch(
    source,
    /setAttendanceItems\(\[\.\.\.merged, \.\.\.missingExistingItems\]\)/,
  );
});
