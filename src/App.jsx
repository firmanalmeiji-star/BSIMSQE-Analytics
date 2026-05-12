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

// ── Issue Card ────────────────────────────────────────────────────────────────
function IssueCard({ issue }) {
  const color = issue.count > 50 ? HZ.red : issue.count > 20 ? HZ.orange : HZ.yellow;
  return (
    <div style={{
      background: "#FFFFFF",
      borderRadius: 10,
      padding: "12px 16px",
      border: `1px solid ${HZ.neutral200}`,
      borderLeft: `3px solid ${color}`,
      marginBottom: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="hz-text-body-r-bold" style={{ color: HZ.neutral900 }}>{issue.type}</span>
        <span className="hz-text-body-r-bold" style={{ color, fontFamily: "monospace" }}>{issue.count}x</span>
      </div>
      <div className="hz-text-body-s-regular" style={{ color: HZ.neutral600, marginTop: 4 }}>{issue.description}</div>
    </div>
  );
}

// ── Feedback Table ────────────────────────────────────────────────────────────
function FeedbackTable({ items = [], type }) {
  const color = type === "positive" ? HZ.green : type === "negApp" ? HZ.red : HZ.orange;
  const label = type === "positive" ? "Positive" : type === "negApp" ? "Negative (App)" : "Negative (Service)";
  return (
    <div className="hz-card" style={{ flex: 1, minWidth: 200 }}>
      <div className="hz-text-body-s-bold" style={{ color, marginBottom: 8, textTransform: "uppercase", letterSpacing: "1px" }}>
        {label} ({items.length})
      </div>
      <div style={{ maxHeight: 200, overflowY: "auto" }}>
        {items.map((fb, i) => (
          <div key={i} className="hz-text-body-s-regular" style={{ color: HZ.neutral600, padding: "5px 0", borderBottom: `1px solid ${HZ.neutral100}` }}>
            "{fb}"
          </div>
        ))}
        {items.length === 0 && (
          <div className="hz-text-body-s-regular" style={{ color: HZ.neutral400, fontStyle: "italic" }}>Tidak ada data</div>
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
  const [callData, setCallData]   = useState(null);
  const [kycData, setKycData]     = useState(null);
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
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <Stat label="Total Panggilan"    value={data.totalCalls}    color={HZ.primary} large />
              <Stat label="Pengguna Unik"      value={data.uniqueUsers}   color={HZ.teal}    large />
              <Stat label="Percobaan/Pengguna" value={data.attemptPerUser} color={HZ.purple}  large />
              <Stat label="Mode Tamu"    value={data.guestMode}    sub={`${(data.guestMode    / data.totalCalls * 100).toFixed(1)}%`} color={HZ.orange} large />
              <Stat label="Pengguna Login" value={data.nonGuestMode} sub={`${(data.nonGuestMode / data.totalCalls * 100).toFixed(1)}%`} color={HZ.green}  large />
            </div>
          </Section>

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
                    labelLine={false}
                    style={{ fontSize: 9 }}
                  >
                    {[HZ.green, HZ.red, HZ.yellow, HZ.neutral400].map((c, i) => <Cell key={i} fill={c} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div className="hz-card">
              <h3 className="hz-text-body-r-bold" style={{ margin: "0 0 12px", color: HZ.neutral900 }}>Waktu Respons (Agen)</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <MetricMini label="< 10 detik"  val={`${data.responseTime?.under10}%`}         color={HZ.green}  />
                <MetricMini label="11–20 detik" val={`${data.responseTime?.["10to20"]}%`}       color={HZ.yellow} />
                <MetricMini label="> 20 detik"  val={`${data.responseTime?.over20}%`}           color={HZ.red}    />
              </div>
            </div>
            <div className="hz-card">
              <h3 className="hz-text-body-r-bold" style={{ margin: "0 0 12px", color: HZ.neutral900 }}>Ringkasan Masalah Audio</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <MetricMini label="Tidak Ada Suara"    val={data.audioIssues?.tidakAdaSuara}    color={HZ.red}    />
                <MetricMini label="Agent Tdk Didengar" val={data.audioIssues?.suaraAgentTidak}  color={HZ.orange} />
                <MetricMini
                  label="Total Audio %"
                  val={data.totalCalls > 0
                    ? (((data.audioIssues?.tidakAdaSuara || 0) + (data.audioIssues?.suaraAgentTidak || 0) + (data.audioIssues?.terputusSuara || 0)) / data.totalCalls * 100).toFixed(1) + "%"
                    : "0%"}
                  color={HZ.yellow}
                />
              </div>
            </div>
          </div>

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
              <h3 className="hz-text-body-r-bold" style={{ margin: "0 0 12px", color: HZ.neutral900 }}>Alasan Penolakan</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.rejectionReasons} layout="vertical">
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

        {/* ── Issues Section ── */}
        {data?.issues?.length > 0 && (
          <Section title="Identifikasi Masalah" subtitle="Masalah teridentifikasi dari Summary, Topic, dan Feedback">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {data.issues.map((issue, i) => <IssueCard key={i} issue={issue} />)}
            </div>
          </Section>
        )}

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
