/** Deterministic safety classifier: no model call decides this boundary. */
const LICENSED_TECHNICIAN_PATTERNS = [
  /licensed (?:technician|electrician|plumber|gas fitter|contractor)/i,
  /qualified (?:technician|electrician|service (?:person|engineer))/i,
  /do not (?:service|repair|disassemble|remove) (?:this|the)/i,
  /gas (?:line|leak|connection|supply|valve)/i,
  /high voltage|electrical panel|live electrical/i,
  /refrigerant|sealed system|compressor/i,
  /water heater.*vent|vent.*water heater/i,
  /structural|load[- ]bearing/i,
  /combustion|carbon monoxide|pilot light/i,
] as const;

export function requiresLicensedTechnician(text: string): boolean {
  return LICENSED_TECHNICIAN_PATTERNS.some((pattern) => pattern.test(text));
}

export interface ManualSectionDraft {
  sectionTitle: string;
  body: string;
  pageRef: string | null;
  requiresLicensedTechnician: boolean;
}

/** Extract only headings and their text from a host-confirmed manual. */
export function segmentApplianceManual(text: string, sourceUrl: string): ManualSectionDraft[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const chunks = normalized.split(/\n(?=#{1,4}\s+)/);
  const sections = chunks.map((chunk, index) => {
    const heading = chunk.match(/^#{1,4}\s+(.+?)(?:\n|$)/)?.[1]?.trim();
    const body = (heading ? chunk.replace(/^#{1,4}\s+.+?(?:\n|$)/, '') : chunk).trim().slice(0, 30000);
    const sectionTitle = (heading || `Manual excerpt ${index + 1}`).slice(0, 240);
    return { sectionTitle, body, pageRef: sourceUrl, requiresLicensedTechnician: requiresLicensedTechnician(`${sectionTitle}\n${body}`) };
  }).filter((section) => section.body.length >= 20).slice(0, 40);
  return sections.length > 0 ? sections : [{ sectionTitle: 'Manual excerpt', body: normalized.slice(0, 30000), pageRef: sourceUrl, requiresLicensedTechnician: requiresLicensedTechnician(normalized) }];
}
