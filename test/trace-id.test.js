import assert from "node:assert/strict";
import test from "node:test";

import { uuidV7 } from "../src/trace-id.js";

test("creates an RFC 4122 UUID v7-shaped trace id", () => {
  const value = uuidV7(1_700_000_000_000);
  assert.match(
    value,
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});
