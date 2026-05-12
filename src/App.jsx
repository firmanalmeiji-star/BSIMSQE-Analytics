import { useState, useCallback, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { fetchSheetCSV, processCallData, processKYCData } from "./sheetFetcher";

// Horizon Design System color tokens
const HZ = {
  primary:     "#006CEB",
  green:       "#159367",
  red:         "#D92222",
  yellow:      "#E5AC00",
  orange:      "#E45A18",
  purple:      "#7C48E4",
  teal:        "#2CA7E4",
  neutral100:  "#EFF1F3",
  neutral200:  "#DEE3E7",
  neutral300:  "#CED4DA",
  neutral400:  "#ADB5BD",
  neutral500:  "#8B949C",
  neutral600:  "#6C757D",
  neutral700:  "#495057",
  neutral900:  "#272D33",
  neutral1000: "#13171C",
};

const PIE_COLORS = [HZ.green, HZ.red, HZ.yellow, HZ.primary, HZ.purple, HZ.teal, HZ.orange, HZ.neutral400];

const DEFAULT_SHEETS = {
  kyc:  "11fyn43YY8ROzIjLrN3m8p1fpRdBfYzsU8SqnZs0Ktyo",
  call: "1_mj9wpWFsLAr-mEAsS4ULWL2PuWHM_jKdcB9VcAzgP0",
};

const inputStyle = {
  background: "#FFFFFF",
  border: `1px solid ${HZ.neutral300}`,
  borderRadius: 8,
  padding: "8px 12px",
  color: HZ.neutral1000,
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
};

// ── Stat Card ────────────────────────────────────────────────────────────────
function Stat({ label, value, sub, color = HZ.primary, large }) {
  return (
    <div style={{
      background: "#FFFFFF",
      borderRadius: 12,
      padding: large ? "20px 24px" : "14px 18px",
      border: `1px solid ${HZ.neutral200}`,
      borderLeft: `3px solid ${color}`,
      flex: 1,
      minWidth: 150,
    }}>
      <div className="hz-text-body-s-bold" style={{ color: HZ.neutral500, textTransform: "uppercase", letterSpacing: "1.2px" }}>
        {label}
      </div>
      <div
        className={large ? "hz-text-heading-4" : "hz-text-heading-5"}
        style={{ color: HZ.neutral1000, fontFamily: "'JetBrains Mono', monospace", margin: "4px 0" }}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {sub && <div className="hz-text-body-s-regular" style={{ color: HZ.neutral500 }}>{sub}</div>}
    </div>
  );
}

// ── Chart Tooltip ─────────────────────────────────────────────────────────────
const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#FFFFFF",
      border: `1px solid ${HZ.neutral200}`,
      borderRadius: 8,
      padding: "8px 12px",
      boxShadow: "0 4px 16px rgba(0,0,0,.08)",
    }}>
      <div className="hz-text-body-s-bold" style={{ color: HZ.neutral900, marginBottom: 3 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="hz-text-body-s-regular" style={{ color: p.color || p.fill, lineHeight: 1.6 }}>
          {p.name}: <b>{(p.value || 0).toLocaleString()}</b>
        </div>
      ))}
    </div>
  );
};

