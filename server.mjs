import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createConsultationHandler} from './consultation-http.mjs';
import {submitConsultation} from './consultation.mjs';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const port = 4319;
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp'};

// --mock answers the way howardsdraperies.com/api/leads/ does instead of
// sending the lead, so the form can be tried without creating a GHL contact.
const mock = process.argv.includes('--mock');
const mockFetch = async (url, request) => {
  console.log(`[mock] Not sent to ${url}:`, JSON.parse(request.body));
  return Response.json({success: true, contactId: 'mock-contact'});
};
const handle = createConsultationHandler(mock
  ? (data, options) => submitConsultation(data, {...options, fetcher: mockFetch})
  : submitConsultation);

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/consultation') {
      const {host, ...headers} = req.headers;
      const hasBody = !['GET', 'HEAD'].includes(req.method);
      const request = new Request(url, {method: req.method, headers, body: hasBody ? Readable.toWeb(req) : undefined, duplex: 'half'});
      const response = await handle(request, {ip: req.socket.remoteAddress});
      res.writeHead(response.status, Object.fromEntries(response.headers));
      return res.end(Buffer.from(await response.arrayBuffer()));
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, {Allow: 'GET, HEAD'});
      return res.end();
    }
    const file = resolve(root, '.' + decodeURIComponent(url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname));
    if (!file.startsWith(resolve(root) + sep)) {
      res.writeHead(403);
      return res.end();
    }
    const content = await readFile(file);
    res.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(port, '127.0.0.1', () => console.log(`Howard’s landing page${mock ? ' (mock leads)' : ''}: http://localhost:${port}/`));
