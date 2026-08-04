import { Logo } from '@/components/Logo';
import { LegalLinks } from '@/components/legal/LegalLinks';
import styles from './landing.module.css';

export function LandingFooter() {
  return (
    <footer className={styles.landingFooter}>
      <div className="wrap">
        <Logo href="/" size={24} />
        <p className={`muted ${styles.landingFooterTagline}`}>Built in Somerville, MA</p>
        <LegalLinks variant="full" style={{ marginTop: '1rem', marginBottom: '1rem' }} />
        <p className="muted">&copy; {new Date().getFullYear()} Moche-AI</p>
      </div>
    </footer>
  );
}
