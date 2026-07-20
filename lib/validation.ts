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
  brandPrimary: hexColor.optional().or(z.literal('')),
  brandAccent: hexColor.optional().or(z.literal('')),
  coverImageUrl: z.string().url().max(2000).optional().or(z.literal('')),
});

export const propertySettingsSchema = z.object({
  conciergeTone: z.string().trim().max(2000).optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  gracePeriodHours: z.number().int().min(0).max(168).optional(),
  aiTemperature: z.number().min(0).max(2).optional(),
  reviewNudgeEnabled: z.boolean().optional(),
  reviewNudgeAuto: z.boolean().optional(),
  modules: z.record(z.boolean()).optional(),
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

export const guestChatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

export const guestServiceRequestSchema = z.object({
  serviceType: z.enum(['maintenance', 'cleaning', 'safety', 'emergency', 'other']),
  description: z.string().trim().min(1).max(2000),
  urgency: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
});

export const escalationRespondSchema = z.object({
  response: z.string().trim().min(1).max(4000),
  convertToBrain: z.boolean().default(false),
  brainCategory: brainCategoryEnum.default('host_qa'),
});

export const checkoutSchema = z.object({
  plan: z.enum(['starter', 'growth', 'portfolio']),
  interval: z.enum(['monthly', 'annual']).default('monthly'),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type PropertyCreateInput = z.infer<typeof propertyCreateSchema>;
export type StayCreateInput = z.infer<typeof stayCreateSchema>;
