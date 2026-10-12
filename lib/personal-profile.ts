export const DISPLAY_NAME_LIMIT = 80;
export const PROFILE_PHOTO_LIMIT = 3 * 1024 * 1024;
export const PROFILE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PROFILE_PHOTO_BUCKET = 'socrates-profile-photos';

export const PROFILE_LANGUAGES = [['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['pt', 'Português'], ['ar', 'العربية'], ['zh', '中文'], ['ja', '日本語'], ['ko', '한국어'], ['hi', 'हिन्दी'], ['it', 'Italiano'], ['ru', 'Русский']] as const;
export type PersonalDetails = { username: string; location: string; age: number | null; language: string; timeZone: string };
export const EMPTY_PERSONAL_DETAILS: PersonalDetails = { username: '', location: '', age: null, language: '', timeZone: '' };

export function normalizePersonalDetails(input: unknown): PersonalDetails {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid profile information.');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !Object.hasOwn(EMPTY_PERSONAL_DETAILS, key))) throw new Error('Invalid profile fields.');
  function text(key: string, limit: number) {
    if (typeof value[key] !== 'string') throw new Error('Invalid profile information.');
    const result = value[key].trim().replace(/\s+/gu, ' ');
    if (Array.from(result).length > limit || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(result)) throw new Error(`Check your ${key === 'timeZone' ? 'time zone' : key}.`);
    return result;
  }
  const username = text('username', 30).toLowerCase();
  if (username && !/^[a-z0-9][a-z0-9_.-]{2,29}$/.test(username)) throw new Error('Use 3–30 letters, numbers, dots, hyphens or underscores for your username.');
  const location = text('location', 100);
  if (value.age !== null && (!Number.isInteger(value.age) || Number(value.age) < 0 || Number(value.age) > 120)) throw new Error('Enter an age between 0 and 120, or leave it blank.');
  const language = text('language', 10);
  if (language && !PROFILE_LANGUAGES.some(([code]) => code === language)) throw new Error('Choose a preferred language from the list.');
  const timeZone = text('timeZone', 80);
  if (timeZone) {
    try { new Intl.DateTimeFormat('en', { timeZone }).format(); }
    catch { throw new Error('Choose a valid time zone.'); }
  }
  return { username, location, age: value.age as number | null, language, timeZone };
}

export function profilePersonalDetails(metadata: Record<string, unknown> | undefined): PersonalDetails {
  try { return normalizePersonalDetails(metadata?.socrates_profile ?? EMPTY_PERSONAL_DETAILS); }
  catch { return { ...EMPTY_PERSONAL_DETAILS }; }
}

// This is presentation metadata only. Roles and account identity remain elsewhere.
export function normalizeDisplayName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Enter a display name.');
  const name = value.trim().replace(/\s+/gu, ' ');
  if (Array.from(name).length > DISPLAY_NAME_LIMIT) throw new Error('Use 80 characters or fewer for your display name.');
  if (/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(name)) throw new Error('Remove control characters from your display name.');
  return name;
}

export function profileDisplayName(metadata: Record<string, unknown> | undefined): string {
  try { return normalizeDisplayName(metadata?.full_name ?? ''); }
  catch { return ''; }
}

export function validateProfilePhoto(file: { size: number; type: string }): void {
  if (!PROFILE_PHOTO_TYPES.some(type => type === file.type)) throw new Error('Choose a JPEG, PNG, or WebP photo.');
  if (!file.size || file.size > PROFILE_PHOTO_LIMIT) throw new Error('Choose a photo smaller than 3 MB.');
}
