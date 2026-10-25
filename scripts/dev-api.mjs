// Node 22 — runs the Netlify function handlers on :8888 for local dev (what `netlify dev` would do)
import http from 'node:http';
import api from '../netlify/functions/api.mjs';
import tick from '../netlify/functions/tick.mjs';

const PORT = Number(process.env.API_PORT || 8888);

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://localhost:${PORT}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
  });
  const response = await api(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, () => console.log(`[dev-api] :${PORT}`));

void tick();
setInterval(() => void tick(), 60_000);
