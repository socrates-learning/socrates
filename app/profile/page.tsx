import { redirect } from 'next/navigation';
import { PersonalProfile } from '@/components/PersonalProfile';
import { profileDisplayName, profilePersonalDetails } from '@/lib/personal-profile';
import { ProfileError, profileAccount } from '@/lib/personal-profile-server';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { section } = await searchParams;
  let account;
  try { account = await profileAccount(); }
  catch (error) {
    if (error instanceof ProfileError && error.status === 401) redirect('/login?next=/profile');
    if (error instanceof ProfileError && error.status === 403) redirect('/pending-approval');
    throw error;
  }
  const memberSince = account.user.created_at ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(account.user.created_at)) : '';
  return <PersonalProfile initialTab={section === 'security' ? 'security' : 'information'} key={account.user.id} email={account.user.email || ''} initialDisplayName={profileDisplayName(account.user.user_metadata)} initialDetails={profilePersonalDetails(account.user.user_metadata)} memberSince={memberSince} timeZones={['UTC', ...Intl.supportedValuesOf('timeZone')]} role={account.role} />;
}
