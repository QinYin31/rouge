// 开发服务器:禁用一切缓存,保证改完代码刷新即生效
// 用法: node tools/dev-server.mjs [端口](默认 9001)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const root = process.cwd();
const port = Number(process.argv[2]) || 9001;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const data = await readFile(join(root, p));
    res.writeHead(200, {
      'Content-Type': types[extname(p)] || 'application/octet-stream',
      'Cache-Control': 'no-store, must-revalidate',
      'Expires': '0',
      'Vary': '*',
    });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('404');
  }
}).listen(port, () => console.log(`dev server: http://localhost:${port}`));
