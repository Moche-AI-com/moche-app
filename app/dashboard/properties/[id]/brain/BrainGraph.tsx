'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Home,
  ShieldAlert,
  Scale,
  Wrench,
  MapPin,
  LifeBuoy,
  Car,
  FileText,
  Link2,
  MessageCircleQuestion,
  StickyNote,
  Boxes,
  Lock,
  FileType2,
  Globe,
  X,
  Pencil,
} from 'lucide-react';

// --------------------------------------------------------------------------
// Obsidian-style knowledge graph for the Property Brain.
// Nodes = brain items, grouped around a hub node per category. Items in the
// same category are "connected"; hovering a node highlights it + everything it
// connects to; clicking a node opens it in the editor (deep-links via ?edit=).
// Pure SVG + a tiny hand-rolled force sim — no external graph library.
// --------------------------------------------------------------------------

export interface GraphItem {
  id: string;
  title: string;
  category: string;
  visibility: string;
  status: string;
  sourceType: string;
  bodyPreview: string;
}

interface SimNode {
  id: string;
  kind: 'category' | 'item';
  label: string;
  category: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  item?: GraphItem;
}

interface SimEdge {
  a: string;
  b: string;
}

// Category accent colors — tuned to the app's teal/iris/coral palette.
const CAT_COLOR: Record<string, string> = {
  core: '#33e6d4',
  appliances: '#7c9cff',
  house_rules: '#ff8f6b',
  checkin_checkout: '#5ad1a8',
  local_recommendations: '#c9a96e',
  emergency: '#ff6b6b',
  documents: '#9b8cff',
  product_urls: '#5ec8ff',
  host_qa: '#ffd166',
  internal_notes: '#8a94a6',
  transportation: '#6ee7ff',
};

function catColor(cat: string): string {
  return CAT_COLOR[cat] ?? '#7c9cff';
}

function CategoryIcon({ category, size = 15, color }: { category: string; size?: number; color: string }) {
  const common = { size, color, strokeWidth: 2.2 } as const;
  switch (category) {
    case 'core': return <Home {...common} />;
    case 'appliances': return <Wrench {...common} />;
    case 'house_rules': return <Scale {...common} />;
    case 'checkin_checkout': return <Lock {...common} />;
    case 'local_recommendations': return <MapPin {...common} />;
    case 'emergency': return <ShieldAlert {...common} />;
    case 'documents': return <FileText {...common} />;
    case 'product_urls': return <Link2 {...common} />;
    case 'host_qa': return <MessageCircleQuestion {...common} />;
    case 'internal_notes': return <StickyNote {...common} />;
    case 'transportation': return <Car {...common} />;
    default: return <Boxes {...common} />;
  }
}

function SourceIcon({ sourceType, size = 13, color }: { sourceType: string; size?: number; color: string }) {
  const common = { size, color, strokeWidth: 2 } as const;
  if (sourceType === 'url') return <Globe {...common} />;
  if (sourceType === 'document') return <FileType2 {...common} />;
  return null;
}

