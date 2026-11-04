import { NavLink, Route, Routes } from "react-router-dom";

import { useFocusMainOnNavigate } from "./lib/a11y";
import { BrandPage } from "./pages/BrandPage";
import { HomePage } from "./pages/HomePage";
import { PassportPage } from "./pages/PassportPage";
import { SupplierPage } from "./pages/SupplierPage";

export function App() {
  useFocusMainOnNavigate();
  return (
    <>
      <a className="skip-link" href="#main">Zum Inhalt springen</a>
      <header className="site-header">
        <div className="wrap wide">
          <NavLink to="/" className="wordmark" aria-label="PassReady, zur Startseite">
            Pass<span>Ready</span>
          </NavLink>
          <nav className="site-nav" aria-label="Hauptnavigation">
            <NavLink to="/brand">Dashboard</NavLink>
            <NavLink to="/01/04012345678901/10/LOT2026A">Demo-Pass</NavLink>
          </nav>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/01/:gtin" element={<PassportPage />} />
        <Route path="/01/:gtin/10/:batch" element={<PassportPage />} />
        <Route path="/01/:gtin/21/:serial" element={<PassportPage />} />
        <Route path="/01/:gtin/10/:batch/21/:serial" element={<PassportPage />} />
        <Route path="/supplier/:gtin" element={<SupplierPage />} />
        <Route path="/brand" element={<BrandPage />} />
        <Route
          path="*"
          element={
            <main id="main" tabIndex={-1} className="wrap">
              <h1>Seite nicht gefunden</h1>
              <p className="lede">Diese Adresse führt zu keinem Pass und keiner Funktion.</p>
            </main>
          }
        />
      </Routes>
    </>
  );
}
