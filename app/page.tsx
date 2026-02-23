export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 32, fontWeight: 700 }}>ShowFlows</h1>
      <p style={{ marginTop: 12, fontSize: 16 }}>
        Private scheduling infrastructure for working musicians.
      </p>

      <div style={{ marginTop: 24 }}>
        <p style={{ fontWeight: 600 }}>Next up:</p>
        <ul style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.6 }}>
          <li>Auth (email login)</li>
          <li>Create / join projects</li>
          <li>Events (Inquiry → Confirmed)</li>
          <li>RSVP (one-tap)</li>
          <li>Unified “My Schedule” view</li>
        </ul>
      </div>
    </main>
  );
}