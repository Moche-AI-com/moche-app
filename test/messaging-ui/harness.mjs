// Actual guest components with no server actions, production env or providers.
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
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
    response.setHeader('Content-Type', 'text/javascript'); response.end(js);
  } else {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Messaging component fixture</title>
    <style>body{font-family:system-ui;margin:16px;max-width:800px}input,textarea{box-sizing:border-box;max-width:100%}button{min-height:44px}.gp-label,.gp-consent{display:block;margin:12px 0}.gp-input{width:100%}.gp-card{border:1px solid #bbb;padding:16px}.gp-msg{padding:12px;border:1px solid #ddd}.gp-chat-panel{overflow:auto}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}</style>
    </head><body><div id="root"></div><script src="/app.js"></script></body></html>`);
  }
}).listen(3220, '127.0.0.1');
