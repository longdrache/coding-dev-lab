import test from "node:test";
import assert from "node:assert/strict";

async function loadRagImport() {
  if (!process.features.typescript) {
    throw new Error("Can Node >= 22.18 de import() duoc file TypeScript.");
  }
  return import(new URL("./lib/rag-import.ts", import.meta.url).href);
}

test("utf8ByteLength dem dung byte tieng Viet", async () => {
  const { utf8ByteLength } = await loadRagImport();
  assert.equal(utf8ByteLength("abc"), 3);
  assert.equal(utf8ByteLength("à"), 2);
});

test("validateIngestInput: rong -> loi", async () => {
  const { validateIngestInput } = await loadRagImport();
  assert.deepEqual(validateIngestInput("src", "   "), { ok: false, message: "Tài liệu đang rỗng." });
});

test("validateIngestInput: source rong -> loi", async () => {
  const { validateIngestInput } = await loadRagImport();
  assert.deepEqual(validateIngestInput("  ", "hello"), { ok: false, message: "Chưa nhập nguồn (source)." });
});

test("validateIngestInput: hop le -> ok", async () => {
  const { validateIngestInput } = await loadRagImport();
  assert.deepEqual(validateIngestInput("src", "hello"), { ok: true });
});

test("validateIngestInput: text qua 5MB -> loi", async () => {
  const { validateIngestInput, MAX_INGEST_BYTES } = await loadRagImport();
  const big = "a".repeat(MAX_INGEST_BYTES + 1);
  const res = validateIngestInput("src", big);
  assert.equal(res.ok, false);
});

test("isIngestSuccess: 200 + ok true", async () => {
  const { isIngestSuccess } = await loadRagImport();
  assert.equal(isIngestSuccess(200, { ok: true }), true);
  assert.equal(isIngestSuccess(400, { ok: true }), false);
  assert.equal(isIngestSuccess(200, { ok: false }), false);
  assert.equal(isIngestSuccess(200, null), false);
});

test("ingestErrorMessage: uu tien message cua BE", async () => {
  const { ingestErrorMessage } = await loadRagImport();
  assert.equal(ingestErrorMessage(400, { message: "  bad  " }), "bad");
  assert.equal(ingestErrorMessage(400, null), "Nhập thất bại (HTTP 400).");
  assert.equal(ingestErrorMessage(400, { message: "   " }), "Nhập thất bại (HTTP 400).");
});