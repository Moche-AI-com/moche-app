'use client';

import { createContext, useContext } from 'react';
import type { PricingIntent } from '@/lib/billing/pricing-intent';

const BillingIntentContext = createContext<PricingIntent | null>(null);

export function BillingIntentProvider({
  children,
  intent,
}: {
  children: React.ReactNode;
  intent: PricingIntent | null;
}) {
  return (
    <BillingIntentContext.Provider value={intent}>
      {children}
    </BillingIntentContext.Provider>
  );
}

export function useBillingIntent(): PricingIntent | null {
  return useContext(BillingIntentContext);
}
