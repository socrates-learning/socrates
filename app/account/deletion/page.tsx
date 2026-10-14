import DeleteAccount from '@/components/DeleteAccount';

// Deliberately reachable after Auth deletion. The server-verified HttpOnly
// receipt is required for cleanup; this page reveals no account data.
export default function AccountDeletionPage() {
  return <main className="container" style={{ maxWidth: 720, padding: '40px 20px' }}>
    <h1>Account Deletion</h1>
    <p>If deletion was interrupted, retry here to finish removing your personal data.</p>
    <DeleteAccount />
    <p><a href="/login">Return to Sign In</a></p>
  </main>;
}
