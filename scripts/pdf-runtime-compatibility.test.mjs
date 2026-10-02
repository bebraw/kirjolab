import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { pdfRuntimeCompatibilityBanner } from "./pdf-runtime-compatibility.mjs";

test("preserves the native Promise.withResolvers implementation", () => {
  const native = Promise.withResolvers;
  runInNewContext(pdfRuntimeCompatibilityBanner, { Promise });
  assert.equal(Promise.withResolvers, native);
});

test("restores deferred resolution and rejection in a legacy Promise realm", async () => {
  class LegacyPromise extends Promise {}
  Object.defineProperty(LegacyPromise, "withResolvers", { configurable: true, value: undefined, writable: true });
  runInNewContext(pdfRuntimeCompatibilityBanner, { Promise: LegacyPromise });

  const resolved = LegacyPromise.withResolvers();
  assert.ok(resolved.promise instanceof LegacyPromise);
  resolved.resolve(42);
  assert.equal(await resolved.promise, 42);

  const assimilated = LegacyPromise.withResolvers();
  assimilated.resolve(Promise.resolve("ready"));
  assert.equal(await assimilated.promise, "ready");

  const rejected = LegacyPromise.withResolvers();
  rejected.reject(new Error("PDF failed"));
  await assert.rejects(rejected.promise, /PDF failed/u);

  class ChildPromise extends LegacyPromise {}
  assert.ok(ChildPromise.withResolvers().promise instanceof ChildPromise);
  assert.equal(Object.getOwnPropertyDescriptor(LegacyPromise, "withResolvers").enumerable, false);
});
