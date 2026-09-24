import { permanentRedirect } from 'next/navigation';

// Preserve old shared links without maintaining a second, drifting terms document.
export default function FoundingTermsPage(): never {
  permanentRedirect('/legal/terms#pricing-and-founding');
}
