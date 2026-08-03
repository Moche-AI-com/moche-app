import { z } from 'zod';
import { Constants } from '@/lib/database.types';

export const emailSchema = z.string().email().max(320);
export const passwordSchema = z.string().min(10, 'Password must be at least 10 characters').max(200);

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(1).max(120),
  accountName: z.string().trim().min(1).max(120).optional(),
  acceptTerms: z.literal(true),
  // A2P 10DLC: explicit, opt-in SMS/WhatsApp consent. Defaults false and is only
  // true when the host actively checks the (unchecked) box. Stored as a
  // consent flag; texting is further gated on a later phone-verification step.
  smsOptIn: z.boolean().optional().default(false),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export const resetRequestSchema = z.object({ email: emailSchema });
export const resetUpdateSchema = z.object({ password: passwordSchema });

export const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
});

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #33E6D4');

// Coordinates arrive from the address autocomplete / manual pin as form strings.
// Empty string => undefined; otherwise a bounded finite number.
const emptyToUndefined = (v: unknown) => (v === '' || v == null ? undefined : v);
const latitude = z.preprocess(emptyToUndefined, z.coerce.number().min(-90).max(90).optional());
const longitude = z.preprocess(emptyToUndefined, z.coerce.number().min(-180).max(180).optional());

export const propertyCreateSchema = z.object({
  displayName: z.string().trim().min(1, 'Property name is required.').max(120),
  // City + country are required so every portal has real location context for the
  // concierge and upcoming local-area discovery. Region stays optional.
  city: z.string().trim().min(1, 'City is required.').max(120),
  region: z.string().trim().max(120).optional().or(z.literal('')),
  country: z.string().trim().min(1, 'Country is required.').max(120),
  timezone: z.string().trim().max(64).default('UTC'),
  locale: z.string().trim().max(12).default('en'),
});

export const propertyUpdateSchema = propertyCreateSchema.partial().extend({
  addressLine1: z.string().trim().max(200).optional().or(z.literal('')),
  addressLine2: z.string().trim().max(200).optional().or(z.literal('')),
  postalCode: z.string().trim().max(40).optional().or(z.literal('')),
  lat: latitude,
  lng: longitude,
  brandPrimary: hexColor.optional().or(z.literal('')),
  brandAccent: hexColor.optional().or(z.literal('')),
  coverImageUrl: z.string().url().max(2000).optional().or(z.literal('')),
});

export const propertyCreateWithGeoSchema = propertyCreateSchema.extend({
  lat: latitude,
  lng: longitude,
});

export const propertySettingsSchema = z.object({
  conciergeTone: z.string().trim().max(2000).optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  gracePeriodHours: z.number().int().min(0).max(168).optional(),
  aiTemperature: z.number().min(0).max(2).optional(),
  reviewNudgeEnabled: z.boolean().optional(),
  reviewNudgeAuto: z.boolean().optional(),
  reviewUrl: z.string().trim().url('Enter a valid review link (https://…)').max(2000).optional().or(z.literal('')),
  modules: z.record(z.boolean()).optional(),
  // Premium concierge controls (server action enforces the plan gate before persisting).
  conciergeName: z.string().trim().max(80).optional(),
  systemPromptOverride: z.string().trim().max(4000).optional(),
  responseLength: z.enum(['concise', 'balanced', 'detailed']).optional(),
  restrictedTopics: z.string().trim().max(1000).optional(),
  language: z.string().trim().max(40).optional(),
});

export const brainCategoryEnum = z.enum(Constants.public.Enums.brain_category);
export const brainVisibilityEnum = z.enum(Constants.public.Enums.brain_visibility);

export const brainItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(20000).optional().or(z.literal('')),
  category: brainCategoryEnum,
  visibility: brainVisibilityEnum.default('guest'),
});

export const recommendationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(80).optional().or(z.literal('')),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  address: z.string().trim().max(300).optional().or(z.literal('')),
  distanceNote: z.string().trim().max(120).optional().or(z.literal('')),
  url: z.string().url().max(2000).optional().or(z.literal('')),
  visibility: brainVisibilityEnum.default('guest'),
});

export const contactSchema = z.object({
  label: z.string().trim().min(1).max(120),
  name: z.string().trim().max(120).optional().or(z.literal('')),
  contactType: z.string().trim().max(40).default('general'),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  email: z.string().trim().max(320).optional().or(z.literal('')),
  isPrimary: z.boolean().default(false),
  isEmergency: z.boolean().default(false),
});

export const stayCreateSchema = z.object({
  guestDisplayName: z.string().trim().min(1).max(120),
  contact: z.string().trim().min(3).max(320), // email or phone, hashed server-side
  checkIn: z.string().min(4).max(40),
  checkOut: z.string().min(4).max(40),
  guestCount: z.number().int().min(1).max(50).default(1),
  bookingReference: z.string().trim().max(120).optional().or(z.literal('')),
  hostNotes: z.string().trim().max(4000).optional().or(z.literal('')),
});

