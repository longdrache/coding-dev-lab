import express from 'express';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { RAG_INGEST_PATH, ragIngestBodyParser } from './large-json-body.ts';

describe('ragIngestBodyParser', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });

  async function start(app: express.Express): Promise<string> {
    server = createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    return `http://127.0.0.1:${address.port}`;
  }

  function makeApp() {
    const app = express();
    app.use(RAG_INGEST_PATH, ragIngestBodyParser);
    app.post(RAG_INGEST_PATH, (req, res) => {
      const text = (req.body as { text?: string } | undefined)?.text ?? '';
      res.json({ length: text.length });
    });
    // Mô phỏng parser mặc định của Nest được đăng ký SAU middleware trên.
    app.use(express.json());
    app.post('/other', (req, res) => {
      res.json({ parsed: Boolean(req.body) });
    });
    return app;
  }

  it('parse body 200KB ở path ingest', async () => {
    const base = await start(makeApp());
    const big = 'a'.repeat(200_000);
    const res = await fetch(`${base}${RAG_INGEST_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 's', text: big }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ length: big.length });
  });

  it('path khác vẫn parse JSON bình thường', async () => {
    const base = await start(makeApp());
    const res = await fetch(`${base}/other`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ parsed: true });
  });

  it('path khác vẫn giữ giới hạn 100KB mặc định', async () => {
    const base = await start(makeApp());
    const res = await fetch(`${base}/other`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a: 'a'.repeat(200_000) }),
    });
    expect(res.status).toBe(413);
  });
});
