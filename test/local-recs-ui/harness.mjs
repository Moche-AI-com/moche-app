// Isolated browser fixture: real Local Recs components, fake providers/actions.
// Never reads production env or connects to Supabase/Mapbox.
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const entry = `
import React, {useState, useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {LocalWorkspace} from './app/dashboard/properties/[id]/local/LocalWorkspace';
const center={lat:27.5,lng:-82.4};
class Map {
  constructor(opts) {
    if(new URLSearchParams(location.search).has('mapFail')) throw Error('Unavailable');
    this.container=opts.container; this.handlers={}; this.center=center;
    this.container.style.background='#dce8e4';
    this.container.addEventListener('click',originalEvent=>this.handlers.click?.({originalEvent,lngLat:{lat:27.51,lng:-82.39}}));
    setTimeout(()=>this.handlers.load?.(),10);
  }
  on(name,cb){this.handlers[name]=cb} addControl(){} fitBounds(){} resize(){}
  getCenter(){return this.center} flyTo(opts){this.center={lat:opts.center[1],lng:opts.center[0]}}
  remove(){this.container.replaceChildren()}
}
class Marker {
  constructor(){this.el=document.createElement('button'); this.el.className='mapboxgl-marker';this.el.type='button';this.el.textContent='Pin'}
  setLngLat(v){this.el.dataset.coords=v.join(',');return this}
  setPopup(v){this.el.title=v.content.textContent;return this}
  addTo(map){map.container.appendChild(this.el);return this}
  getElement(){return this.el} remove(){this.el.remove()}
}
class Popup{setDOMContent(content){this.content=content;return this}}
window.mapboxgl={Map,Marker,Popup,NavigationControl:class{}};
const initial=[{recommendationId:'saved',name:'Saved Cafe',category:'cafe',address:'1 Main',provider:'manual',
lat:27.501,lng:-82.401,status:'hidden',hostNote:'Original note',tags:[],intentTags:[],isFavorite:false,lastRefreshedAt:'2026-09-08',distanceMiles:0.2}];
function App(){
 const [places,setPlaces]=useState(initial);
 useEffect(()=>{
   const save=e=>setPlaces(list=>list.some(p=>p.recommendationId===e.detail.recommendationId)
     ?list.map(p=>p.recommendationId===e.detail.recommendationId?e.detail:p):[...list,e.detail]);
   window.addEventListener('fixture-save',save);return()=>window.removeEventListener('fixture-save',save);
 },[]);
 return <LocalWorkspace propertyId="11111111-1111-4111-8111-111111111111" center={center} places={places} canEdit />;
}
createRoot(document.getElementById('root')).render(<App/>);
`;
const actions = `
import {localPlaceSchema} from '@/lib/local/validation';
async function save(prev,fd){
 await new Promise(resolve=>setTimeout(resolve,100));
 const fields=Object.fromEntries(fd);delete fields.propertyId;delete fields.recommendationId;
 const parsed=localPlaceSchema.safeParse(fields);
 if(!parsed.success)return {error:parsed.error.issues[0].message};
 if(parsed.data.name==='Fail save')return {error:'Could not save the place. Please try again.'};
 window.dispatchEvent(new CustomEvent('fixture-save',{detail:{...parsed.data,recommendationId:fd.get('recommendationId')??'created',provider:'manual',distanceMiles:0.1,lastRefreshedAt:'2026-09-08'}}));
 return {ok:true,message:'Place saved.'};
}
export const addManualLocalPlaceAction=save,updateLocalPlaceAction=save;
export async function refreshLocalPlacesAction(){return {ok:true,found:0}}
`;
const result = await build({
  stdin: { contents: entry, resolveDir: root, loader: 'jsx' },
  write: false, bundle: true, platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"', 'process.env.NEXT_PUBLIC_MAPBOX_TOKEN': '"pk.fixture-not-a-credential"' },
  alias: { '@': root, react: resolve(root, 'node_modules/next/dist/compiled/react'), 'react-dom': resolve(root, 'node_modules/next/dist/compiled/react-dom') },
  plugins: [{ name: 'fake-actions', setup(builder) {
    builder.onResolve({ filter: /^\.\/actions$/ }, (args) => args.importer.includes('/local/') ? { path: 'actions', namespace: 'fixture' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: actions, resolveDir: root }));
  } }],
});
const js = result.outputFiles[0].contents;
createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/app.js') {
    response.setHeader('Content-Type', 'text/javascript'); response.end(js);
  } else {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Local Recs test</title><style>body{font-family:system-ui;margin:20px;max-width:900px}input,select,textarea{box-sizing:border-box;max-width:100%}.label{display:block}.input{width:100%}button{min-height:44px}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  }
}).listen(3219, '127.0.0.1');