export const ingestUrlSchema = z.object({
  url: z.string().url().max(2000),
  title: z.string().trim().max(200).optional(),
  category: brainCategoryEnum.default('product_urls'),
  visibility: brainVisibilityEnum.default('guest'),
});

// Pasted / typed text ingestion. Useful when a URL is blocked (e.g. Zillow) and
// the host copies the listing details in directly. Standardized before embedding.
export const ingestTextSchema = z.object({
  text: z.string().trim().min(20, 'Paste at least a sentence or two.').max(50000),
  title: z.string().trim().max(200).optional(),
  category: brainCategoryEnum.default('documents'),
  visibility: brainVisibilityEnum.default('guest'),
  standardize: z.boolean().default(true),
});

export const coHostInviteSchema = z.object({
  email: emailSchema,
  canEditBrain: z.boolean().default(false),
  canReplyGuests: z.boolean().default(true),
  canReceiveEscalations: z.boolean().default(true),
  canResolveMaintenance: z.boolean().default(false),
  canViewAnalytics: z.boolean().default(true),
});

export const guestVerifyStartSchema = z.object({
  contact: z.string().trim().min(3).max(320),
  turnstileToken: z.string().max(4000).optional(),
});

export const guestVerifyConfirmSchema = z.object({
  contact: z.string().trim().min(3).max(320),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

// Magic-link / QR redemption (guest-facing). Opaque base64url token.
export const guestRedeemSchema = z.object({
  token: z.string().trim().min(16).max(512),
});

// Guest visit-code confirm (second factor on a stay link, WS-1).
export const guestCodeConfirmSchema = z.object({
  token: z.string().trim().min(16).max(512),
  code: z.string().trim().regex(/^\d{4}$/, 'Enter the 4-digit code'),
});

// Host mints a stay or property access link.
export const linkMintSchema = z.object({
  kind: z.enum(['stay', 'property']),
  stayId: z.string().uuid().optional(),
  requireOtp: z.boolean().optional(),
  maxRedemptions: z.number().int().min(1).max(10000).optional(),
});

export const guestChatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

// Guest-initiated manual escalation ("ring the host") — the guest types their issue.
export const guestEscalateSchema = z.object({
  message: z.string().trim().min(1, 'Please describe your issue.').max(2000),
});

export const guestServiceRequestSchema = z.object({
  serviceType: z.enum(['maintenance', 'cleaning', 'safety', 'emergency', 'other']),
  description: z.string().trim().min(1).max(2000),
  urgency: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
});

// Host phone verification + optional login 2FA (Feature 4a).
export const hostPhoneSchema = z.object({
  phone: z.string().trim().min(7, 'Enter a valid phone number.').max(40),
});
export const hostOtpConfirmSchema = z.object({
  phone: z.string().trim().min(7).max(40),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  optIn: z.boolean().default(false),
});
export const hostLoginOtpSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

// Guest "Notify Me" soft-gate consent capture (Feature 4c).
export const guestNotifyConsentSchema = z.object({
  contact: z.string().trim().min(3).max(320),
  consent: z.literal(true),
});

// Add-on — host-configurable guest extra (CRUD from the dashboard).
export const extraOfferSchema = z.object({
  title: z.string().trim().min(1, 'Give the offer a title.').max(120),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  priceText: z.string().trim().max(60).optional().or(z.literal('')),
  ctaLabel: z.string().trim().max(40).optional().or(z.literal('')),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

// Add-on — guest requests an extra; routes through the existing escalation path.
export const guestExtraRequestSchema = z.object({
  offerId: z.string().uuid(),
});

// Add-on — one-tap product feedback (guest path, via admin client).
export const guestFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().or(z.literal('')),
  page: z.string().trim().max(120).optional().or(z.literal('')),
});

// Add-on — one-tap product feedback (host path, authenticated).
export const hostFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().or(z.literal('')),
  page: z.string().trim().max(120).optional().or(z.literal('')),
});

// Answer an escalation via the signed magic link (no dashboard session).
export const escalationLinkAnswerSchema = z.object({
  token: z.string().trim().min(16).max(1024),
  response: z.string().trim().min(1).max(4000),
});

export const escalationRespondSchema = z.object({
  response: z.string().trim().min(1).max(4000),
  convertToBrain: z.boolean().default(false),
  brainCategory: brainCategoryEnum.default('host_qa'),
});

export const checkoutSchema = z.object({
  plan: z.enum(['starter', 'pro', 'portfolio']),
  interval: z.enum(['monthly', 'annual']).default('monthly'),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type PropertyCreateInput = z.infer<typeof propertyCreateSchema>;
export type StayCreateInput = z.infer<typeof stayCreateSchema>;
