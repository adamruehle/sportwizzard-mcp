// Exercise the installed tarball through stdio and a loopback-only mock API.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const [entryArgument, receiptArgument, tarballArgument] = process.argv.slice(2);
assert(entryArgument && receiptArgument && tarballArgument,
  'Usage: npm run smoke -- INSTALLED_ENTRY RECEIPT_PATH TARBALL_PATH');
const started = performance.now();
const work = await mkdtemp(join(tmpdir(), 'sportwizzard-mcp-smoke-'));
const requests = [];
const odds = [{ marketScope: 'SEASON', period: 'REG_SEASON', segment: 'AFC_EAST',
  marketSubtype: 'DIVISION_WINNER', selection: 'Buffalo Bills', priceAmerican: -180 }];
const snapshot = { data: { eventMarkets: [{ id: 'smoke-market', selections: [
  { priceHistory: [{ fs: 1, ls: 2, pa: -110, pd: 1.909 }] },
] }] } };
const api = createServer((req, res) => {
  requests.push(req.url);
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/v1/odds?scope=season') {
    res.end(JSON.stringify({ success: true, data: odds, nextCursor: null }));
  } else if (req.url === '/api/v1/snapshot?include_history=true') {
    res.setHeader('ETag', '"smoke-with-history"');
    res.end(JSON.stringify(snapshot));
  } else {
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'Unexpected mock request' }));
  }
});
await new Promise(resolveListen => api.listen(0, '127.0.0.1', resolveListen));
const baseUrl = `http://127.0.0.1:${api.address().port}`;
const client = new Client({ name: 'sportwizzard-package-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(entryArgument)],
  cwd: work,
  env: { SPORTWIZZARD_BASE_URL: baseUrl, SPORTWIZZARD_MOCK: '0', SPORTWIZZARD_API_KEY: '' },
  stderr: 'pipe',
});
const timeout = setTimeout(() => {
  console.error('Stdio package smoke exceeded 20 seconds');
  process.exit(1);
}, 20_000);
const payload = result => {
  assert(!result.isError, JSON.stringify(result));
  return JSON.parse(result.content.find(item => item.type === 'text').text);
};
try {
  await client.connect(transport);
  const tools = (await client.listTools()).tools;
  assert(tools.length > 0);
  assert.equal(new Set(tools.map(tool => tool.name)).size, tools.length);
  assert(tools.find(tool => tool.name === 'get_odds').inputSchema.properties.scope.enum.includes('season'));
  assert.equal(tools.find(tool => tool.name === 'download_snapshot')
    .inputSchema.properties.include_history.type, 'boolean');
  const result = payload(await client.callTool({ name: 'get_odds', arguments: { scope: 'season' } }));
  assert.equal(result.success, true);
  assert.deepEqual(result.data, odds);
  const savedPath = join(work, 'snapshot.json.gz');
  const downloaded = payload(await client.callTool({ name: 'download_snapshot',
    arguments: { save_path: savedPath, include_history: true } }));
  assert.equal(downloaded.success, true);
  assert.equal(downloaded.saved, savedPath);
  assert.equal(downloaded.etag, '"smoke-with-history"');
  const saved = await readFile(savedPath);
  assert.equal(downloaded.bytes, saved.length);
  assert.deepEqual(JSON.parse(gunzipSync(saved)), snapshot);
  assert.deepEqual(requests, ['/api/v1/odds?scope=season', '/api/v1/snapshot?include_history=true']);
  const receipt = { result: 'passed', node: process.version,
    environment: 'installed npm tarball; stdio MCP; loopback mock API; no production API or credentials',
    command: 'npm run smoke -- INSTALLED_ENTRY RECEIPT_PATH TARBALL_PATH',
    package_sha256: createHash('sha256').update(await readFile(resolve(tarballArgument))).digest('hex'),
    server: client.getServerVersion(), tools_list_count: tools.length, requests,
    snapshot_bytes: saved.length, include_history_preserved: true,
    duration_seconds: (performance.now() - started) / 1000 };
  await writeFile(resolve(receiptArgument), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
} finally {
  clearTimeout(timeout);
  await client.close();
  await new Promise(resolveClose => api.close(resolveClose));
  await rm(work, { recursive: true, force: true });
}
