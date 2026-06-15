import Link from 'next/link';

export function Header() {
  return (
    <header className="header">
      <div>
        <h1 style={{ margin: 0 }}>Socrates</h1>
        <p>
          Real application foundation · concept-network learning platform
        </p>
      </div>

      <nav style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Link className="btn ghost" href="/">
          Home
        </Link>

        <Link className="btn ghost" href="/pharmacology">
          Pharmacology
        </Link>

        <Link className="btn ghost" href="/creator">
          Creator Studio
        </Link>

        <Link className="btn ghost" href="/admin">
          Admin
        </Link>

        <Link className="btn ghost" href="/admin/users">
          Users
        </Link>

        <Link className="btn primary" href="/login">
          Login
        </Link>
      </nav>
    </header>
  );
}