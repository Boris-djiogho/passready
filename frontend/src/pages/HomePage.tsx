import { Link } from "react-router-dom";

const DEMO_TEE = "04012345678901";
const DEMO_JACKET = "04012345000016";

export function HomePage() {
  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">Digitaler Produktpass für Modelabels</p>
        <h1 className="hero-title">Ein QR-Code, drei Sichten, alle Lieferanten an Bord.</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          Diese Oberfläche zeigt die drei Flächen des MVP: den Pass, den Kundinnen nach dem Scan
          sehen, das Formular, mit dem Weberei und Färberei ihre Daten liefern, und das Dashboard
          des Labels.
        </p>
      </section>

      <section className="card">
        <h2>Pass-Ansicht (Ziel des QR-Codes)</h2>
        <ul className="list">
          <li>
            <div>
              <strong>Nordlicht Organic Tee</strong>
              <div className="small muted">Charge LOT2026A, veröffentlicht</div>
            </div>
            <Link className="btn small" to={`/01/${DEMO_TEE}/10/LOT2026A`}>Öffnen</Link>
          </li>
          <li>
            <div>
              <strong>Nordlicht Organic Tee</strong>
              <div className="small muted">Unbekannte Charge, fällt auf Modellebene zurück</div>
            </div>
            <Link className="btn small" to={`/01/${DEMO_TEE}/10/LOT9999`}>Öffnen</Link>
          </li>
          <li>
            <div>
              <strong>Nordlicht Denim Jacket</strong>
              <div className="small muted">Noch nicht veröffentlicht, zeigt den Sperrzustand</div>
            </div>
            <Link className="btn small" to={`/01/${DEMO_JACKET}`}>Öffnen</Link>
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>Lieferantenformular (per Token-Link)</h2>
        <ul className="list">
          <li>
            <div>
              <strong>Weberei: Ege Denim Tekstil</strong>
              <div className="small muted">liefert die Faserzusammensetzung der Jacke</div>
            </div>
            <Link className="btn small" to={`/supplier/${DEMO_JACKET}?token=demo-token-weaving-2026`}>Öffnen</Link>
          </li>
          <li>
            <div>
              <strong>Färberei: Mavi Boya Sanayi</strong>
              <div className="small muted">liefert Chemie-Erklärung und OEKO-TEX</div>
            </div>
            <Link className="btn small" to={`/supplier/${DEMO_JACKET}?token=demo-token-dyeing-2026`}>Öffnen</Link>
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>Brand-Dashboard</h2>
        <p className="small muted" style={{ marginBottom: 10 }}>
          Pässe mit Completeness-Score, Lieferanten einladen, Chemie-Check, Veröffentlichen.
          Demo-Key: <code>demo-brand-key</code>
        </p>
        <Link className="btn primary" to="/brand">Dashboard öffnen</Link>
      </section>
    </main>
  );
}
