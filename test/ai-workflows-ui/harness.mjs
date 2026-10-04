// MOCK ONLY. Real client components, real browser forms, fake action/API boundary.
// This fixture does not load Next's server, .env files, auth, DB clients, or AI
// providers. Playwright owns every mock response; the HTTP server fails closed.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const entry = `
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AddKnowledgeClient } from './app/dashboard/properties/[id]/brain/add/AddKnowledgeClient';
import { EscalationAnswerForm } from './app/dashboard/escalations/[id]/EscalationAnswerForm';
import { MaintenanceWorkflow } from './app/g/[slug]/MaintenanceWorkflow';
import { ListingImportKickoff } from './app/dashboard/properties/[id]/ListingImportKickoff';
import { portalT } from './lib/guest/portal-strings';
import { PORTAL_CSS } from './app/g/[slug]/portalStyles';

const query = new URLSearchParams(location.search);
const workflow = query.get('workflow') || (location.pathname.startsWith('/dashboard/properties/') ? 'setup' : 'knowledge');
const propertyId = '11111111-1111-4111-8111-111111111111';
const noop = () => {};
const sections = [
  { value: 'space_details', label: 'Space details', blurb: 'Synthetic fixture section' },
  { value: 'house_rules', label: 'House rules', blurb: 'Synthetic fixture section' },
];
let component;
function SetupParent() {
  // Mirror PropertyDetailPage's documented ?import conditional mount. A
  // router.replace simulates server-page reconciliation; native replaceState
  // updates the URL without remounting this client subtree.
  const [listingUrl, setListingUrl] = useState(query.get('import'));
  useEffect(() => {
    const navigate = () => setListingUrl(new URLSearchParams(location.search).get('import'));
    window.addEventListener('mock-router-navigation', navigate);
    return () => window.removeEventListener('mock-router-navigation', navigate);
  }, []);
  return listingUrl
    ? <ListingImportKickoff propertyId={propertyId} listingUrl={listingUrl} />
    : <p>No pending listing import.</p>;
}
if (workflow === 'setup') {
  component = <SetupParent />;
} else if (workflow === 'escalation') {
  component = <EscalationAnswerForm
    escalationId="22222222-2222-4222-8222-222222222222"
    canTeachBrain={query.get('teach') !== '0'} />;
} else if (workflow === 'needs') {
  component = <div className="gp-v2 gp-light fixture-guest">
    <style>{PORTAL_CSS}</style>
    <MaintenanceWorkflow slug="synthetic-ai-workflow-villa" t={portalT('en')}
      onBack={noop} onSessionExpired={noop} />
  </div>;
} else {
  component = <AddKnowledgeClient propertyId={propertyId} sections={sections} features={[]} />;
}
createRoot(document.getElementById('root')).render(component);
`;

function mockAction(exportName, name) {
  return `
    export async function ${exportName}(_previous, formData) {
      const response = await fetch('/__mock/actions/${name}', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(formData.entries())),
      });
      if (!response.ok) throw new Error('MOCK ONLY: unconfigured action ${name}');
      return response.json();
    }
  `;
}

const mockedModules = new Map([
  [resolve(root, 'app/dashboard/properties/[id]/brain/actions'), mockAction('saveBrainItemAction', 'save')],
  [resolve(root, 'app/dashboard/properties/[id]/brain/add/improve-action'), mockAction('improveBrainDraftAction', 'improve')],
  [resolve(root, 'app/dashboard/escalations/actions'), mockAction('answerEscalationAction', 'answer')],
  ['next/navigation', `
    const router = {
      refresh() {},
      replace(path) {
        history.replaceState(null, '', path);
        window.dispatchEvent(new Event('mock-router-navigation'));
      },
    };
    export function useRouter() { return router; }
  `],
  ['next/link', `
    import React from 'react';
    export default function Link({ href, children, ...props }) {
      return React.createElement('a', { href, ...props }, children);
    }
  `],
]);

const result = await build({
  stdin: { contents: entry, resolveDir: root, loader: 'jsx' },
  write: false,
  bundle: true,
  platform: 'browser',
  jsx: 'automatic',
  // Same React version Next uses for App Router and the local-recs-ui fixture.
  // Root React 18 lacks useActionState, which AddKnowledgeClient actually uses.
  define: { 'process.env.NODE_ENV': '"development"' },
  alias: {
    '@': root,
    react: resolve(root, 'node_modules/next/dist/compiled/react'),
    'react-dom': resolve(root, 'node_modules/next/dist/compiled/react-dom'),
  },
  plugins: [{
    name: 'offline-action-boundary',
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        const path = args.path.startsWith('.')
          ? resolve(dirname(args.importer || resolve(root, 'entry.jsx')), args.path)
          : args.path;
        if (mockedModules.has(path)) return { path, namespace: 'mock-only' };
        if (/^(?:server-only|next\/(?:server|headers|cache)|@supabase\/|@sentry\/)/.test(args.path)) {
          return { errors: [{ text: `MOCK ONLY: forbidden server/provider import ${args.path}` }] };
        }
        return undefined;
      });
      builder.onLoad({ filter: /.*/, namespace: 'mock-only' }, args => ({
        contents: mockedModules.get(args.path),
        loader: 'js',
        resolveDir: root,
      }));
      builder.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async args => {
        if (args.path.includes('/node_modules/')) return undefined;
        const contents = await readFile(args.path, 'utf8');
        if (/^\s*['"]use server['"]\s*;/m.test(contents)) {
          return { errors: [{ text: `MOCK ONLY: server action was not replaced: ${args.path}` }] };
        }
        return undefined;
      });
    },
  }],
});
const js = result.outputFiles[0].contents;
// Use actual component classes/tokens, without Next, remote fonts, or a generated
// Tailwind build. This is behavior coverage, not a production visual baseline.
const css = (await readFile(resolve(root, 'app/globals.css'), 'utf8'))
  .replace(/^@tailwind .*;\s*$/gm, '');

createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1:3221').pathname;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'");
  if (request.method === 'GET' && path === '/app.js') {
    response.setHeader('Content-Type', 'text/javascript');
    return response.end(js);
  }
  if (request.method === 'GET' && path === '/app.css') {
    response.setHeader('Content-Type', 'text/css');
    return response.end(css);
  }
  if (request.method === 'GET' && path === '/favicon.ico') {
    response.writeHead(204);
    return response.end();
  }
  if (request.method !== 'GET' || !['/', '/dashboard/properties/11111111-1111-4111-8111-111111111111'].includes(path)) {
    response.writeHead(503, { 'Content-Type': 'application/json' });
    return response.end(JSON.stringify({ error: 'MOCK ONLY: Playwright must intercept this request.' }));
  }
  response.setHeader('Content-Type', 'text/html');
  response.end(`<!doctype html><html lang="en"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Mock-only AI workflow component checks</title><link rel="stylesheet" href="/app.css">
    <style>
      *, ::before, ::after { box-sizing: border-box; }
      body { margin: 20px auto; padding: 0 16px; max-width: 900px; }
      .fixture-banner { margin-bottom: 18px; padding: 12px; border: 2px dashed #8e611d; background: #fff8e8; color: #63410d; font-size: 14px; }
      .fixture-guest { padding: 18px; border-radius: 14px; min-height: 500px; }
    </style>
    </head><body><header class="fixture-banner">MOCK ONLY — offline AI workflow component checks</header>
    <main id="root"></main><script src="/app.js"></script></body></html>`);
}).listen(3221, '127.0.0.1', () => {
  console.log('MOCK ONLY AI workflow fixture listening on http://127.0.0.1:3221');
});