// ── Hourly Tooltip (2-column: guest | login) ──────────────────────────────────
const HourlyTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const get = key => (payload.find(p => p.dataKey === key)?.value || 0);
  const gTotal = get("gResolved") + get("gDropped") + get("gAbandoned") + get("gPrequeue");
  const lTotal = get("lResolved") + get("lDropped") + get("lAbandoned") + get("lPrequeue");
  const col = (title, color, items) => (
    <div style={{ flex: 1 }}>
      <div className="hz-text-body-s-bold" style={{ color, marginBottom: 4 }}>{title}</div>
      {items.map(([name, val, c], i) => (
        <div key={i} className="hz-text-body-s-regular" style={{ color: c, lineHeight: 1.7 }}>
          {name}: <b>{val.toLocaleString()}</b>
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ background: "#FFF", border: `1px solid ${HZ.neutral200}`, borderRadius: 8, padding: "10px 14px", boxShadow: "0 4px 16px rgba(0,0,0,.08)", minWidth: 240 }}>
      <div className="hz-text-body-s-bold" style={{ color: HZ.neutral900, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", gap: 20 }}>
        {col(`Guest (${gTotal})`, HZ.orange, [
          ["Resolved",  get("gResolved"),  HZ.green],
          ["Dropped",   get("gDropped"),   HZ.red],
          ["Abandoned", get("gAbandoned"), HZ.yellow],
          ["Pre-Queue", get("gPrequeue"),  HZ.neutral400],
        ])}
        <div style={{ width: 1, background: HZ.neutral200 }} />
        {col(`Login (${lTotal})`, HZ.primary, [
          ["Resolved",  get("lResolved"),  HZ.green],
          ["Dropped",   get("lDropped"),   HZ.red],
          ["Abandoned", get("lAbandoned"), HZ.yellow],
          ["Pre-Queue", get("lPrequeue"),  HZ.neutral400],
        ])}
      </div>
    </div>
  );
};

// ── Section Wrapper ───────────────────────────────────────────────────────────
function Section({ title, subtitle, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 className="hz-text-heading-6" style={{ color: HZ.neutral1000, margin: "0 0 2px" }}>{title}</h2>
      {subtitle && <p className="hz-text-body-s-regular" style={{ color: HZ.neutral500, margin: "0 0 12px" }}>{subtitle}</p>}
      {children}
    </div>
  );
}

// ── Issue Detail Modal ────────────────────────────────────────────────────────
function IssueModal({ issue, onClose }) {
  if (!issue) return null;
  const color = issue.count > 50 ? HZ.red : issue.count > 20 ? HZ.orange : HZ.yellow;
  return (
    <div
      className="hz-dialog-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="hz-dialog" style={{ maxWidth: 900, width: "95vw" }}>
        <div className="hz-dialog__header">
          <div>
            <div className="hz-dialog__title">{issue.type}</div>
            <div className="hz-text-body-s-regular" style={{ color: HZ.neutral500, marginTop: 2 }}>{issue.description}</div>
          </div>
          <button className="hz-dialog__close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="hz-dialog__body" style={{ padding: 0, maxHeight: "60vh", overflow: "auto" }}>
          {(!issue.rows || issue.rows.length === 0) ? (
            <div style={{ padding: "32px", textAlign: "center" }}>
              <p className="hz-text-body-r-regular" style={{ color: HZ.neutral500 }}>Tidak ada detail data tersedia.</p>
            </div>
          ) : issue.isRepeatTopic ? (
            <table className="hz-table" style={{ minWidth: "100%" }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 100 }}>Tanggal</th>
                  <th style={{ minWidth: 140 }}>Nama Agent</th>
                  <th style={{ minWidth: 90 }}>Durasi</th>
                </tr>
              </thead>
              <tbody>
                {issue.rows.map((row, i) => (
                  <tr key={i}>
                    <td>{row.date || "-"}</td>
                    <td>{row.agent_name}</td>
                    <td style={{ fontFamily: "monospace" }}>{row.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : issue.isKycAgent ? (
            <table className="hz-table" style={{ minWidth: "100%" }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 100 }}>Tanggal</th>
                  <th style={{ minWidth: 320 }}>Conversation ID</th>
                  <th style={{ minWidth: 140 }}>Nama Nasabah</th>
                  <th style={{ minWidth: 110 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {issue.rows.map((row, i) => (
                  <tr key={i}>
                    <td>{row.date || "-"}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 13, whiteSpace: "pre" }}>{row.conversation_id}</td>
                    <td>{row.customer_name}</td>
                    <td>
                      <span style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        background: row.kyc_status === "COMPLETED" ? HZ.green + "20" : row.kyc_status === "FAILED" ? HZ.red + "20" : HZ.neutral200,
                        color: row.kyc_status === "COMPLETED" ? HZ.green : row.kyc_status === "FAILED" ? HZ.red : HZ.neutral600,
                      }}>
                        {row.kyc_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : issue.isAgent ? (
            <table className="hz-table" style={{ minWidth: "100%" }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 100 }}>Tanggal</th>
                  <th style={{ minWidth: 320 }}>Conversation ID</th>
                  <th style={{ minWidth: 140 }}>Nama Nasabah</th>
                  <th style={{ minWidth: 90 }}>Durasi</th>
                </tr>
              </thead>
              <tbody>
                {issue.rows.map((row, i) => (
                  <tr key={i}>
                    <td>{row.date || "-"}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 13, whiteSpace: "pre" }}>{row.conversation_id}</td>
                    <td>{row.customer_name}</td>
                    <td style={{ fontFamily: "monospace" }}>{row.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="hz-table" style={{ minWidth: "100%" }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 100 }}>Tanggal</th>
                  <th style={{ minWidth: 320 }}>Conversation ID</th>
                  <th style={{ minWidth: 140 }}>Nama Nasabah</th>
                  <th style={{ minWidth: 120 }}>Nama Agent</th>
                </tr>
              </thead>
              <tbody>
                {issue.rows.map((row, i) => (
                  <tr key={i}>
                    <td>{row.date || "-"}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 13, whiteSpace: "pre" }}>{row.conversation_id}</td>
                    <td>{row.customer_name}</td>
                    <td>{row.agent_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="hz-dialog__footer" style={{ justifyContent: "space-between" }}>
          <span className="hz-text-body-s-regular" style={{ color: HZ.neutral500 }}>
            {issue.rows?.length || 0} baris ditemukan
          </span>
          <span className="hz-badge" style={{ background: color + "20", color }}>
            Total: {issue.count}x
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Issue Card ────────────────────────────────────────────────────────────────
function IssueCard({ issue, onClick }) {
  const color = issue.count > 50 ? HZ.red : issue.count > 20 ? HZ.orange : HZ.yellow;
  return (
    <div
      onClick={onClick}
      style={{
        background: "#FFFFFF",
        borderRadius: 10,
        padding: "12px 16px",
        border: `1px solid ${HZ.neutral200}`,
        borderLeft: `3px solid ${color}`,
        marginBottom: 8,
        cursor: "pointer",
        transition: "box-shadow 150ms ease, transform 150ms ease",
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,.08)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="hz-text-body-r-bold" style={{ color: HZ.neutral900 }}>{issue.type}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="hz-text-body-r-bold" style={{ color, fontFamily: "monospace" }}>{issue.count}x</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={HZ.neutral400} strokeWidth="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
      </div>
      <div className="hz-text-body-s-regular" style={{ color: HZ.neutral600, marginTop: 4 }}>{issue.description}</div>
    </div>
  );
}

// ── Feedback Table ────────────────────────────────────────────────────────────
function FeedbackTable({ items = [], type }) {
  const [query, setQuery] = useState("");
  const color = type === "positive" ? HZ.green : type === "negApp" ? HZ.red : HZ.orange;
  const label = type === "positive" ? "Positive" : type === "negApp" ? "Negative (App)" : "Negative (Service)";

  const visible = query.trim()
    ? items.filter(fb => fb.toLowerCase().includes(query.trim().toLowerCase()))
    : items;

  return (
    <div className="hz-card" style={{ flex: 1, minWidth: 220 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span className="hz-text-body-s-bold" style={{ color, textTransform: "uppercase", letterSpacing: "1px" }}>
          {label}
        </span>
        <span className="hz-badge hz-badge--neutral">{visible.length}/{items.length}</span>
      </div>
      <input
        type="text"
        placeholder="Cari feedback..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{
          width: "100%",
          marginBottom: 8,
          background: "var(--hz-neutral-50, #F8F9FA)",
          border: `1px solid ${HZ.neutral300}`,
          borderRadius: 6,
          padding: "5px 10px",
          fontSize: 12,
          fontFamily: "inherit",
          color: HZ.neutral900,
          outline: "none",
        }}
      />
      <div style={{ maxHeight: 220, overflowY: "auto" }}>
        {visible.map((fb, i) => (
          <div key={i} className="hz-text-body-s-regular" style={{ color: HZ.neutral600, padding: "5px 0", borderBottom: `1px solid ${HZ.neutral100}` }}>
            "{fb}"
          </div>
        ))}
        {visible.length === 0 && (
          <div className="hz-text-body-s-regular" style={{ color: HZ.neutral400, fontStyle: "italic" }}>
            {query ? "Tidak ada hasil untuk pencarian ini" : "Tidak ada data"}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Metric Mini Card ──────────────────────────────────────────────────────────
function MetricMini({ label, val, color }) {
  return (
    <div style={{
      flex: 1,
      background: "var(--hz-neutral-50, #F8F9FA)",
      borderRadius: 8,
      padding: "14px 8px",
      textAlign: "center",
      border: `1px solid ${HZ.neutral200}`,
    }}>
      <div className="hz-text-heading-4" style={{ color, fontFamily: "'JetBrains Mono', monospace" }}>
        {typeof val === "number" ? val.toLocaleString() : val}
      </div>
      <div className="hz-text-body-s-regular" style={{ color: HZ.neutral500, marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ── KYC Funnel ────────────────────────────────────────────────────────────────
function KYCFunnel({ data }) {
  if (!data?.length) return null;
  const max = data[0].value;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {data.map((step, i) => {
        const pct = max > 0 ? (step.value / max) : 0;
        const barW = `${Math.max(20, pct * 100)}%`;
        return (
          <div key={i}>
            {/* Drop rate connector */}
            {step.drop !== null && (
              <div style={{ display: "flex", alignItems: "center", padding: "6px 0 6px 180px", gap: 8 }}>
                <div style={{ width: 1, height: 20, background: HZ.neutral300, marginLeft: 16 }} />
                <span className="hz-badge hz-badge--error" style={{ fontSize: 11 }}>
                  ↓ Drop {step.drop}% · -{(data[i-1].value - step.value).toLocaleString()} konv.
                </span>
              </div>
            )}
            {/* Funnel bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div className="hz-text-body-s-semibold" style={{ width: 160, textAlign: "right", color: HZ.neutral700, flexShrink: 0 }}>
                {step.stage}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  width: barW,
                  height: 44,
                  background: step.color,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 14,
                  transition: "width 0.4s ease",
                }}>
                  <span style={{ color: "#fff", fontWeight: 700, fontSize: 16, fontFamily: "'JetBrains Mono', monospace" }}>
                    {step.value.toLocaleString()}
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, marginLeft: 8 }}>
                    ({(pct * 100).toFixed(1)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Repeat Topic Table with Pagination ────────────────────────────────────────
const PAGE_SIZE = 10;
function RepeatTopicTable({ items, onSelect }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const visible = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="hz-card" style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h3 className="hz-text-body-r-bold" style={{ margin: "0 0 2px", color: HZ.neutral900 }}>Topik Berulang per Nasabah</h3>
          <p className="hz-text-body-s-regular" style={{ color: HZ.neutral500, margin: 0 }}>
            Nasabah yang menelpon dengan topik yang sama lebih dari sekali · klik untuk detail
          </p>
        </div>
        <span className="hz-badge hz-badge--neutral" style={{ flexShrink: 0 }}>{items.length} entri</span>
      </div>

      <div className="hz-table-container">
        <table className="hz-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Nama Nasabah</th>
              <th>Topik</th>
              <th className="align-right">Frekuensi</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr
                key={i}
                style={{ cursor: "pointer" }}
                onClick={() => onSelect({ type: r.customer, description: `Topik: ${r.topic}`, count: r.count, rows: r.rows, isRepeatTopic: true })}
                onMouseEnter={e => e.currentTarget.style.background = "#F0F6FF"}
                onMouseLeave={e => e.currentTarget.style.background = ""}
              >
                <td className="hz-text-body-s-bold" style={{ color: HZ.neutral400 }}>{page * PAGE_SIZE + i + 1}</td>
                <td className="hz-text-body-r-semibold" style={{ color: HZ.neutral900 }}>{r.customer}</td>
                <td className="hz-text-body-r-regular" style={{ color: HZ.neutral700 }}>{r.topic}</td>
                <td className="align-right">
                  <span className="hz-badge" style={{ background: (r.count > 4 ? HZ.red : r.count > 2 ? HZ.orange : HZ.yellow) + "20", color: r.count > 4 ? HZ.red : r.count > 2 ? HZ.orange : HZ.yellow, fontFamily: "monospace" }}>
                    {r.count}x
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          <span className="hz-text-body-s-regular" style={{ color: HZ.neutral500 }}>
            Halaman {page + 1} dari {totalPages} · {items.length} total
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="hz-btn hz-btn--secondary hz-btn--sm"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <span className="hz-btn__label">← Sebelumnya</span>
            </button>
            {Array.from({ length: totalPages }, (_, idx) => (
              <button
                key={idx}
                onClick={() => setPage(idx)}
                style={{
                  width: 32, height: 32, borderRadius: 6, border: `1px solid ${idx === page ? HZ.primary : HZ.neutral300}`,
                  background: idx === page ? HZ.primary : "#FFF",
                  color: idx === page ? "#FFF" : HZ.neutral700,
                  fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                {idx + 1}
              </button>
            ))}
            <button
              className="hz-btn hz-btn--secondary hz-btn--sm"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
            >
              <span className="hz-btn__label">Berikutnya →</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getLastMonday() {
  const d = new Date(); d.setDate(d.getDate() - d.getDay() - 6);
  return d.toISOString().substring(0, 10);
}
function getLastSunday() {
  const d = new Date(); d.setDate(d.getDate() - d.getDay());
  return d.toISOString().substring(0, 10);
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]             = useState("call");
  const [dateFrom, setDateFrom]   = useState(getLastMonday());
  const [dateTo, setDateTo]       = useState(getLastSunday());
  const [kycSheetId, setKycSheetId]   = useState(DEFAULT_SHEETS.kyc);
  const [callSheetId, setCallSheetId] = useState(DEFAULT_SHEETS.call);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [callData, setCallData]       = useState(null);
  const [kycData, setKycData]         = useState(null);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const rawCache = useRef({});

  const handleFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sheetId  = tab === "kyc" ? kycSheetId : callSheetId;
      const gid      = tab === "kyc" ? "136609703" : "0";
      const cacheKey = `${sheetId}_${gid}`;
      if (!rawCache.current[cacheKey]) {
        rawCache.current[cacheKey] = await fetchSheetCSV(sheetId, gid);
      }
      const rows   = rawCache.current[cacheKey];
      const result = tab === "kyc"
        ? processKYCData(rows, dateFrom, dateTo)
        : processCallData(rows, dateFrom, dateTo);
      if (!result) setError("Tidak ada data untuk rentang tanggal yang dipilih.");
      else if (tab === "kyc") setKycData(result);
      else setCallData(result);
    } catch (e) {
      setError(e.message || "Gagal mengambil data");
    }
    setLoading(false);
  }, [tab, dateFrom, dateTo, kycSheetId, callSheetId]);

  const data = tab === "kyc" ? kycData : callData;

  return (
    <div style={{ background: "var(--hz-neutral-50, #F8F9FA)", minHeight: "100vh", padding: "24px 16px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <h1 className="hz-text-heading-5" style={{ color: HZ.neutral1000, margin: 0 }}>
              BSIM S+ GE — Weekly Report Dashboard
            </h1>
            <p className="hz-text-body-s-regular" style={{ color: HZ.neutral500, margin: "4px 0 0" }}>
              Auto-fetch dari Google Sheets · Menggantikan PPT manual
            </p>
          </div>
          <button className="hz-btn hz-btn--secondary hz-btn--sm" onClick={() => setShowConfig(!showConfig)}>
            <span className="hz-btn__label">⚙ Konfigurasi</span>
          </button>
        </div>

        {/* ── Config Panel ── */}
        {showConfig && (
          <div className="hz-card" style={{ marginBottom: 16 }}>
            <h3 className="hz-text-body-r-bold" style={{ marginBottom: 12, color: HZ.neutral900 }}>Google Sheet IDs</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="hz-text-body-s-semibold" style={{ display: "block", marginBottom: 6, color: HZ.neutral600 }}>
                  Manual KYC Sheet ID
                </label>
                <input value={kycSheetId} onChange={e => setKycSheetId(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
              </div>
              <div>
                <label className="hz-text-body-s-semibold" style={{ display: "block", marginBottom: 6, color: HZ.neutral600 }}>
                  In-App Call Sheet ID
                </label>
                <input value={callSheetId} onChange={e => setCallSheetId(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
              </div>
            </div>
            <p className="hz-text-body-s-regular" style={{ color: HZ.neutral500, marginTop: 10 }}>
              Sheet ID = bagian URL antara /d/ dan /edit. Sheet harus di-share "Anyone with the link can view".
            </p>
          </div>
        )}

        {/* ── Date Range + Fetch ── */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
          <span className="hz-text-body-r-regular" style={{ color: HZ.neutral400 }}>→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
          <button
            onClick={handleFetch}
            disabled={loading}
            className={`hz-btn hz-btn--primary hz-btn--md${loading ? " hz-btn--loading" : ""}`}
          >
            <span className="hz-btn__label">{loading ? "Mengambil data..." : "Ambil dari Google Sheets"}</span>
          </button>
        </div>

        {/* ── Error Notification ── */}
        {error && (
          <div className="hz-notification hz-notification--error" style={{ marginBottom: 16 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="hz-tabs" style={{ marginBottom: 20 }}>
          <button className={`hz-tabs__tab${tab === "call" ? " hz-tabs__tab--active" : ""}`} onClick={() => setTab("call")}>
            Panggilan In-App
          </button>
          <button className={`hz-tabs__tab${tab === "kyc" ? " hz-tabs__tab--active" : ""}`} onClick={() => setTab("kyc")}>
            KYC Manual
          </button>
        </div>

        {/* ── Empty State ── */}
        {!data && (
          <div className="hz-card" style={{ padding: "60px 40px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <h2 className="hz-text-heading-6" style={{ marginBottom: 8, color: HZ.neutral900 }}>
              Pilih tanggal lalu klik "Ambil dari Google Sheets"
            </h2>
            <p className="hz-text-body-r-regular" style={{ color: HZ.neutral600, maxWidth: 500, margin: "0 auto" }}>
              Dashboard akan mengambil data dari Google Sheet, memproses semua metrik, dan menampilkan grafik secara otomatis.
            </p>
            <p className="hz-text-body-s-regular" style={{ color: HZ.neutral400, marginTop: 12 }}>
              Sheet harus di-share "Anyone with the link can view" agar bisa diakses.
            </p>
          </div>
        )}

        {/* ════════════ CALL TAB ════════════ */}
        {tab === "call" && data && <>
          <Section
            title="Ringkasan Traffic Panggilan"
            subtitle={`${dateFrom} — ${dateTo} · ${data.totalCalls?.toLocaleString()} total panggilan`}
          >
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <Stat label="Total Panggilan"    value={data.totalCalls}    color={HZ.primary} large />
              <Stat label="Pengguna Unik"      value={data.uniqueUsers}   color={HZ.teal}    large />
              <Stat label="Percobaan/Pengguna" value={data.attemptPerUser} color={HZ.purple}  large />
              <Stat label="Mode Tamu"    value={data.guestMode}    sub={`${(data.guestMode    / data.totalCalls * 100).toFixed(1)}%`} color={HZ.orange} large />
              <Stat label="Pengguna Login" value={data.nonGuestMode} sub={`${(data.nonGuestMode / data.totalCalls * 100).toFixed(1)}%`} color={HZ.green}  large />
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <Stat label="Service Level"      value={`${data.serviceLevel}%`} sub={`${data.resolved} resolved / ${data.totalCalls} total`} color={HZ.green} />
              <Stat label="Avg Call Length"    value={data.avgCallLen}          sub="rata-rata durasi resolved" color={HZ.teal} />
              <Stat label="Repeat Calls"       value={data.repeatCalls}         sub={`dari ${data.repeatUsers} pengguna`} color={HZ.orange} />
            </div>
          </Section>

          {/* Row 1 — Daily Volume + Status Pie */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div className="hz-card">
              <h3 className="hz-text-body-r-bold" style={{ margin: "0 0 12px", color: HZ.neutral900 }}>Volume Panggilan Harian</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.dailyCalls}>
                  <CartesianGrid strokeDasharray="3 3" stroke={HZ.neutral200} />
                  <XAxis dataKey="date" tick={{ fill: HZ.neutral500, fontSize: 10 }} />
                  <YAxis tick={{ fill: HZ.neutral500, fontSize: 10 }} />
                  <Tooltip content={<Tip />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="guest"    name="Tamu"  fill={HZ.orange} stackId="a" />
                  <Bar dataKey="nonGuest" name="Login" fill={HZ.primary} stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="hz-card">
              <h3 className="hz-text-body-r-bold" style={{ margin: "0 0 12px", color: HZ.neutral900 }}>Status Percakapan</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Resolved",  value: data.resolved  },
                      { name: "Dropped",   value: data.dropped   },
                      { name: "Abandoned", value: data.abandoned },
                      { name: "Pre-Queue", value: data.prequeue  },
                    ].filter(d => d.value > 0)}
                    cx="50%" cy="50%" outerRadius={75} innerRadius={40}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false} style={{ fontSize: 9 }}
                  >
                    {[HZ.green, HZ.red, HZ.yellow, HZ.neutral400].map((c, i) => <Cell key={i} fill={c} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Row 2 — Status by Guest/Login */}
          {data.statusByMode?.length > 0 && (
            <div className="hz-card" style={{ marginBottom: 20 }}>
              <h3 className="hz-text-body-r-bold" style={{ margin: "0 0 12px", color: HZ.neutral900 }}>Status Percakapan — Guest Mode vs Login</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.statusByMode}>
                  <CartesianGrid strokeDasharray="3 3" stroke={HZ.neutral200} />
                  <XAxis dataKey="status" tick={{ fill: HZ.neutral600, fontSize: 11 }} />
                  <YAxis tick={{ fill: HZ.neutral500, fontSize: 10 }} />
                  <Tooltip content={<Tip />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="guest" name="Tamu"  fill={HZ.orange} stackId="a" />
                  <Bar dataKey="login" name="Login" fill={HZ.primary} stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Row 3 — Response Time + Waiting Time + Audio */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div className="hz-card">
              <h3 className="hz-text-body-r-bold" style={{ margin: "0 0 12px", color: HZ.neutral900 }}>Waktu Respons (Agen)</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <MetricMini label="< 10 detik"  val={`${data.responseTime?.under10}%`}   color={HZ.green}  />
                <MetricMini label="11–20 detik" val={`${data.responseTime?.["10to20"]}%`} color={HZ.yellow} />
                <MetricMini label="> 20 detik"  val={`${data.responseTime?.over20}%`}     color={HZ.red}    />
              </div>
            </div>
            <div className="hz-card">
              <h3 className="hz-text-body-r-bold" style={{ margin: "0 0 12px", color: HZ.neutral900 }}>Waiting Time (Nasabah)</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <MetricMini label="< 10 detik"  val={`${data.waitingTime?.under10}%`}   color={HZ.green}  />
                <MetricMini label="11–20 detik" val={`${data.waitingTime?.["10to20"]}%`} color={HZ.yellow} />
                <MetricMini label="> 20 detik"  val={`${data.waitingTime?.over20}%`}     color={HZ.red}    />
              </div>
            </div>
            <div className="hz-card">
              <h3 className="hz-text-body-r-bold" style={{ margin: "0 0 12px", color: HZ.neutral900 }}>Masalah Audio</h3>
              {/* Total % */}
              <div style={{ textAlign: "center", marginBottom: 10 }}>
                <div className="hz-text-heading-3" style={{ color: HZ.red, fontFamily: "'JetBrains Mono', monospace" }}>
                  {data.audioIssues?.audioPct}%
                </div>
              </div>
              {/* Guest vs Login breakdown */}
              <div style={{ display: "flex", gap: 8 }}>
                <MetricMini label="Guest Mode"   val={`${data.audioIssues?.audioGuestPct}%`} color={HZ.orange} />
                <MetricMini label="Login"        val={`${data.audioIssues?.audioLoginPct}%`} color={HZ.primary} />
              </div>
              <div className="hz-text-body-s-regular" style={{ color: HZ.neutral400, textAlign: "center", marginTop: 6 }}>
                % dari total kasus audio
              </div>
            </div>
          </div>

          {/* Row 4 — Jam Sibuk */}
          {data.hourlyData?.length > 0 && (
            <div className="hz-card" style={{ marginBottom: 20 }}>
              <h3 className="hz-text-body-r-bold" style={{ margin: "0 0 4px", color: HZ.neutral900 }}>Jam Sibuk</h3>
              <p className="hz-text-body-s-regular" style={{ color: HZ.neutral500, margin: "0 0 12px" }}>
                Jumlah percakapan per jam — <span style={{ color: HZ.orange }}>■ Guest</span> vs <span style={{ color: HZ.primary }}>■ Login</span> (WIB)
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.hourlyData} barCategoryGap="20%" barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke={HZ.neutral200} />
                  <XAxis dataKey="hour" tick={{ fill: HZ.neutral500, fontSize: 9 }} />
                  <YAxis tick={{ fill: HZ.neutral500, fontSize: 10 }} />
                  <Tooltip content={<HourlyTip />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {/* Guest stack */}
                  <Bar dataKey="gResolved"  name="Guest Resolved"  fill={HZ.green}               stackId="guest" />
                  <Bar dataKey="gDropped"   name="Guest Dropped"   fill={HZ.red}                 stackId="guest" />
                  <Bar dataKey="gAbandoned" name="Guest Abandoned" fill={HZ.yellow}              stackId="guest" />
                  <Bar dataKey="gPrequeue"  name="Guest Pre-Queue" fill={HZ.neutral400}           stackId="guest" radius={[3, 3, 0, 0]} />
                  {/* Login stack */}
                  <Bar dataKey="lResolved"  name="Login Resolved"  fill="#0A9A73"                stackId="login" />
                  <Bar dataKey="lDropped"   name="Login Dropped"   fill="#A01010"                stackId="login" />
                  <Bar dataKey="lAbandoned" name="Login Abandoned" fill="#B08000"                stackId="login" />
                  <Bar dataKey="lPrequeue"  name="Login Pre-Queue" fill={HZ.neutral600}           stackId="login" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {data.topicBreakdown?.length > 0 && (
            <div className="hz-card" style={{ marginBottom: 20 }}>
              <h3 className="hz-text-body-r-bold" style={{ margin: "0 0 12px", color: HZ.neutral900 }}>Topik Teratas</h3>
              <ResponsiveContainer width="100%" height={Math.max(200, (data.topicBreakdown?.length || 5) * 26)}>
                <BarChart data={data.topicBreakdown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={HZ.neutral200} />
                  <XAxis type="number" tick={{ fill: HZ.neutral500, fontSize: 10 }} />
                  <YAxis dataKey="topic" type="category" tick={{ fill: HZ.neutral600, fontSize: 9 }} width={220} />
                  <Tooltip content={<Tip />} />
                  <Bar dataKey="count" name="Jumlah" radius={[0, 4, 4, 0]}>
                    {(data.topicBreakdown || []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Agent Ranking */}
          {data.agentRanking?.length > 0 && (
            <div className="hz-card" style={{ marginBottom: 20 }}>
              <h3 className="hz-text-body-r-bold" style={{ margin: "0 0 4px", color: HZ.neutral900 }}>Ranking Agent</h3>
              <p className="hz-text-body-s-regular" style={{ color: HZ.neutral500, margin: "0 0 12px" }}>Klik baris untuk lihat detail percakapan agent</p>
              <div className="hz-table-container">
                <table className="hz-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>#</th>
                      <th>Nama Agent</th>
                      <th className="align-right">Total</th>
                      <th className="align-right">Resolved</th>
                      <th className="align-right">Dropped</th>
                      <th className="align-right">Abandoned</th>
                      <th className="align-right">Rata-rata Durasi</th>
                      <th className="align-right">% Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.agentRanking.map((a, i) => (
                      <tr
                        key={i}
                        style={{ cursor: "pointer" }}
                        onClick={() => setSelectedIssue({ type: a.agent, description: `${a.total} panggilan — Resolved: ${a.resolved} · Dropped: ${a.dropped} · Abandoned: ${a.abandoned}`, count: a.total, rows: a.rows, isAgent: true })}
                        onMouseEnter={e => e.currentTarget.style.background = "#F0F6FF"}
                        onMouseLeave={e => e.currentTarget.style.background = ""}
                      >
                        <td className="hz-text-body-s-bold" style={{ color: HZ.neutral400 }}>{i + 1}</td>
                        <td className="hz-text-body-r-semibold" style={{ color: HZ.neutral900 }}>{a.agent}</td>
                        <td className="align-right hz-text-body-r-bold" style={{ color: HZ.primary, fontFamily: "monospace" }}>{a.total.toLocaleString()}</td>
                        <td className="align-right hz-text-body-r-regular" style={{ color: HZ.green }}>{a.resolved.toLocaleString()}</td>
                        <td className="align-right hz-text-body-r-regular" style={{ color: HZ.red }}>{a.dropped.toLocaleString()}</td>
                        <td className="align-right hz-text-body-r-regular" style={{ color: HZ.yellow }}>{a.abandoned.toLocaleString()}</td>
                        <td className="align-right hz-text-body-r-regular" style={{ color: HZ.neutral700, fontFamily: "monospace" }}>{a.avgDur}</td>
                        <td className="align-right">
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                            <div style={{ width: 50, height: 6, borderRadius: 3, background: HZ.neutral100, overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(100, a.pct)}%`, height: "100%", background: HZ.primary, borderRadius: 3 }} />
                            </div>
                            <span className="hz-text-body-s-bold" style={{ color: HZ.neutral700, minWidth: 36, textAlign: "right" }}>{a.pct}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Repeat Topic Table */}
          {data.repeatTopics?.length > 0 && (
            <RepeatTopicTable items={data.repeatTopics} onSelect={setSelectedIssue} />
          )}

          {data.feedbackAnalysis && (
            <Section title="Feedback Pengguna" subtitle={`Total: ${data.feedbackAnalysis.total} feedback`}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <FeedbackTable items={data.feedbackAnalysis.positiveSamples}   type="positive"   />
                <FeedbackTable items={data.feedbackAnalysis.negAppSamples}     type="negApp"     />
                <FeedbackTable items={data.feedbackAnalysis.negServiceSamples} type="negService" />
              </div>
            </Section>
          )}
        </>}

        {/* ════════════ KYC TAB ════════════ */}
        {tab === "kyc" && data && <>
          <Section title="Ringkasan KYC Manual" subtitle={`${dateFrom} — ${dateTo}`}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <Stat label="Total Panggilan"    value={data.totalCalls}      color={HZ.primary} large />
              <Stat label="Pengguna Unik"      value={data.uniqueUsers}     color={HZ.teal}    large />
              <Stat label="Percobaan/Pengguna" value={data.attemptPerUser}  color={HZ.purple}  large />
              <Stat label="Tingkat Konversi"   value={data.conversionRate + "%"} color={HZ.green} large />
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Stat label="Selesai" value={data.completed} sub={`${(data.completed / Math.max(1, data.completed + data.failed + data.pending) * 100).toFixed(1)}%`} color={HZ.green}  />
              <Stat label="Gagal"   value={data.failed}    sub={`${(data.failed    / Math.max(1, data.completed + data.failed + data.pending) * 100).toFixed(1)}%`} color={HZ.red}    />
              <Stat label="Pending" value={data.pending}   sub={`${(data.pending   / Math.max(1, data.completed + data.failed + data.pending) * 100).toFixed(1)}%`} color={HZ.yellow} />
            </div>
          </Section>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div className="hz-card">
              <h3 className="hz-text-body-r-bold" style={{ margin: "0 0 12px", color: HZ.neutral900 }}>Volume KYC Harian</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.dailyCalls}>
                  <CartesianGrid strokeDasharray="3 3" stroke={HZ.neutral200} />
                  <XAxis dataKey="date" tick={{ fill: HZ.neutral500, fontSize: 10 }} />
                  <YAxis tick={{ fill: HZ.neutral500, fontSize: 10 }} />
                  <Tooltip content={<Tip />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="completed" name="Selesai" fill={HZ.green} stackId="a" />
                  <Bar dataKey="failed"    name="Gagal"   fill={HZ.red}   stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="hz-card">
              <h3 className="hz-text-body-r-bold" style={{ margin: "0 0 4px", color: HZ.neutral900 }}>Alasan Penolakan</h3>
              <p className="hz-text-body-s-regular" style={{ color: HZ.neutral500, margin: "0 0 12px" }}>Klik bar untuk lihat detail percakapan</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={data.rejectionReasons}
                  layout="vertical"
                  style={{ cursor: "pointer" }}
                  onClick={e => {
                    const entry = e?.activePayload?.[0]?.payload;
                    if (entry) setSelectedIssue({ type: entry.reason, description: "Alasan penolakan KYC", count: entry.count, rows: entry.rows || [] });
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={HZ.neutral200} />
                  <XAxis type="number" tick={{ fill: HZ.neutral500, fontSize: 10 }} />
                  <YAxis dataKey="reason" type="category" tick={{ fill: HZ.neutral600, fontSize: 9 }} width={180} />
                  <Tooltip content={<Tip />} />
                  <Bar dataKey="count" name="Jumlah" radius={[0, 4, 4, 0]}>
                    {(data.rejectionReasons || []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div className="hz-card">
              <h3 className="hz-text-body-r-bold" style={{ margin: "0 0 12px", color: HZ.neutral900 }}>Waktu Penugasan</h3>
              <div style={{ background: "var(--hz-neutral-50, #F8F9FA)", borderRadius: 8, padding: "24px 8px", textAlign: "center", border: `1px solid ${HZ.neutral200}` }}>
                <div className="hz-text-heading-1" style={{ color: HZ.green, fontFamily: "'JetBrains Mono', monospace" }}>
                  {data.assignmentTime?.under10}%
                </div>
                <div className="hz-text-body-r-regular" style={{ color: HZ.neutral600, marginTop: 6 }}>Di bawah 10 detik</div>
              </div>
            </div>
            <div className="hz-card">
              <h3 className="hz-text-body-r-bold" style={{ margin: "0 0 12px", color: HZ.neutral900 }}>Waktu Respons</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <MetricMini label="< 10 detik"  val={`${data.responseTime?.under10}%`}   color={HZ.green}  />
                <MetricMini label="11–20 detik" val={`${data.responseTime?.["10to20"]}%`} color={HZ.yellow} />
                <MetricMini label="> 20 detik"  val={`${data.responseTime?.over20}%`}     color={HZ.red}    />
              </div>
            </div>
          </div>

          {/* KYC Agent Ranking */}
          {data.agentRanking?.length > 0 && (
            <div className="hz-card" style={{ marginBottom: 20 }}>
              <h3 className="hz-text-body-r-bold" style={{ margin: "0 0 4px", color: HZ.neutral900 }}>Ranking Agent KYC</h3>
              <p className="hz-text-body-s-regular" style={{ color: HZ.neutral500, margin: "0 0 12px" }}>Klik baris untuk lihat detail percakapan agent</p>
              <div className="hz-table-container">
                <table className="hz-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th>Nama Agent</th>
                      <th className="align-right">Total</th>
                      <th className="align-right">Disetujui</th>
                      <th className="align-right">Ditolak</th>
                      <th className="align-right">% dari Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.agentRanking.map((a, i) => (
                      <tr
                        key={i}
                        style={{ cursor: "pointer" }}
                        onClick={() => setSelectedIssue({ type: a.agent, description: `${a.total} sesi KYC — Disetujui: ${a.approved} · Ditolak: ${a.rejected}`, count: a.total, rows: a.rows, isKycAgent: true })}
                        onMouseEnter={e => e.currentTarget.style.background = "#F0F6FF"}
                        onMouseLeave={e => e.currentTarget.style.background = ""}
                      >
                        <td className="hz-text-body-s-bold" style={{ color: HZ.neutral400 }}>{i + 1}</td>
                        <td className="hz-text-body-r-semibold" style={{ color: HZ.neutral900 }}>{a.agent}</td>
                        <td className="align-right hz-text-body-r-bold" style={{ color: HZ.primary, fontFamily: "monospace" }}>{a.total.toLocaleString()}</td>
                        <td className="align-right hz-text-body-r-regular" style={{ color: HZ.green }}>{a.approved.toLocaleString()}</td>
                        <td className="align-right hz-text-body-r-regular" style={{ color: HZ.red }}>{a.rejected.toLocaleString()}</td>
                        <td className="align-right">
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                            <div style={{ width: 60, height: 6, borderRadius: 3, background: HZ.neutral100, overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(100, a.pct)}%`, height: "100%", background: HZ.primary, borderRadius: 3 }} />
                            </div>
                            <span className="hz-text-body-s-bold" style={{ color: HZ.neutral700, minWidth: 40, textAlign: "right" }}>{a.pct}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.topicBreakdown?.length > 0 && (
            <div className="hz-card" style={{ marginBottom: 20 }}>
              <h3 className="hz-text-body-r-bold" style={{ margin: "0 0 12px", color: HZ.neutral900 }}>Breakdown Topik KYC</h3>
              <ResponsiveContainer width="100%" height={Math.max(120, (data.topicBreakdown?.length || 4) * 30)}>
                <BarChart data={data.topicBreakdown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={HZ.neutral200} />
                  <XAxis type="number" tick={{ fill: HZ.neutral500, fontSize: 10 }} />
                  <YAxis dataKey="topic" type="category" tick={{ fill: HZ.neutral600, fontSize: 9 }} width={240} />
                  <Tooltip content={<Tip />} />
                  <Bar dataKey="count" name="Jumlah" radius={[0, 4, 4, 0]}>
                    {(data.topicBreakdown || []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

        </>}


        {/* ── Issue Detail Modal ── */}
        {selectedIssue && <IssueModal issue={selectedIssue} onClose={() => setSelectedIssue(null)} />}

        {/* ── Footer ── */}
        <div style={{ textAlign: "center", padding: "20px 0", borderTop: `1px solid ${HZ.neutral200}`, marginTop: 20 }}>
          <p className="hz-text-body-s-regular" style={{ color: HZ.neutral400 }}>
            BSIM S+ GE Weekly Dashboard · Data dari Google Sheets
          </p>
        </div>

      </div>
    </div>
  );
}
