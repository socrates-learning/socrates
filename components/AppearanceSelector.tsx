'use client';

import { Sun, Moon, Monitor, Eclipse } from 'lucide-react';
import { useAppearance } from '@/components/AppearanceProvider';
import styles from './AccountSettings.module.css';

const choices = [
  { value: 'light', label: 'Light', description: 'Clean and bright', Icon: Sun },
  { value: 'navy', label: 'Dark Navy', description: 'Deep blue for low light', Icon: Moon },
  { value: 'midnight', label: 'Midnight Black', description: 'Minimal and focused', Icon: Eclipse },
  { value: 'system', label: 'System Default', description: 'Follows your device settings', Icon: Monitor },
] as const;

export function AppearanceSelector() {
  const { choice, ready, saving, error, save } = useAppearance();
  return <div>
    <fieldset className={styles.appearances} disabled={!ready || saving}>
      <legend>Theme</legend>
      {choices.map(({ value, label, description, Icon }) => <label key={value} className={styles.appearance}>
        <input type="radio" name="appearance" value={value} checked={choice === value} onChange={() => { void save(value); }} />
        <span className={styles.swatch} data-swatch={value}><Icon aria-hidden="true" /></span>
        <span><strong>{label}</strong><small>{description}</small></span>
      </label>)}
    </fieldset>
    <p className={styles.saveStatus} role="status">{!ready ? 'Loading appearance…' : saving ? 'Saving appearance…' : 'Your appearance is saved to your account.'}</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
  </div>;
}
