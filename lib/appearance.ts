export const APPEARANCES = ['light', 'navy', 'midnight', 'system'] as const;
export type Appearance = typeof APPEARANCES[number];

export function isAppearance(value: unknown): value is Appearance {
  return typeof value === 'string' && (APPEARANCES as readonly string[]).includes(value);
}

export function accountAppearance(metadata: Record<string, unknown> | null | undefined): Appearance {
  return isAppearance(metadata?.socrates_appearance) ? metadata.socrates_appearance : 'light';
}

export function resolvedAppearance(choice: Appearance, systemDark: boolean): Exclude<Appearance, 'system'> {
  return choice === 'system' ? (systemDark ? 'navy' : 'light') : choice;
}
