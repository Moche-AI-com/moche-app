import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const root = process.cwd();
const portalSource = readFileSync(resolve(root, 'app/g/[slug]/portalStyles.ts'), 'utf8');
const portalCss = portalSource.match(/export const PORTAL_CSS = `([\s\S]*?)`;/)?.[1];
if (!portalCss) throw new Error('Portal CSS fixture could not be loaded');
const globalCss = readFileSync(resolve(root, 'app/globals.css'), 'utf8');
const portalOverrides = readFileSync(resolve(root, 'app/g/[slug]/portal-ux.css'), 'utf8');
const result = await build({
  stdin: { contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {HostChatWorkflow} from './app/g/[slug]/HostChatWorkflow';
    import {portalT} from './lib/guest/portal-strings';
    const noop = () => {};
    createRoot(document.getElementById('root')).render(
      <HostChatWorkflow slug="synthetic-villa" guestName="Synthetic Guest" t={portalT('en')}
        initialConversationId="40000000-0000-4000-8000-000000000001"
        initialMessageId="80000000-0000-4000-8000-000000000001"
        onBack={noop} onSessionExpired={noop}/>
    );
  `, resolveDir: root, loader: 'jsx' },
  write: false, bundle: true, platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  alias: { '@': root, react: resolve(root, 'node_modules/react'), 'react-dom': resolve(root, 'node_modules/react-dom') },
});
const js = result.outputFiles[0].contents;
createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/app.js') {
    response.setHeader('Content-Type', 'text/javascript'); response.end(js); return;
  }
  response.setHeader('Content-Type', 'text/html');
  if (request.url === '/portal-fixture') {
    response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${globalCss}</style><style>${portalCss}</style><style>${portalOverrides}</style></head><body><div class="gp-v2"><div class="gp-wrap"><div class="gp-step"><div style="height:640px">Portal content above cards</div><button id="open-card" class="gp-assist-card">Open question card</button><input id="portal-input" class="gp-input" value="Test text"><form class="gp-composer"><textarea id="portal-composer">Visible typed text</textarea></form><div id="card-dialog" class="gp-modal-backdrop" style="display:none"><div class="gp-modal" role="dialog" aria-modal="true" aria-label="Question card"><div class="gp-modal-head"><span>Question card</span><button id="close-card">Close</button></div><div class="gp-modal-body"><div style="height:700px">Long prompt list</div></div></div></div></div></div></div><script>document.getElementById('open-card').onclick=()=>document.getElementById('card-dialog').style.display='flex';document.getElementById('close-card').onclick=()=>document.getElementById('card-dialog').style.display='none';</script></body></html>`); return;
  }
  response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Messaging component fixture</title><style>body{font-family:system-ui;margin:16px;max-width:800px}input,textarea{box-sizing:border-box;max-width:100%}button{min-height:44px}.gp-label,.gp-consent{display:block;margin:12px 0}.gp-input{width:100%}.gp-card{border:1px solid #bbb;padding:16px}.gp-msg{padding:12px;border:1px solid #ddd}.gp-chat-panel{overflow:auto}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`);
}).listen(3220, '127.0.0.1');
