import { NavLink, Route, Routes } from "react-router-dom";

import { BrandPage } from "./pages/BrandPage";
import { HomePage } from "./pages/HomePage";
import { PassportPage } from "./pages/PassportPage";
import { SupplierPage } from "./pages/SupplierPage";

export function App() {
  return (
    <>
      <header className="topbar">
        <NavLink to="/" className="brand">
          Pass<span>Ready</span>
        </NavLink>
        <nav>
          <NavLink to="/brand">Label</NavLink>
          <NavLink to="/01/04012345678901/10/LOT2026A">Demo-Pass</NavLink>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/01/:gtin" element={<PassportPage />} />
        <Route path="/01/:gtin/10/:batch" element={<PassportPage />} />
        <Route path="/01/:gtin/21/:serial" element={<PassportPage />} />
        <Route path="/01/:gtin/10/:batch/21/:serial" element={<PassportPage />} />
        <Route path="/supplier/:gtin" element={<SupplierPage />} />
        <Route path="/brand" element={<BrandPage />} />
        <Route path="*" element={<div className="page"><div className="empty">Seite nicht gefunden.</div></div>} />
      </Routes>
    </>
  );
}
