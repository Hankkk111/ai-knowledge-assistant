import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  findRelevantChunks,
  DEFAULT_CHUNK_LIMIT,
  MAX_CHUNK_LIMIT,
  type Queryable,
} from "../../src/services/retrieval";

function fakeDb(rows: any[] = []) {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const db: Queryable = {
    async query(text, values) {
      calls.push({ text, values });
      return { rows };
    },
  };
  return { db, calls };
}

describe("findRelevantChunks", () => {
  test("passes the embedding as a pgvector literal and uses the default limit", async () => {
    const { db, calls } = fakeDb();

    await findRelevantChunks([0.1, -0.2, 3], undefined, db);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].values, ["[0.1,-0.2,3]", DEFAULT_CHUNK_LIMIT]);
    assert.match(calls[0].text, /ORDER BY embedding <=> \$1/);
  });

  test("only searches chunks that have an embedding", async () => {
    const { db, calls } = fakeDb();

    await findRelevantChunks([1, 2], 3, db);

    assert.match(calls[0].text, /WHERE embedding IS NOT NULL\s+ORDER BY/);
  });

  test("maps database rows to DocumentChunk objects", async () => {
    const { db } = fakeDb([
      { id: "c1", document_id: "d1", content: "hello", metadata: { page: 2 } },
      { id: "c2", document_id: "d2", content: "world", metadata: null },
    ]);

    const chunks = await findRelevantChunks([1, 2], 2, db);

    assert.deepEqual(chunks, [
      { id: "c1", documentId: "d1", content: "hello", embedding: [], metadata: { page: 2 } },
      { id: "c2", documentId: "d2", content: "world", embedding: [], metadata: {} },
    ]);
  });

  const badEmbeddings: Array<[string, unknown]> = [
    ["an empty array", []],
    ["NaN values", [1, NaN]],
    ["Infinity values", [Infinity]],
    ["non-numeric values", [1, "2"]],
  ];
  for (const [label, embedding] of badEmbeddings) {
    test(`rejects ${label} without querying the database`, async () => {
      const { db, calls } = fakeDb();
      await assert.rejects(findRelevantChunks(embedding as number[], 5, db), /queryEmbedding/);
      assert.equal(calls.length, 0);
    });
  }

  for (const limit of [0, -1, 2.5, MAX_CHUNK_LIMIT + 1]) {
    test(`rejects limit ${limit}`, async () => {
      const { db, calls } = fakeDb();
      await assert.rejects(findRelevantChunks([1], limit, db), RangeError);
      assert.equal(calls.length, 0);
    });
  }

  test("accepts limit equal to MAX_CHUNK_LIMIT", async () => {
    const { db, calls } = fakeDb();
    await findRelevantChunks([1], MAX_CHUNK_LIMIT, db);
    assert.equal(calls[0].values[1], MAX_CHUNK_LIMIT);
  });
});
