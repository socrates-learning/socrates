export default function Loading() {
  return (
    <main
      aria-label="Loading Socrates"
      aria-live="polite"
      style={{
        background: '#f3f6fb',
        color: '#12233f',
        minHeight: '100vh',
      }}
    >
      <header
        style={{
          alignItems: 'center',
          background: 'linear-gradient(180deg, #061846, #041238)',
          color: '#ffffff',
          display: 'flex',
          minHeight: 126,
          padding: '28px 36px',
        }}
      >
        <div>
          <strong
            style={{
              display: 'block',
              fontFamily: 'Georgia, "Times New Roman", Times, serif',
              fontSize: 42,
              lineHeight: 1,
            }}
          >
            Socrates
          </strong>
          <span style={{ color: '#edf4ff', display: 'block', marginTop: 8 }}>
            Learn anything.
          </span>
        </div>
      </header>
      <section
        style={{
          margin: '40px auto',
          maxWidth: 1180,
          padding: '0 24px',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #dfe6f0',
            borderRadius: 16,
            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.08)',
            minHeight: 220,
            padding: 28,
          }}
        >
          <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            Loading…
          </p>
        </div>
      </section>
    </main>
  );
}
