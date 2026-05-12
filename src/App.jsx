import { useState, useCallback, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { fetchSheetCSV, processCallData, processKYCData } from "./sheetFetcher";

const C = { bg: "#0a0e1a", card: "#111827", border: "#1f2937", blue: "#3b82f6", red: "#ef4444", orange: "#f97316", emerald: "#10b981", amber: "#eab308", violet: "#8b5cf6", cyan: "#06b6d4", txt: "#f1f5f9", dim: "#94a3b8", muted: "#64748b", pink: "#ec4899" };
const PIE_COLORS = [C.emerald, C.red, C.amber, C.muted, C.violet, C.cyan, C.pink, C.orange];

const DEFAULT_SHEETS = {
  kyc: "11fyn43YY8ROzIjLrN3m8p1fpRdBfYzsU8SqnZs0Ktyo",
  call: "1_mj9wpWFsLAr-mEAsS4ULWL2PuWHM_jKdcB9VcAzgP0"
};

function Stat({ label, value, sub, color = C.blue, large }) {
  return (
    <div style={{ background: C.card, borderRadius: 12, padding: large ? "20px 24px" : "14px 18px", borderLeft: `3px solid ${color}`, flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: large ? 28 : 22, fontWeight: 800, color: C.txt, fontFamily: "'JetBrains Mono', monospace", margin: "2px 0" }}>{typeof value === "number" ? value.toLocaleString() : value}</div>
      {sub && <div style={{ fontSize: 11, color: C.dim }}>{sub}</div>}
    </div>
  );
}

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1a2035", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", boxShadow: "0 8px 24px rgba(0,0,0,.5)" }}>
      <div style={{ fontWeight: 700, color: C.txt, fontSize: 11, marginBottom: 3 }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ color: p.color || p.fill, fontSize: 10, lineHeight: 1.5 }}>{p.name}: <b>{(p.value || 0).toLocaleString()}</b></div>)}
    </div>
  );
};

function Section({ title, subtitle, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, color: C.txt, margin: "0 0 2px" }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 11, color: C.muted, margin: "0 0 12px" }}>{subtitle}</p>}
      {children}
    </div>
  );
}

function IssueCard({ issue }) {
  const color = issue.count > 50 ? C.red : issue.count > 20 ? C.orange : C.amber;
  return (
    <div style={{ background: C.card, borderRadius: 10, padding: "12px 16px", borderLeft: `3px solid ${color}`, marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.txt }}>{issue.type}</span>
        <span style={{ fontSize: 12, fontWeight: 800, color, fontFamily: "monospace" }}>{issue.count}x</span>
      </div>
      <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>{issue.description}</div>
    </div>
  );
}

