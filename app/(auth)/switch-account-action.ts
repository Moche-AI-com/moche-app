'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { TRUSTED_DEVICE_COOKIE } from '@/lib/constants';

export async function switchAccountAction(formData: FormData): Promise<void> {
  const destination = formData.get('destination') === 'signup' ? '/signup' : '/login';
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error('Could not end your current session. Please try again.');
  (await cookies()).delete(TRUSTED_DEVICE_COOKIE);
  redirect(destination);
}
