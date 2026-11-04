import { Link } from "react-router-dom";

import { usePageTitle } from "../lib/a11y";

const DEMO_TEE = "04012345678901";
const DEMO_JACKET = "04012345000016";

export function HomePage() {
  usePageTitle("Startseite");
  return (
    <main id="main" tabIndex={-1} className="wrap">
      <section className="hero">
        <p className="eyebrow">Digitaler Produktpass · Textil · ESPR</p>
        <h1 className="display">
          Ein QR-Code auf dem Etikett. <span className="accent-text">Drei Sichten dahinter.</span>
        </h1>
        <p className="lede">
          Kundinnen sehen Material und Pflege, Recycler die Zerlegung, Behörden alles. Weberei und
          Färberei liefern ihre Daten direkt, ohne Konto. Das Label behält den Überblick.
        </p>
      </section>

      <section className="section" aria-labelledby="h-pass">
        <div className="section-title">
          <span className="num" aria-hidden="true">01</span>
          <h2 id="h-pass">Pass-Ansicht: was nach dem Scan erscheint</h2>
        </div>
        <ul className="link-list">
          <li>
            <Link to={`/01/${DEMO_TEE}/10/LOT2026A`}>
              <span>
                <span className="link-title">Nordlicht Organic Tee, Charge LOT2026A</span>
                <span className="link-meta">Veröffentlichter Pass mit Chargen-Prüfbericht</span>
              </span>
            </Link>
          </li>
          <li>
            <Link to={`/01/${DEMO_TEE}/10/LOT9999`}>
              <span>
                <span className="link-title">Nordlicht Organic Tee, unbekannte Charge</span>
                <span className="link-meta">Fällt auf die Modellebene zurück und sagt das auch</span>
              </span>
            </Link>
          </li>
          <li>
            <Link to={`/01/${DEMO_JACKET}`}>
              <span>
                <span className="link-title">Nordlicht Denim Jacket</span>
                <span className="link-meta">Noch nicht veröffentlicht, zeigt den Sperrzustand</span>
              </span>
            </Link>
          </li>
        </ul>
      </section>

      <section className="section" aria-labelledby="h-supplier">
        <div className="section-title">
          <span className="num" aria-hidden="true">02</span>
          <h2 id="h-supplier">Lieferantenportal: ein Link pro Betrieb</h2>
        </div>
        <ul className="link-list">
          <li>
            <Link to={`/supplier/${DEMO_JACKET}?token=demo-token-weaving-2026`}>
              <span>
                <span className="link-title">Weberei Ege Denim Tekstil</span>
                <span className="link-meta">Liefert die Faserzusammensetzung der Jacke</span>
              </span>
            </Link>
          </li>
          <li>
            <Link to={`/supplier/${DEMO_JACKET}?token=demo-token-dyeing-2026`}>
              <span>
                <span className="link-title">Färberei Mavi Boya Sanayi</span>
                <span className="link-meta">Liefert Chemie-Erklärung und OEKO-TEX-Nachweis</span>
              </span>
            </Link>
          </li>
        </ul>
      </section>

      <section className="section" aria-labelledby="h-brand">
        <div className="section-title">
          <span className="num" aria-hidden="true">03</span>
          <h2 id="h-brand">Label-Dashboard</h2>
        </div>
        <p className="muted" style={{ marginBottom: "1rem" }}>
          Alle Pässe mit Vollständigkeit, Lieferanten einladen, Chemie-Check, Veröffentlichen.
          Demo-Zugang mit dem Key <code>demo-brand-key</code>.
        </p>
        <Link className="btn btn-primary btn-arrow" to="/brand">Dashboard öffnen</Link>
      </section>
    </main>
  );
}
