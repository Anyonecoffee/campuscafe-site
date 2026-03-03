"use client";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from "recharts";

// ─────────────────────────────────────────────
// TYPES & CONFIG PAR DÉFAUT
// ─────────────────────────────────────────────

const DEFAULT_CONFIG = {
  prix_vert_kg: 8.85,

  solo: {
    capex: 60000,
    amort_mois: 48,       // → amortissement = 60000/48 = 1250 €
    loyer: 1500,
    assurance: 100,
    divers: 700,
    energie: 500,         // paramétrable
  },

  ateliers: {
    torrefaction_variable_kg: 3.90,
    // adhesion supprimée — 0 €
  },

  // Campus : forfaits fixes — PAS de paliers
  campus: {
    forfaits: [
      { label: "XS – 4h/sem",  prix: 400,  capacite_kg: 640  },
      { label: "S – 8h/sem",   prix: 700,  capacite_kg: 1280 },
      { label: "M – 16h/sem",  prix: 1200, capacite_kg: 2560 },
      { label: "L – 32h/sem",  prix: 2000, capacite_kg: 5120 },
    ],
  },
};
type AppConfig = typeof DEFAULT_CONFIG;
const STORAGE_KEY = "torref_config_v1";
const ADMIN_PIN = "1234";

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_CONFIG;
}

function saveConfig(cfg: AppConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch {}
}}
}

// ─────────────────────────────────────────────
// MOTEUR DE CALCUL
// ─────────────────────────────────────────────

// Sélectionne le plus petit forfait Campus dont capacité >= volume
function selectForfaitCampus(volume, forfaits) {
  return forfaits.find(f => f.capacite_kg >= volume) ?? forfaits[forfaits.length - 1];
}

function calcul(volume, cfg) {
  const matiere = volume * cfg.prix_vert_kg;

  // ── 1) TORRÉFACTION SOLO ──────────────────────────
  const s = cfg.solo;
  const amort = Math.round(s.capex / s.amort_mois);
  const charges_fixes = s.loyer + s.assurance + s.divers + s.energie;
  const solo_hors_matiere = amort + charges_fixes;
  const solo_total = solo_hors_matiere + matiere;
  const solo_kg = solo_total / volume;

  // ── 2) ATELIERS COLLABORATIFS AU KG ──────────────
  const at = cfg.ateliers;
  const at_torref = at.torrefaction_variable_kg * volume;
  const at_hors_matiere = at_torref; // pas d'adhésion
  const at_total = at_hors_matiere + matiere;
  const at_kg = at_total / volume;

  // ── 3) CAMPUS AU FORFAIT ──────────────────────────
  // Un seul forfait, toujours fixe — aucun supplément variable
  const forfait = selectForfaitCampus(volume, cfg.campus.forfaits);
  const campus_hors_matiere = forfait.prix;
  const campus_total = campus_hors_matiere + matiere;
  const campus_kg = campus_total / volume;

  return {
    solo: {
      total: solo_total, kg: solo_kg,
      details: [
        { label: "Amortissement (Torréfacteur tambour 15kg / 48 mois)", val: amort },
        { label: "Charges fixes", val: charges_fixes },
        { label: "Matière première", val: matiere },
      ]
    },
    ateliers: {
      total: at_total, kg: at_kg,
      details: [
        { label: `Torréfaction (${at.torrefaction_variable_kg} €/kg)`, val: at_torref },
        { label: "Matière première", val: matiere },
      ]
    },
    campus: {
      total: campus_total, kg: campus_kg,
      forfaitLabel: forfait.label,
      details: [
        { label: `Forfait ${forfait.label}`, val: forfait.prix },
        { label: "Matière première", val: matiere },
      ]
    },
  };
}

function generateCurveData(cfg) {
  const points = [];
  for (let v = 50; v <= 5000; v += 50) {
    const r = calcul(v, cfg);
    points.push({
      volume: v,
      solo: Math.round(r.solo.total),
      ateliers: Math.round(r.ateliers.total),
      campus: Math.round(r.campus.total),
    });
  }
  return points;
}

