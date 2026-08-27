import NetworkCeremonyApp from './NetworkCeremonyApp';

export default function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">र</div>
        <div><div className="eyebrow">RAKSHA BANDHAN, TOGETHER</div><h1>Virtual Rakhi</h1></div>
      </header>
      <NetworkCeremonyApp />
      <footer className="app-footer">A private two-person call · No camera or call data is stored</footer>
    </main>
  );
}
