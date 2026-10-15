// Exercise the installed tarball through stdio and a loopback-only mock API.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const [entryArgument, receiptArgument, tarballArgument] = process.argv.slice(2);
assert(entryArgument && receiptArgument && tarballArgument,
  'Usage: npm run smoke -- INSTALLED_ENTRY RECEIPT_PATH TARBALL_PATH');
const started = performance.now();
const execFileAsync = promisify(execFile);
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
    res.end(JSON.stringify({ success: true, data: odds, nextCursor: null, meta: { count: 1 } }));
  } else if (req.url === '/api/v1/status') {
    res.end(JSON.stringify({ success: true, data: [{ status: 'available' }], meta: { count: 1 } }));
  } else if (req.url === '/api/v1/sportsbooks') {
    res.end(JSON.stringify({ success: true, data: [{ id: 'sample-book' }], meta: { count: 1 } }));
  } else if (req.url === '/api/v1/markets') {
    res.end(JSON.stringify({ success: true, data: [{ marketType: 'MONEYLINE', marketSubtype: null }], meta: { count: 1 } }));
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
  assert(!/total live|market count/i.test(tools.find(tool => tool.name === 'status').description));
  assert(!/market count|live count/i.test(tools.find(tool => tool.name === 'list_sportsbooks').description));
  assert(!/live count/i.test(tools.find(tool => tool.name === 'list_markets').description));
  for (const name of ['status', 'list_sportsbooks', 'list_markets']) {
    const response = payload(await client.callTool({ name, arguments: {} }));
    for (const row of response.data) {
      assert(!('totalMarkets' in row));
      assert(!('marketCount' in row));
      assert(!('liveCount' in row));
    }
  }
  const result = payload(await client.callTool({ name: 'get_odds', arguments: { scope: 'season' } }));
  assert.equal(result.success, true);
  assert.deepEqual(result.data, odds);
  assert.equal(result.meta.count, 1);
  const savedPath = join(work, 'snapshot.json.gz');
  const downloaded = payload(await client.callTool({ name: 'download_snapshot',
    arguments: { save_path: savedPath, include_history: true } }));
  assert.equal(downloaded.success, true);
  assert.equal(downloaded.saved, savedPath);
  assert.equal(downloaded.etag, '"smoke-with-history"');
  const saved = await readFile(savedPath);
  assert.equal(downloaded.bytes, saved.length);
  assert.deepEqual(JSON.parse(gunzipSync(saved)), snapshot);
  assert.deepEqual(requests, [
    '/api/v1/status', '/api/v1/sportsbooks', '/api/v1/markets',
    '/api/v1/odds?scope=season', '/api/v1/snapshot?include_history=true',
  ]);

  const mockClient = new Client({ name: 'sportwizzard-package-mock-smoke', version: '1.0.0' });
  const mockTransport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(entryArgument)],
    cwd: work,
    env: { SPORTWIZZARD_MOCK: '1' },
    stderr: 'pipe',
  });
  try {
    await mockClient.connect(mockTransport);
    for (const name of ['status', 'list_sportsbooks', 'list_markets']) {
      const response = payload(await mockClient.callTool({ name, arguments: {} }));
      for (const row of response.data) {
        assert(!('totalMarkets' in row));
        assert(!('marketCount' in row));
        assert(!('liveCount' in row));
      }
    }
  } finally {
    await mockClient.close();
  }

  // Exercise the remote MCP tool itself with a loopback CDN fixture. A hostile
  // save path must remain one literal output argument when the advertised
  // command is run by a POSIX shell.
  const snapshotServer = createServer((req, res) => {
    res.setHeader('Content-Length', '16');
    res.setHeader('ETag', '"remote-smoke"');
    if (req.method === 'HEAD') return res.end();
    res.end('fixture-snapshot');
  });
  await new Promise(resolveListen => snapshotServer.listen(0, '127.0.0.1', resolveListen));
  const oldFetch = globalThis.fetch;
  const oldSnapshotUrl = process.env.SPORTWIZZARD_SNAPSHOT_URL;
  const oldHistoryUrl = process.env.SPORTWIZZARD_SNAPSHOT_HISTORY_URL;
  const snapshotUrl = `http://127.0.0.1:${snapshotServer.address().port}/snapshot.json.gz`;
  process.env.SPORTWIZZARD_SNAPSHOT_URL = snapshotUrl;
  process.env.SPORTWIZZARD_SNAPSHOT_HISTORY_URL = snapshotUrl;
  const installedDist = dirname(resolve(entryArgument));
  const { buildServer } = await import(pathToFileURL(resolve(installedDist, 'server.js')));
  const { REMOTE_TOOLS } = await import(pathToFileURL(resolve(installedDist, 'tools.js')));
  const [remoteClientTransport, remoteServerTransport] = InMemoryTransport.createLinkedPair();
  const remoteClient = new Client({ name: 'remote-snapshot-smoke', version: '1.0.0' });
  const remoteServer = buildServer({ baseUrl, apiKey: '', mock: false }, REMOTE_TOOLS);
  try {
    await Promise.all([
      remoteClient.connect(remoteClientTransport),
      remoteServer.connect(remoteServerTransport),
    ]);
    const marker = join(work, 'command-was-injected');
    const hostilePath = join(work, "snapshot'; touch command-was-injected; #.json.gz");
    const remoteResult = payload(await remoteClient.callTool({ name: 'download_snapshot',
      arguments: { save_path: hostilePath } }));
    await execFileAsync('sh', ['-c', remoteResult.save_command], { cwd: work });
    assert.equal(await readFile(hostilePath, 'utf8'), 'fixture-snapshot');
    await assert.rejects(readFile(marker));
  } finally {
    await remoteClient.close();
    await remoteServer.close();
    globalThis.fetch = oldFetch;
    if (oldSnapshotUrl === undefined) delete process.env.SPORTWIZZARD_SNAPSHOT_URL;
    else process.env.SPORTWIZZARD_SNAPSHOT_URL = oldSnapshotUrl;
    if (oldHistoryUrl === undefined) delete process.env.SPORTWIZZARD_SNAPSHOT_HISTORY_URL;
    else process.env.SPORTWIZZARD_SNAPSHOT_HISTORY_URL = oldHistoryUrl;
    await new Promise(resolveClose => snapshotServer.close(resolveClose));
  }
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