export function BrainGraph({
  propertyId,
  items,
  categoryLabels,
  canEdit,
}: {
  propertyId: string;
  items: GraphItem[];
  categoryLabels: Record<string, string>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 560 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<SimNode | null>(null);
  const rafRef = useRef<number | null>(null);

  // Responsive canvas sizing.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      const w = Math.max(320, cr.width);
      // Taller on mobile (portrait) so nodes aren't cramped; shorter on wide.
      const h = w < 560 ? Math.round(w * 1.15) : Math.max(440, Math.round(w * 0.62));
      setSize({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build the node/edge model from items grouped by category.
  const { nodes, edges, categories } = useMemo(() => {
    const byCat = new Map<string, GraphItem[]>();
    for (const it of items) {
      if (!byCat.has(it.category)) byCat.set(it.category, []);
      byCat.get(it.category)!.push(it);
    }
    const cats = Array.from(byCat.keys());
    const nodes: SimNode[] = [];
    const edges: SimEdge[] = [];
    const cx = size.w / 2;
    const cy = size.h / 2;
    const ringR = Math.min(size.w, size.h) * 0.32;

    cats.forEach((cat, ci) => {
      const angle = (ci / Math.max(1, cats.length)) * Math.PI * 2 - Math.PI / 2;
      const hubX = cx + Math.cos(angle) * ringR;
      const hubY = cy + Math.sin(angle) * ringR;
      const hubId = `cat:${cat}`;
      nodes.push({
        id: hubId,
        kind: 'category',
        label: categoryLabels[cat] ?? cat,
        category: cat,
        x: hubX,
        y: hubY,
        vx: 0,
        vy: 0,
        r: 20,
      });
      const catItems = byCat.get(cat)!;
      catItems.forEach((it, ii) => {
        const spread = (ii / Math.max(1, catItems.length)) * Math.PI * 2;
        const itemR = 46 + (ii % 3) * 14;
        nodes.push({
          id: it.id,
          kind: 'item',
          label: it.title,
          category: cat,
          x: hubX + Math.cos(spread) * itemR,
          y: hubY + Math.sin(spread) * itemR,
          vx: 0,
          vy: 0,
          r: 9,
          item: it,
        });
        // Connect item to its category hub.
        edges.push({ a: hubId, b: it.id });
      });
    });
    return { nodes, edges, categories: cats };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, categoryLabels, size.w, size.h]);

  // Keep a mutable copy the sim mutates; re-seeded whenever the model changes.
  const simRef = useRef<SimNode[]>([]);
  const [, forceRender] = useState(0);

  useEffect(() => {
    simRef.current = nodes.map((n) => ({ ...n }));
    const sim = simRef.current;
    const byId = new Map(sim.map((n) => [n.id, n]));
    const cx = size.w / 2;
    const cy = size.h / 2;

    let ticks = 0;
    const MAX_TICKS = 260;

    const step = () => {
      ticks++;
      // Repulsion between all nodes.
      for (let i = 0; i < sim.length; i++) {
        for (let j = i + 1; j < sim.length; j++) {
          const a = sim[i];
          const b = sim[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) { d2 = 0.01; dx = Math.random(); dy = Math.random(); }
          const d = Math.sqrt(d2);
          const rep = (a.kind === 'category' || b.kind === 'category' ? 2600 : 1100) / d2;
          const fx = (dx / d) * rep;
          const fy = (dy / d) * rep;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }
      // Spring along edges (item ↔ hub).
      for (const e of edges) {
        const a = byId.get(e.a); const b = byId.get(e.b);
        if (!a || !b) continue;
        const dx = b.x - a.x; const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const target = 60;
        const k = 0.02 * (d - target);
        const fx = (dx / d) * k; const fy = (dy / d) * k;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
      // Gentle pull to center + damping + integrate.
      for (const n of sim) {
        n.vx += (cx - n.x) * 0.0015;
        n.vy += (cy - n.y) * 0.0015;
        n.vx *= 0.86; n.vy *= 0.86;
        n.x += n.vx; n.y += n.vy;
        // Keep inside the canvas with padding.
        const pad = n.r + 8;
        n.x = Math.max(pad, Math.min(size.w - pad, n.x));
        n.y = Math.max(pad, Math.min(size.h - pad, n.y));
      }
      forceRender((v) => (v + 1) % 1000000);
      if (ticks < MAX_TICKS) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, size.w, size.h]);

  const sim = simRef.current.length ? simRef.current : nodes;
  const byId = useMemo(() => new Map(sim.map((n) => [n.id, n])), [sim]);

  // Which node ids are "active" (hovered node + its neighbors) for highlighting.
  const activeIds = useMemo(() => {
    if (!hovered) return null;
    const set = new Set<string>([hovered]);
    for (const e of edges) {
      if (e.a === hovered) set.add(e.b);
      if (e.b === hovered) set.add(e.a);
    }
    return set;
  }, [hovered, edges]);

  const hoveredNode = hovered ? byId.get(hovered) : null;
  const neighbors = useMemo(() => {
    if (!hoveredNode) return [];
    const ids = new Set<string>();
    for (const e of edges) {
      if (e.a === hoveredNode.id) ids.add(e.b);
      if (e.b === hoveredNode.id) ids.add(e.a);
    }
    return Array.from(ids).map((id) => byId.get(id)).filter(Boolean) as SimNode[];
  }, [hoveredNode, edges, byId]);

  function openEditor(node: SimNode) {
    if (node.kind === 'item') {
      // Deep-link to the editor list scrolled/opened on this item.
      router.push(`/dashboard/properties/${propertyId}/brain?edit=${node.item!.id}#brain-editor`);
    } else {
      router.push(`/dashboard/properties/${propertyId}/brain?card=${categoryToCardHint(node.category)}#brain-editor`);
    }
  }

  if (items.length === 0) {
    return (
      <div className="card" style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }} data-testid="brain-graph-empty">
        <Boxes size={34} color="var(--text-faint)" style={{ margin: '0 auto .75rem' }} />
        <p className="muted" style={{ marginBottom: '.25rem' }}>Your Brain graph is empty.</p>
        <p className="faint" style={{ fontSize: '.82rem' }}>Add knowledge below and it will appear here as connected nodes.</p>
      </div>
    );
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }} data-testid="brain-graph">
      <svg
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${size.w} ${size.h}`}
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          borderRadius: 'var(--radius-lg, 16px)',
          background: 'radial-gradient(120% 120% at 50% 0%, rgba(51,230,212,.05), rgba(14,24,38,0) 60%), var(--surface-2, #0e1826)',
          border: '1px solid var(--border)',
          touchAction: 'manipulation',
        }}
        onMouseLeave={() => setHovered(null)}
        role="img"
        aria-label="Property Brain knowledge graph"
      >
        {/* Edges */}
        <g>
          {edges.map((e, i) => {
            const a = byId.get(e.a); const b = byId.get(e.b);
            if (!a || !b) return null;
            const active = !activeIds || (activeIds.has(e.a) && activeIds.has(e.b));
            return (
              <line
                key={i}
                className="brain-graph-edge"
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={catColor(a.kind === 'category' ? a.category : b.category)}
                strokeOpacity={activeIds ? (active ? 0.6 : 0.06) : 0.22}
                strokeWidth={active && activeIds ? 1.8 : 1}
                style={{ transition: 'stroke-opacity .18s ease, stroke-width .18s ease' }}
              />
            );
          })}
        </g>

        {/* Nodes */}
        <g>
          {sim.map((n) => {
            const isActive = !activeIds || activeIds.has(n.id);
            const color = catColor(n.category);
            const dim = activeIds && !isActive;
            return (
              <g
                key={n.id}
                className="brain-graph-node"
                transform={`translate(${n.x}, ${n.y})`}
                style={{ cursor: 'pointer', transition: 'opacity .18s ease' }}
                opacity={dim ? 0.28 : 1}
                onMouseEnter={() => setHovered(n.id)}
                onClick={() => setSelected(n)}
                data-testid={n.kind === 'category' ? `graph-cat-${n.category}` : `graph-item-${n.id}`}
              >
                {n.kind === 'category' ? (
                  <>
                    <circle r={n.r + (hovered === n.id ? 3 : 0)} fill={color} fillOpacity={0.16} stroke={color} strokeWidth={1.6} style={{ transition: 'r .18s ease' }} />
                    <circle r={n.r - 6} fill="var(--surface, #0b1420)" />
                  </>
                ) : (
                  <>
                    {hovered === n.id && <circle r={n.r + 6} fill={color} fillOpacity={0.18} />}
                    <circle
                      r={n.r + (hovered === n.id ? 2 : 0)}
                      fill={color}
                      fillOpacity={n.item?.visibility === 'internal' ? 0.35 : 0.9}
                      stroke={n.item?.status === 'failed' ? '#ff6b6b' : color}
                      strokeWidth={n.item?.status === 'failed' ? 2 : 1}
                      strokeDasharray={n.item?.visibility === 'internal' ? '3 2' : undefined}
                      style={{ transition: 'r .18s ease' }}
                    />
                  </>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Category icons + labels overlaid (crisp lucide icons on hub nodes) */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {sim.filter((n) => n.kind === 'category').map((n) => {
          const isActive = !activeIds || activeIds.has(n.id);
          const px = (n.x / size.w) * 100;
          const py = (n.y / size.h) * 100;
          return (
            <div
              key={n.id}
              style={{
                position: 'absolute',
                left: `${px}%`,
                top: `${py}%`,
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                opacity: activeIds && !isActive ? 0.3 : 1,
                transition: 'opacity .18s ease',
              }}
            >
              <CategoryIcon category={n.category} color={catColor(n.category)} />
            </div>
          );
        })}
      </div>

      {/* Hover tooltip — the section + what it connects to */}
      {hoveredNode && (
        <div
          className="card"
          style={{
            position: 'absolute',
            left: `${Math.min(78, (hoveredNode.x / size.w) * 100)}%`,
            top: `${Math.min(80, (hoveredNode.y / size.h) * 100 + 3)}%`,
            padding: '.7rem .85rem',
            maxWidth: 260,
            pointerEvents: 'none',
            zIndex: 5,
            boxShadow: '0 18px 40px -18px rgba(0,0,0,.7)',
          }}
          data-testid="graph-tooltip"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '.3rem' }}>
            <CategoryIcon category={hoveredNode.category} size={14} color={catColor(hoveredNode.category)} />
            <strong style={{ fontSize: '.85rem' }}>{hoveredNode.label}</strong>
          </div>
          {hoveredNode.kind === 'item' ? (
            <>
              <div className="faint" style={{ fontSize: '.72rem', marginBottom: '.35rem' }}>
                {categoryLabels[hoveredNode.category] ?? hoveredNode.category}
                {hoveredNode.item?.visibility === 'internal' && ' · host-only'}
              </div>
              {hoveredNode.item?.bodyPreview && (
                <p className="muted" style={{ fontSize: '.75rem', lineHeight: 1.35 }}>
                  {hoveredNode.item.bodyPreview}{hoveredNode.item.bodyPreview.length >= 160 ? '…' : ''}
                </p>
              )}
            </>
          ) : (
            <div className="faint" style={{ fontSize: '.73rem' }}>
              {neighbors.length} item{neighbors.length === 1 ? '' : 's'} connected in this section.
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', marginTop: '.75rem' }}>
        {categories.map((cat) => (
          <span
            key={cat}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '.35rem',
              fontSize: '.72rem', color: 'var(--text-muted, #b7c0cc)',
              background: 'var(--surface-2, rgba(255,255,255,.04))',
              border: '1px solid var(--border)', borderRadius: 999, padding: '.2rem .55rem',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: catColor(cat) }} />
            {categoryLabels[cat] ?? cat}
          </span>
        ))}
      </div>

      {/* Selection panel — click a node to view + edit */}
      {selected && (
        <div
          className="card"
          style={{
            position: 'absolute', right: 12, top: 12, width: 'min(300px, 82%)',
            padding: '1rem', zIndex: 8, boxShadow: '0 24px 60px -20px rgba(0,0,0,.75)',
          }}
          data-testid="graph-selection-panel"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem', minWidth: 0 }}>
              <CategoryIcon category={selected.category} size={16} color={catColor(selected.category)} />
              <strong style={{ fontSize: '.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.label}</strong>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="btn btn-ghost btn-sm"
              style={{ padding: '.2rem', lineHeight: 0, flexShrink: 0 }}
              aria-label="Close"
              data-testid="graph-selection-close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="faint" style={{ fontSize: '.73rem', margin: '.4rem 0 .6rem' }}>
            {categoryLabels[selected.category] ?? selected.category}
            {selected.kind === 'item' && selected.item?.visibility === 'internal' && ' · host-only'}
          </div>

          {selected.kind === 'item' && selected.item?.bodyPreview && (
            <p className="muted" style={{ fontSize: '.8rem', lineHeight: 1.4, marginBottom: '.75rem' }}>
              {selected.item.bodyPreview}{selected.item.bodyPreview.length >= 160 ? '…' : ''}
            </p>
          )}

          {selected.kind === 'item' && (
            <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', marginBottom: '.75rem', flexWrap: 'wrap' }}>
              <SourceIcon sourceType={selected.item!.sourceType} color={catColor(selected.category)} />
              {selected.item!.status === 'failed' && <span className="badge badge-coral">index failed</span>}
              {selected.item!.status === 'processing' && <span className="badge">processing…</span>}
            </div>
          )}

          {canEdit ? (
            <button
              type="button"
              className="btn btn-primary btn-sm btn-block"
              onClick={() => openEditor(selected)}
              data-testid="graph-selection-edit"
            >
              <Pencil size={14} style={{ marginRight: '.35rem' }} />
              {selected.kind === 'item' ? 'Edit this item' : 'Edit this section'}
            </button>
          ) : (
            <Link
              href={`/dashboard/properties/${propertyId}/brain?card=${categoryToCardHint(selected.category)}#brain-editor`}
              className="btn btn-ghost btn-sm btn-block"
            >
              View section
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// Map a brain category to the closest builder-card key so the editor filter
// opens a sensible scope when a category hub is edited.
function categoryToCardHint(cat: string): string {
  switch (cat) {
    case 'core': return 'core';
    case 'emergency': return 'safety';
    case 'house_rules': return 'rules';
    case 'checkin_checkout': return 'home';
    case 'appliances': return 'appliances';
    case 'local_recommendations': return 'local';
    case 'transportation': return 'transportation';
    default: return 'core';
  }
}
