import { z } from 'zod';

// POC scope: exactly three node types. `wifi` is filed under the `core` brain
// category; `checkin` / `checkout` under `checkin_checkout`.
export const NODE_TYPES = ['wifi', 'checkin', 'checkout'] as const;
export type NodeType = (typeof NODE_TYPES)[number];

// Every field is nullable+optional so a partial extraction still validates; a
// per-schema refinement then rejects an entirely empty object (nothing useful
// was extracted → treat as a normalizer failure and skip).
const nz = () => z.string().trim().min(1).nullable().optional();

export const wifiSchema = z
  .object({
    network_name: nz(),
    password: nz(),
    instructions: nz(),
    notes: nz(),
  })
  .strip()
  .refine((d) => Boolean(d.network_name || d.password || d.instructions), {
    message: 'wifi node requires at least a network name, password, or instructions',
  });

export const checkinSchema = z
  .object({
    time: nz(),
    method: nz(),
    access_code: nz(),
    location: nz(),
    instructions: nz(),
    notes: nz(),
  })
  .strip()
  .refine((d) => Boolean(d.time || d.method || d.access_code || d.instructions), {
    message: 'checkin node requires at least a time, method, access code, or instructions',
  });

export const checkoutSchema = z
  .object({
    time: nz(),
    instructions: nz(),
    tasks: z.array(z.string().trim().min(1)).nullable().optional(),
    key_return: nz(),
    notes: nz(),
  })
  .strip()
  .refine((d) => Boolean(d.time || d.instructions || (d.tasks && d.tasks.length > 0)), {
    message: 'checkout node requires at least a time, instructions, or tasks',
  });

export type WifiNode = z.infer<typeof wifiSchema>;
export type CheckinNode = z.infer<typeof checkinSchema>;
export type CheckoutNode = z.infer<typeof checkoutSchema>;

export const schemaFor: Record<NodeType, z.ZodTypeAny> = {
  wifi: wifiSchema,
  checkin: checkinSchema,
  checkout: checkoutSchema,
};

// Render the validated structured payload into the canonical text that gets
// embedded and later shown to the concierge as authoritative context.
export function renderContent(nodeType: NodeType, data: Record<string, unknown>): string {
  const lines: string[] = [];
  const add = (label: string, v: unknown) => {
    if (typeof v === 'string' && v.trim()) lines.push(`${label}: ${v.trim()}`);
  };
  if (nodeType === 'wifi') {
    add('WiFi network', data.network_name);
    add('WiFi password', data.password);
    add('Connection instructions', data.instructions);
    add('Notes', data.notes);
  } else if (nodeType === 'checkin') {
    add('Check-in time', data.time);
    add('Access method', data.method);
    add('Access code', data.access_code);
    add('Location', data.location);
    add('Instructions', data.instructions);
    add('Notes', data.notes);
  } else {
    add('Check-out time', data.time);
    add('Instructions', data.instructions);
    if (Array.isArray(data.tasks) && data.tasks.length > 0) {
      lines.push(`Checkout tasks: ${(data.tasks as string[]).join('; ')}`);
    }
    add('Key return', data.key_return);
    add('Notes', data.notes);
  }
  return lines.join('\n');
}