function FeedbackTable({ items = [], type }) {
  const color = type === "positive" ? C.emerald : type === "negApp" ? C.red : C.orange;
  const label = type === "positive" ? "Positive" : type === "negApp" ? "Negative (App)" : "Negative (Service)";
  return (
    <div style={{ background: C.card, borderRadius: 10, padding: 14, flex: 1, minWidth: 200 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>{label} ({items.length})</div>
      <div style={{ maxHeight: 200, overflowY: "auto" }}>
        {items.map((fb, i) => (
          <div key={i} style={{ fontSize: 11, color: C.dim, padding: "5px 0", borderBottom: `1px solid ${C.border}22` }}>"{fb}"</div>
        ))}
        {items.length === 0 && <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>No data</div>}
      </div>
    </div>
  );
}

function getLastMonday() {
  const d = new Date(); d.setDate(d.getDate() - d.getDay() - 6);
  return d.toISOString().substring(0, 10);
}
function getLastSunday() {
  const d = new Date(); d.setDate(d.getDate() - d.getDay());
  return d.toISOString().substring(0, 10);
}

export default function App() {
  const [tab, setTab] = useState("call");
  const [dateFrom, setDateFrom] = useState(getLastMonday());
  const [dateTo, setDateTo] = useState(getLastSunday());
  const [kycSheetId, setKycSheetId] = useState(DEFAULT_SHEETS.kyc);
  const [callSheetId, setCallSheetId] = useState(DEFAULT_SHEETS.call);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [callData, setCallData] = useState(null);
  const [kycData, setKycData] = useState(null);

  const rawCache = useRef({});

  const handleFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sheetId = tab === "kyc" ? kycSheetId : callSheetId;
      const gid = tab === "kyc" ? "136609703" : "0";
      const cacheKey = `${sheetId}_${gid}`;

      // Cache raw data so we don't re-download when changing date range
      if (!rawCache.current[cacheKey]) {
        rawCache.current[cacheKey] = await fetchSheetCSV(sheetId, gid);
      }
      const rows = rawCache.current[cacheKey];

      const result = tab === "kyc"
        ? processKYCData(rows, dateFrom, dateTo)
        : processCallData(rows, dateFrom, dateTo);

      if (!result) {
        setError("No data found for the selected date range.");
      } else {
        if (tab === "kyc") setKycData(result);
        else setCallData(result);
      }
    } catch (e) {
      setError(e.message || "Failed to fetch data");
    }
    setLoading(false);
  }, [tab, dateFrom, dateTo, kycSheetId, callSheetId]);

  const data = tab === "kyc" ? kycData : callData;

  const tabBtn = (key, label) => (
    <button onClick={() => setTab(key)} style={{ padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, background: tab === key ? C.blue : "transparent", color: tab === key ? "#fff" : C.dim, transition: "all .15s" }}>{label}</button>
  );

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.txt, padding: "20px 16px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, fontFamily: "'Inter', sans-serif" }}>BSIM S+ GE — Weekly Report Dashboard</h1>
            <p style={{ fontSize: 12, color: C.muted, margin: "4px 0 0" }}>Auto-fetch from Google Sheets · Replaces manual PPT</p>
          </div>
          <button onClick={() => setShowConfig(!showConfig)} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 14px", color: C.dim, fontSize: 12, cursor: "pointer" }}>⚙️ Config</button>
        </div>

        {/* Config Panel */}
        {showConfig && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Google Sheet IDs</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={{ fontSize: 10, color: C.muted, display: "block", marginBottom: 4 }}>Manual KYC Sheet ID</label>
                <input value={kycSheetId} onChange={e => setKycSheetId(e.target.value)} style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", color: C.txt, fontSize: 11 }} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: C.muted, display: "block", marginBottom: 4 }}>In-App Call Sheet ID</label>
                <input value={callSheetId} onChange={e => setCallSheetId(e.target.value)} style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", color: C.txt, fontSize: 11 }} />
              </div>
            </div>
            <p style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>Sheet ID = bagian URL antara /d/ dan /edit. Sheet harus di-share: "Anyone with the link can view". GID bisa dilihat di URL (?gid=...).</p>
          </div>
        )}

        {/* Date Range + Fetch */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 12px", color: C.txt, fontSize: 13 }} />
          <span style={{ color: C.muted, fontSize: 13 }}>→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 12px", color: C.txt, fontSize: 13 }} />
          <button onClick={handleFetch} disabled={loading} style={{ background: loading ? C.muted : C.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 24px", fontSize: 13, fontWeight: 700, cursor: loading ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            {loading ? <><span className="spin">⟳</span> Fetching...</> : "🔄 Fetch from Google Sheets"}
          </button>
          <style>{`.spin { display: inline-block; animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>

        {error && <div style={{ background: C.red + "15", border: `1px solid ${C.red}30`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.red, marginBottom: 16 }}>{error}</div>}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: C.card, borderRadius: 10, padding: 3, width: "fit-content" }}>
          {tabBtn("call", "📞 In-App Call Traffic")}
          {tabBtn("kyc", "🪪 Manual KYC")}
        </div>

        {/* No data state */}
        {!data && (
          <div style={{ background: C.card, borderRadius: 16, padding: "60px 40px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Pilih tanggal lalu klik "Fetch from Google Sheets"</h2>
            <p style={{ fontSize: 13, color: C.dim, maxWidth: 500, margin: "0 auto" }}>
              Dashboard akan mengambil data dari Google Sheet, memproses semua metrik, dan menampilkan grafik secara otomatis.
            </p>
            <p style={{ fontSize: 11, color: C.muted, marginTop: 12 }}>
              Sheet harus di-share "Anyone with the link can view" agar bisa diakses oleh dashboard.
            </p>
          </div>
        )}

        {/* ===== CALL TAB ===== */}
        {tab === "call" && data && <>
          <Section title="Call Traffic Overview" subtitle={`${dateFrom} — ${dateTo} · ${data.totalCalls?.toLocaleString()} total calls`}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <Stat label="Total Calls" value={data.totalCalls} color={C.blue} large />
              <Stat label="Unique Users" value={data.uniqueUsers} color={C.cyan} large />
              <Stat label="Attempt/User" value={data.attemptPerUser} color={C.violet} large />
              <Stat label="Guest Mode" value={data.guestMode} sub={`${(data.guestMode / data.totalCalls * 100).toFixed(1)}%`} color={C.orange} large />
              <Stat label="Login User" value={data.nonGuestMode} sub={`${(data.nonGuestMode / data.totalCalls * 100).toFixed(1)}%`} color={C.emerald} large />
            </div>
          </Section>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div style={{ background: C.card, borderRadius: 12, padding: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>Daily Call Volume</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.dailyCalls}><CartesianGrid strokeDasharray="3 3" stroke={C.border} /><XAxis dataKey="date" tick={{ fill: C.dim, fontSize: 10 }} /><YAxis tick={{ fill: C.dim, fontSize: 10 }} /><Tooltip content={<Tip />} /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="guest" name="Guest" fill={C.orange} stackId="a" /><Bar dataKey="nonGuest" name="Login" fill={C.blue} stackId="a" radius={[4, 4, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: C.card, borderRadius: 12, padding: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>Conversation Status</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart><Pie data={[{ name: "Resolved", value: data.resolved }, { name: "Dropped", value: data.dropped }, { name: "Abandoned", value: data.abandoned }, { name: "Pre-Queue", value: data.prequeue }].filter(d => d.value > 0)} cx="50%" cy="50%" outerRadius={75} innerRadius={40} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 9 }}>{[C.emerald, C.red, C.amber, C.muted].map((c, i) => <Cell key={i} fill={c} />)}</Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div style={{ background: C.card, borderRadius: 12, padding: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>Response Time (Agent)</h3>
              <div style={{ display: "flex", gap: 8 }}>
                {[{ label: "< 10s", val: data.responseTime?.under10, color: C.emerald }, { label: "11-20s", val: data.responseTime?.["10to20"], color: C.amber }, { label: "> 20s", val: data.responseTime?.over20, color: C.red }].map((r, i) => (
                  <div key={i} style={{ flex: 1, background: C.bg, borderRadius: 8, padding: "14px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: r.color, fontFamily: "monospace" }}>{r.val}%</div>
                    <div style={{ fontSize: 10, color: C.dim }}>{r.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: C.card, borderRadius: 12, padding: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>Audio Issues Summary</h3>
              <div style={{ display: "flex", gap: 8 }}>
                {[{ label: "Tidak Ada Suara", val: data.audioIssues?.tidakAdaSuara, color: C.red }, { label: "Agent Tdk Didengar", val: data.audioIssues?.suaraAgentTidak, color: C.orange }, { label: "Total Audio %", val: data.totalCalls > 0 ? (((data.audioIssues?.tidakAdaSuara || 0) + (data.audioIssues?.suaraAgentTidak || 0) + (data.audioIssues?.terputusSuara || 0)) / data.totalCalls * 100).toFixed(1) + "%" : "0%", color: C.amber }].map((r, i) => (
                  <div key={i} style={{ flex: 1, background: C.bg, borderRadius: 8, padding: "14px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: r.color, fontFamily: "monospace" }}>{typeof r.val === "number" ? r.val.toLocaleString() : r.val}</div>
                    <div style={{ fontSize: 9, color: C.dim }}>{r.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {data.topicBreakdown?.length > 0 && (
            <div style={{ background: C.card, borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>Top Topics</h3>
              <ResponsiveContainer width="100%" height={Math.max(200, (data.topicBreakdown?.length || 5) * 26)}>
                <BarChart data={data.topicBreakdown} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke={C.border} /><XAxis type="number" tick={{ fill: C.dim, fontSize: 10 }} /><YAxis dataKey="topic" type="category" tick={{ fill: C.dim, fontSize: 9 }} width={220} /><Tooltip content={<Tip />} /><Bar dataKey="count" name="Count" fill={C.blue} radius={[0, 4, 4, 0]}>{(data.topicBreakdown || []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Bar></BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {data.feedbackAnalysis && (
            <Section title="User Feedback" subtitle={`Total: ${data.feedbackAnalysis.total} feedback`}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <FeedbackTable items={data.feedbackAnalysis.positiveSamples} type="positive" />
                <FeedbackTable items={data.feedbackAnalysis.negAppSamples} type="negApp" />
                <FeedbackTable items={data.feedbackAnalysis.negServiceSamples} type="negService" />
              </div>
            </Section>
          )}
        </>}

        {/* ===== KYC TAB ===== */}
        {tab === "kyc" && data && <>
          <Section title="Manual KYC Overview" subtitle={`${dateFrom} — ${dateTo}`}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <Stat label="Total Calls" value={data.totalCalls} color={C.blue} large />
              <Stat label="Unique Users" value={data.uniqueUsers} color={C.cyan} large />
              <Stat label="Attempt/User" value={data.attemptPerUser} color={C.violet} large />
              <Stat label="Conversion Rate" value={data.conversionRate + "%"} color={C.emerald} large />
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Stat label="Completed" value={data.completed} sub={`${(data.completed / Math.max(1, data.completed + data.failed + data.pending) * 100).toFixed(1)}%`} color={C.emerald} />
              <Stat label="Failed" value={data.failed} sub={`${(data.failed / Math.max(1, data.completed + data.failed + data.pending) * 100).toFixed(1)}%`} color={C.red} />
              <Stat label="Pending" value={data.pending} sub={`${(data.pending / Math.max(1, data.completed + data.failed + data.pending) * 100).toFixed(1)}%`} color={C.amber} />
            </div>
          </Section>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div style={{ background: C.card, borderRadius: 12, padding: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>Daily KYC Volume</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.dailyCalls}><CartesianGrid strokeDasharray="3 3" stroke={C.border} /><XAxis dataKey="date" tick={{ fill: C.dim, fontSize: 10 }} /><YAxis tick={{ fill: C.dim, fontSize: 10 }} /><Tooltip content={<Tip />} /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="completed" name="Completed" fill={C.emerald} stackId="a" /><Bar dataKey="failed" name="Failed" fill={C.red} stackId="a" radius={[4, 4, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: C.card, borderRadius: 12, padding: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>Rejection Reasons</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.rejectionReasons} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke={C.border} /><XAxis type="number" tick={{ fill: C.dim, fontSize: 10 }} /><YAxis dataKey="reason" type="category" tick={{ fill: C.dim, fontSize: 9 }} width={180} /><Tooltip content={<Tip />} /><Bar dataKey="count" name="Count" fill={C.red} radius={[0, 4, 4, 0]}>{(data.rejectionReasons || []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Bar></BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div style={{ background: C.card, borderRadius: 12, padding: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>Assignment Time</h3>
              <div style={{ background: C.bg, borderRadius: 8, padding: "20px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: C.emerald, fontFamily: "monospace" }}>{data.assignmentTime?.under10}%</div>
                <div style={{ fontSize: 11, color: C.dim }}>Under 10 seconds</div>
              </div>
            </div>
            <div style={{ background: C.card, borderRadius: 12, padding: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>Response Time</h3>
              <div style={{ display: "flex", gap: 8 }}>
                {[{ label: "< 10s", val: data.responseTime?.under10, color: C.emerald }, { label: "11-20s", val: data.responseTime?.["10to20"], color: C.amber }, { label: "> 20s", val: data.responseTime?.over20, color: C.red }].map((r, i) => (
                  <div key={i} style={{ flex: 1, background: C.bg, borderRadius: 8, padding: "14px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: r.color, fontFamily: "monospace" }}>{r.val}%</div>
                    <div style={{ fontSize: 10, color: C.dim }}>{r.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {data.topicBreakdown?.length > 0 && (
            <div style={{ background: C.card, borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>KYC Topic Breakdown</h3>
              <ResponsiveContainer width="100%" height={Math.max(120, (data.topicBreakdown?.length || 4) * 30)}>
                <BarChart data={data.topicBreakdown} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke={C.border} /><XAxis type="number" tick={{ fill: C.dim, fontSize: 10 }} /><YAxis dataKey="topic" type="category" tick={{ fill: C.dim, fontSize: 9 }} width={240} /><Tooltip content={<Tip />} /><Bar dataKey="count" name="Count" fill={C.blue} radius={[0, 4, 4, 0]}>{(data.topicBreakdown || []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Bar></BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>}

        {/* Issues Section */}
        {data?.issues?.length > 0 && (
          <Section title="🔍 Issue Identification" subtitle="Masalah teridentifikasi dari Summary, Topic, dan Feedback">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {data.issues.map((issue, i) => <IssueCard key={i} issue={issue} />)}
            </div>
          </Section>
        )}

        <div style={{ textAlign: "center", padding: "20px 0", borderTop: `1px solid ${C.border}`, marginTop: 20 }}>
          <p style={{ fontSize: 11, color: C.muted }}>BSIM S+ GE Weekly Dashboard · Data from Google Sheets via Netlify Functions</p>
        </div>
      </div>
    </div>
  );
}