// ─────────────────────────────────────────────
// HELPERS UI
// ─────────────────────────────────────────────

const fmt = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const fmtKg = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const SCENARIOS = [
  { key: "solo",     label: "Torréfaction Solo",           color: "#C4793B", bg: "#FDF6EE", border: "#E8C4A0" },
  { key: "ateliers", label: "Ateliers collaboratifs au kg", color: "#4A7C59", bg: "#F0F7F2", border: "#A8D4B5" },
  { key: "campus",   label: "Campus au forfait",            color: "#1A1A1A", bg: "#F7F7F7", border: "#1A1A1A" },
];

const PRESETS = [50, 200, 500, 1000, 2000, 5000];

// ─────────────────────────────────────────────
// COMPOSANT CARTE SCÉNARIO
// ─────────────────────────────────────────────

function ScenarioCard({ scenario, data, isRecommended, isHighlighted }) {
  return (
    <div
      style={{
        background: isHighlighted ? scenario.bg : "#fff",
        border: `2px solid ${isHighlighted || isRecommended ? scenario.color : "#E8E0D8"}`,
        borderRadius: 16,
        padding: "24px 22px",
        flex: 1,
        minWidth: 0,
        position: "relative",
        transition: "all 0.3s ease",
        boxShadow: isHighlighted
          ? `0 8px 32px ${scenario.color}22`
          : "0 2px 8px rgba(0,0,0,0.06)",
      }}
    >
      {isRecommended && (
        <div style={{
          position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)",
          background: scenario.color, color: "#fff", borderRadius: 20,
          padding: "3px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 1,
          textTransform: "uppercase", whiteSpace: "nowrap",
        }}>
          ✦ Recommandé
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: scenario.color, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#4A3F35", textTransform: "uppercase", letterSpacing: 0.8 }}>
          {scenario.label}
        </span>
      </div>

      <div style={{ fontSize: 38, fontWeight: 800, color: scenario.color, lineHeight: 1, marginBottom: 4, fontFamily: "'DM Serif Display', Georgia, serif" }}>
        {fmt(data.total)}
      </div>
      <div style={{ fontSize: 13, color: "#8A7A70", marginBottom: 18, fontWeight: 500 }}>
        Soit {fmtKg(data.kg)}/kg torréfié
      </div>

      <div style={{ borderTop: `1px solid ${scenario.border}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 7 }}>
        {data.details.map((d, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "#6A5E56" }}>{d.label}</span>
            <span style={{ fontWeight: 600, color: "#2C241E" }}>{fmt(d.val)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PANNEAU PARAMÈTRES
// ─────────────────────────────────────────────

function ParamsPanel({ config, onSave, onClose }) {
  const [local, setLocal] = useState(JSON.parse(JSON.stringify(config)));

  const set = (path, val) => {
    const parts = path.split(".");
    setLocal(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      let obj = next;
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
      obj[parts[parts.length - 1]] = parseFloat(val) || 0;
      return next;
    });
  };

  const Field = ({ label, path, step = 1, min = 0 }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F0EAE4" }}>
      <label style={{ fontSize: 13, color: "#5A4E47" }}>{label}</label>
      <input
        type="number"
        step={step}
        min={min}
        value={path.split(".").reduce((o, k) => o?.[k], local)}
        onChange={e => set(path, e.target.value)}
        style={{
          width: 90, textAlign: "right", border: "1px solid #D4C8C0",
          borderRadius: 6, padding: "4px 8px", fontSize: 13, fontWeight: 600,
          color: "#2C241E", background: "#FAF7F4",
        }}
      />
    </div>
  );

  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: "#8A7A70", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(20,14,10,0.55)", zIndex: 1000,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "#FAF7F4", borderRadius: "20px 20px 0 0",
        maxWidth: 560, width: "100%", maxHeight: "88vh", overflow: "auto",
        padding: "28px 28px 40px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: "#2C241E" }}>Paramètres</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { onSave(DEFAULT_CONFIG); onClose(); }}
              style={{ background: "none", border: "1px solid #D4C8C0", borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "#8A7A70", cursor: "pointer" }}>
              Réinitialiser
            </button>
            <button onClick={() => { onSave(local); onClose(); }}
              style={{ background: "#C4793B", border: "none", borderRadius: 8, padding: "6px 16px", fontSize: 12, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
              Sauvegarder
            </button>
          </div>
        </div>

        <Section title="Général">
          <Field label="Prix café vert (€/kg)" path="prix_vert_kg" step={0.01} />
        </Section>

        <Section title="Torréfaction Solo (Torréfacteur à tambour 15kg)">
          <Field label="CAPEX machine (€)" path="solo.capex" step={100} />
          <Field label="Durée amortissement (mois)" path="solo.amort_mois" step={1} min={1} />
          <Field label="Loyer (€/mois)" path="solo.loyer" />
          <Field label="Assurance (€/mois)" path="solo.assurance" />
          <Field label="Divers (€/mois)" path="solo.divers" />
          <Field label="Énergie (€/mois)" path="solo.energie" />
        </Section>

        <Section title="Ateliers collaboratifs au kg">
          <Field label="Torréfaction (€/kg)" path="ateliers.torrefaction_variable_kg" step={0.1} />
        </Section>

        <Section title="Campus au forfait">
          <div style={{ fontSize: 12, color: "#8A7A70", marginBottom: 8, lineHeight: 1.5 }}>
            Forfaits fixes (Torréfacteur tambour 15kg · 40 kg/h) :<br />
            XS 400€ ≤ 640 kg · S 700€ ≤ 1 280 kg · M 1 200€ ≤ 2 560 kg · L 2 000€ ≤ 5 120 kg
          </div>
        </Section>

        <div style={{ marginTop: 16, background: "#F0EAE4", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#8A7A70", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Formules</div>
          <div style={{ fontSize: 11.5, color: "#5A4E47", lineHeight: 1.8, fontFamily: "monospace" }}>
            matière = volume × prix_vert<br />
            Solo = (CAPEX/36) + charges_fixes + matière<br />
            Ateliers = adhésion + (3,90 × volume) + matière<br />
            Campus = forfait_sélectionné + matière<br />
            (forfait = plus petit dont capacité ≥ volume)
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────

export default function Calculette() {
  const [config, setConfig] = useState(() => loadConfig());
  const [volume, setVolume] = useState(200);
  const [inputVal, setInputVal] = useState("200");
  const [highlighted, setHighlighted] = useState(null);
  const [showHypotheses, setShowHypotheses] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [showParams, setShowParams] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const cardRefs = useRef({});

  const result = useMemo(() => calcul(volume, config), [volume, config]);
  const curveData = useMemo(() => generateCurveData(config), [config]);

  const totals = {
    solo:     result.solo.total,
    ateliers: result.ateliers.total,
    campus:   result.campus.total,
  };
  const recommended = Object.entries(totals).reduce((a, b) => a[1] < b[1] ? a : b)[0];

  const handleVolume = (v) => {
    const n = Math.min(5000, Math.max(50, Number(v)));
    setVolume(n);
    setInputVal(String(n));
  };

  const handlePinSubmit = () => {
    if (pin === ADMIN_PIN) {
      setShowPin(false);
      setShowParams(true);
      setPin("");
      setPinError(false);
    } else {
      setPinError(true);
    }
  };

  const scrollToCard = (key) => {
    setHighlighted(key);
    cardRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setHighlighted(null), 2500);
  };

  const handleSaveConfig = (newCfg) => {
    setConfig(newCfg);
    saveConfig(newCfg);
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{
        background: "#2C241E", borderRadius: 10, padding: "10px 14px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
      }}>
        <div style={{ color: "#D4C8C0", fontSize: 11, marginBottom: 6 }}>{label} kg/mois</div>
        {payload.map(p => (
          <div key={p.dataKey} style={{ color: p.color, fontSize: 13, fontWeight: 600 }}>
            {SCENARIOS.find(s => s.key === p.dataKey)?.label}: {fmt(p.value)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #FDF8F3 0%, #F5EDE3 50%, #EDE0D4 100%)",
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
      color: "#2C241E",
    }}>
      {/* Import Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        input[type=range] { -webkit-appearance: none; appearance: none; height: 6px; border-radius: 3px; outline: none; cursor: pointer; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 26px; height: 26px; border-radius: 50%; background: #C4793B; border: 3px solid #fff; box-shadow: 0 2px 8px rgba(196,121,59,0.4); cursor: pointer; }
        input[type=range]::-moz-range-thumb { width: 26px; height: 26px; border-radius: 50%; background: #C4793B; border: 3px solid #fff; box-shadow: 0 2px 8px rgba(196,121,59,0.4); cursor: pointer; border: none; }
        .chip:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(196,121,59,0.25) !important; }
        @media (max-width: 700px) {
          .cards-row { flex-direction: column !important; }
          .volume-row { flex-direction: column !important; gap: 8px !important; }
        }
      `}</style>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 20px 80px" }}>

        {/* HEADER */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase", color: "#C4793B", marginBottom: 10 }}>
            ✦ Calculateur de coûts
          </div>
          <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: "clamp(28px,5vw,48px)", fontWeight: 400, margin: 0, color: "#2C241E", lineHeight: 1.15 }}>
            Quel modèle de torréfaction<br />pour votre activité ?
          </h1>
          <p style={{ marginTop: 12, color: "#8A7A70", fontSize: 15, maxWidth: 520, margin: "12px auto 0" }}>
            Ajustez votre volume mensuel pour comparer les trois scénarios en temps réel.
          </p>
        </div>

        {/* ─── BLOC 1 : SLIDER ─── */}
        <div style={{
          background: "#fff",
          borderRadius: 20,
          padding: "32px 36px",
          marginBottom: 28,
          boxShadow: "0 4px 24px rgba(44,36,30,0.08)",
          border: "1px solid #EDE0D4",
        }}>
          <div className="volume-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 28 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#2C241E" }}>
                Volume mensuel estimé
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#8A7A70" }}>
                Café vert à torréfier
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexShrink: 0 }}>
              <span style={{
                fontFamily: "'DM Serif Display', Georgia, serif",
                fontSize: "clamp(36px,6vw,52px)",
                fontWeight: 400,
                color: "#C4793B",
                lineHeight: 1,
              }}>
                {volume}
              </span>
              <span style={{ fontSize: 18, color: "#8A7A70", fontWeight: 500 }}>kg/mois</span>
            </div>
          </div>

          <div style={{ position: "relative", marginBottom: 14 }}>
            <input
              type="range"
              min={50} max={5000} step={10}
              value={volume}
              onChange={e => handleVolume(e.target.value)}
              style={{
                width: "100%",
                background: `linear-gradient(to right, #C4793B 0%, #C4793B ${((volume - 50) / 4950) * 100}%, #E8D8C8 ${((volume - 50) / 4950) * 100}%, #E8D8C8 100%)`,
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              {[50, 1000, 2000, 3000, 4000, 5000].map(v => (
                <span key={v} style={{ fontSize: 11, color: "#B0A099" }}>{v}</span>
              ))}
            </div>
          </div>

          {/* PRESETS */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
            {PRESETS.map(p => (
              <button
                key={p}
                className="chip"
                onClick={() => handleVolume(p)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 100,
                  border: `2px solid ${volume === p ? "#C4793B" : "#E8D8C8"}`,
                  background: volume === p ? "#FDF0E5" : "#FAF7F4",
                  color: volume === p ? "#C4793B" : "#8A7A70",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  transition: "all 0.18s",
                }}
              >
                {p} kg
              </button>
            ))}
          </div>
        </div>

        {/* ONGLETS NAVIGATION */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {SCENARIOS.map(s => (
            <button
              key={s.key}
              onClick={() => scrollToCard(s.key)}
              style={{
                padding: "6px 14px",
                borderRadius: 100,
                border: `1.5px solid ${s.border}`,
                background: s.bg,
                color: s.color,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                letterSpacing: 0.3,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* ─── BLOC 2 : CARTES ─── */}
        <div className="cards-row" style={{ display: "flex", gap: 16, marginBottom: 28 }}>
          {SCENARIOS.map(s => (
            <div key={s.key} ref={el => cardRefs.current[s.key] = el} style={{ flex: 1, minWidth: 0 }}>
              <ScenarioCard
                scenario={s}
                data={result[s.key]}
                isRecommended={s.key === recommended}
                isHighlighted={s.key === highlighted}
              />
            </div>
          ))}
        </div>

        {/* ─── CTA GLOBAL ─── */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 44 }}>
          <a
            href="https://tally.so/r/KYM42z"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              width: "100%",
              maxWidth: 420,
              padding: "18px 0",
              borderRadius: 12,
              textAlign: "center",
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              textDecoration: "none",
              background: "#1A1A1A",
              color: "#fff",
              border: "2px solid #1A1A1A",
              transition: "opacity 0.15s, transform 0.15s",
              cursor: "pointer",
            }}
            onMouseOver={e => { e.currentTarget.style.opacity = "0.85"; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseOut={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(0)"; }}
          >
            Contact
          </a>
        </div>

        {/* ─── BLOC 3 : GRAPHE ─── */}
        <div style={{
          background: "#fff",
          borderRadius: 20,
          padding: "28px 24px 20px",
          boxShadow: "0 4px 24px rgba(44,36,30,0.08)",
          border: "1px solid #EDE0D4",
          marginBottom: 28,
        }}>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#2C241E" }}>
              Évolution selon le volume
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#8A7A70" }}>
              Coût mensuel total par scénario — la ligne pointillée indique votre volume actuel
            </p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={curveData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 4" stroke="#F0E8E0" />
              <XAxis
                dataKey="volume"
                tick={{ fontSize: 11, fill: "#B0A099" }}
                tickLine={false}
                axisLine={{ stroke: "#E8D8C8" }}
                tickFormatter={v => `${v}kg`}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#B0A099" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k€` : `${v}€`}
                width={44}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(val) => {
                  const s = SCENARIOS.find(sc => sc.key === val);
                  return <span style={{ fontSize: 12, color: "#5A4E47", fontWeight: 600 }}>{s?.label}</span>;
                }}
                wrapperStyle={{ paddingTop: 12 }}
              />
              <ReferenceLine
                x={volume}
                stroke="#C4793B"
                strokeDasharray="5 4"
                strokeWidth={2}
                label={{ value: "▶ Actuel", position: "top", fontSize: 10, fill: "#C4793B", fontWeight: 700 }}
              />
              {SCENARIOS.map(s => (
                <Line
                  key={s.key}
                  type={s.key === "campus" ? "stepAfter" : "monotone"}
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* ─── HYPOTHÈSES (accordion) ─── */}
        <div style={{ marginBottom: 40 }}>
          <button
            onClick={() => setShowHypotheses(v => !v)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 13, color: "#8A7A70", fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6, padding: 0,
            }}
          >
            <span style={{ transition: "transform 0.2s", display: "inline-block", transform: showHypotheses ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
            Voir les hypothèses et formules
          </button>
          {showHypotheses && (
            <div style={{
              marginTop: 14, background: "#F5EDE3", borderRadius: 12,
              padding: "18px 20px", fontSize: 12.5, color: "#5A4E47",
              lineHeight: 2, fontFamily: "monospace",
            }}>
              <strong style={{ fontSize: 13, fontFamily: "DM Sans, sans-serif", color: "#2C241E" }}>
                Paramètres actuels
              </strong>
              <br />
              Prix café vert : {config.prix_vert_kg} €/kg<br />
              <br />
              <strong>Torréfaction Solo :</strong><br />
              Machine TORRÉFACTEUR À TAMBOUR 15KG · CAPEX {config.solo.capex} € / {config.solo.amort_mois} mois = {Math.round(config.solo.capex / config.solo.amort_mois)} €/mois<br />
              Loyer : {config.solo.loyer} € · Assurance : {config.solo.assurance} € · Divers : {config.solo.divers} € · Énergie : {config.solo.energie} €<br />
              Charges fixes totales : {config.solo.loyer + config.solo.assurance + config.solo.divers + config.solo.energie} €/mois<br />
              <br />
              <strong>Ateliers collaboratifs au kg :</strong><br />
              Torréfaction : {config.ateliers.torrefaction_variable_kg} €/kg (pas d'adhésion)<br />
              <br />
              <strong>Campus au forfait :</strong><br />
              XS 400€ ≤640 kg · S 700€ ≤1280 kg · M 1200€ ≤2560 kg · L 2000€ ≤5120 kg<br />
              Forfait actuel ({result.campus.forfaitLabel}) : {fmt(result.campus.total - volume * config.prix_vert_kg)}<br />
              <br />
              <strong>Formules :</strong><br />
              matière = volume × {config.prix_vert_kg} €/kg<br />
              Solo = amort + charges_fixes + matière<br />
              Ateliers = adhésion + ({config.ateliers.torrefaction_variable_kg} × volume) + matière<br />
              Campus = forfait_sélectionné + matière (forfait fixe, aucun supplément)<br />
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div style={{ textAlign: "center" }}>
          <button
            onClick={() => setShowPin(true)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 12, color: "#C4C0BC", fontWeight: 500, letterSpacing: 0.3,
            }}
          >
            ⚙ Paramètres
          </button>
        </div>
      </div>

      {/* ─── MODAL PIN ─── */}
      {showPin && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(20,14,10,0.6)",
          zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center",
        }}
          onClick={e => e.target === e.currentTarget && setShowPin(false)}
        >
          <div style={{ background: "#FAF7F4", borderRadius: 16, padding: "32px 36px", textAlign: "center", width: 280 }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🔒</div>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6, color: "#2C241E" }}>Accès Paramètres</div>
            <div style={{ fontSize: 13, color: "#8A7A70", marginBottom: 20 }}>Entrez le code PIN</div>
            <input
              type="password"
              value={pin}
              onChange={e => { setPin(e.target.value); setPinError(false); }}
              onKeyDown={e => e.key === "Enter" && handlePinSubmit()}
              placeholder="• • • •"
              autoFocus
              style={{
                width: "100%", textAlign: "center", fontSize: 24, letterSpacing: 8,
                border: `2px solid ${pinError ? "#E06060" : "#D4C8C0"}`,
                borderRadius: 10, padding: "10px", background: "#fff", color: "#2C241E",
                outline: "none",
              }}
            />
            {pinError && <div style={{ color: "#E06060", fontSize: 12, marginTop: 8 }}>Code incorrect</div>}
            <button
              onClick={handlePinSubmit}
              style={{
                marginTop: 16, width: "100%", background: "#C4793B", color: "#fff",
                border: "none", borderRadius: 10, padding: "12px", fontSize: 14,
                fontWeight: 700, cursor: "pointer",
              }}
            >
              Accéder
            </button>
          </div>
        </div>
      )}

      {/* ─── PANNEAU PARAMÈTRES ─── */}
      {showParams && (
        <ParamsPanel
          config={config}
          onSave={handleSaveConfig}
          onClose={() => setShowParams(false)}
        />
      )}
    </div>
  );
}
