const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const composePath = path.join(__dirname, '..', 'docker-compose.prod.yml');

test('production API pins the Math LMS profile', () => {
  const compose = fs.readFileSync(composePath, 'utf8');

  assert.match(
    compose,
    /api:[\s\S]*?environment:[\s\S]*?LMS_PROFILE: "math"[\s\S]*?NODE_ENV: "production"/,
  );
});
