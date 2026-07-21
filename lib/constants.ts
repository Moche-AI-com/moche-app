import type { Database } from '@/lib/database.types';

export type BrainCategory = Database['public']['Enums']['brain_category'];
export type PlanId = 'starter' | 'growth' | 'portfolio';
export type BillingInterval = 'monthly' | 'annual';

export interface Plan {
  id: PlanId;
  name: string;
  monthly: number; // USD/mo
  annual: number; // USD/yr (2 months free)
  propertyLimit: number;
  whiteLabel: boolean;
  reviewNudge: boolean;
  smsEscalation: boolean;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    monthly: 17,
    annual: 170,
    propertyLimit: 1,
    whiteLabel: false,
    reviewNudge: false,
    smsEscalation: false,
    features: [
      'Full AI guest portal',
      'QR code + shareable link',
      'Document & URL ingestion',
      'Multi-language support',
      'Email escalation',
    ],
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    monthly: 40,
    annual: 400,
    propertyLimit: 3,
    whiteLabel: false,
    reviewNudge: false,
    smsEscalation: true,
    features: [
      'Everything in Starter',
      'Property cloning',
      'Co-host mode',
      'SMS escalation',
      'Brain Health analytics',
      'Maintenance flag routing',
    ],
  },
  portfolio: {
    id: 'portfolio',
    name: 'Portfolio',
    monthly: 59,
    annual: 590,
    propertyLimit: 5,
    whiteLabel: true,
    reviewNudge: true,
    smsEscalation: true,
    features: [
      'Everything in Growth',
      'White-label branding',
      'Post-stay review nudge',
      'Priority support',
    ],
  },
};

export const ACTIVATION_FEE_USD = 25;

// Categories required for the "core" completeness gate — the portal can only go
// live once these are present. Mirrors the Brain Health "Core layer".
export const CORE_REQUIRED_CATEGORIES: BrainCategory[] = [
  'core',
  'checkin_checkout',
  'house_rules',
];

// Weighted categories for Brain Health scoring across the full knowledge base.
export const BRAIN_HEALTH_WEIGHTS: Record<BrainCategory, number> = {
  core: 20,
  checkin_checkout: 15,
  house_rules: 10,
  appliances: 15,
  local_recommendations: 10,
  emergency: 10,
  transportation: 8,
  documents: 5,
  product_urls: 5,
  host_qa: 5,
  internal_notes: 5,
};

export const BRAIN_CATEGORY_LABELS: Record<BrainCategory, string> = {
  core: 'Core (WiFi, parking, essentials)',
  checkin_checkout: 'Check-in / Check-out',
  house_rules: 'House Rules',
  appliances: 'Appliances & Devices',
  local_recommendations: 'Local Recommendations',
  transportation: 'Transportation & Getting Around',
  emergency: 'Emergency Info',
  documents: 'Documents',
  product_urls: 'Product URLs',
  host_qa: 'Host Q&A',
  internal_notes: 'Internal Notes (host-only)',
};

export interface QuickAction {
  key: string;
  label: string;
  question: string;
  emoji: string;
}

export const GUEST_QUICK_ACTIONS: QuickAction[] = [
  { key: 'wifi', label: 'WiFi', question: 'What is the WiFi network and password?', emoji: '📶' },
  { key: 'checkin', label: 'Check-in', question: 'What is the check-in process and time?', emoji: '🔑' },
  { key: 'checkout', label: 'Check-out', question: 'What is the check-out process and time?', emoji: '🧳' },
  { key: 'parking', label: 'Parking', question: 'Where can I park?', emoji: '🅿️' },
  { key: 'rules', label: 'House Rules', question: 'What are the house rules?', emoji: '📋' },
  { key: 'local', label: 'Local Tips', question: 'What do you recommend nearby?', emoji: '📍' },
];

// Default property_settings.modules shape.
export interface PropertyModules {
  chat: boolean;
  quick_actions: boolean;
  local_recs: boolean;
  maintenance_reports: boolean;
  review_nudge: boolean;
  upsell: boolean;
}

export const DEFAULT_MODULES: PropertyModules = {
  chat: true,
  quick_actions: true,
  local_recs: true,
  maintenance_reports: true,
  review_nudge: false,
  upsell: false,
};

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.55;
export const DEFAULT_GRACE_PERIOD_HOURS = 24;

// Guest verification tuning.
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const VERIFY_MAX_PER_CONTACT_PER_HOUR = 5;
export const VERIFY_MAX_PER_IP_PER_HOUR = 20;

export const GUEST_SESSION_COOKIE = 'moche_guest_session';
