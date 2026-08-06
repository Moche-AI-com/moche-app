import { permanentRedirect } from 'next/navigation';

export default function ProfileLegalRedirect() {
  permanentRedirect('/legal');
}
