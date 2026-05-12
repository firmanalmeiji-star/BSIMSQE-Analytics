import Papa from "papaparse";

// Fetch Google Sheet as CSV via public export URL
// Sheet must be shared: "Anyone with the link can view"
export async function fetchSheetCSV(sheetId, gid = "0") {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch sheet (${res.status}). Make sure it's shared publicly.`);
  const text = await res.text();
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
  return data;
}

// Case-insensitive field lookup to handle header variations in Google Sheets
function getField(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== "") return row[k];
    const found = Object.keys(row).find(rk => rk.trim().toLowerCase() === k.toLowerCase());
    if (found && row[found] !== undefined && row[found] !== "") return row[found];
  }
  return "-";
}

export function processCallData(rows, dateFrom, dateTo) {
  const from = new Date(dateFrom + "T00:00:00Z");
  const to = new Date(dateTo + "T23:59:59Z");
  const filtered = rows.filter(r => {
    const d = new Date(r.created_at);
    return d >= from && d <= to;
  });

  const total = filtered.length;
  if (total === 0) return null;

  const uniq = new Set(filtered.map(r => (r.cust_name || "").trim()).filter(n => n && n.toLowerCase() !== "guest"));
  const resolved = filtered.filter(r => r.status === "RESOLVED").length;
  const dropped = filtered.filter(r => r.status === "DROPPED").length;
  const abandoned = filtered.filter(r => r.status === "ABANDONED").length;
  const prequeue = filtered.filter(r => r.status === "PRE_QUEUE").length;

  const guestMode = filtered.filter(r => String(r.guest_mode).toUpperCase() === "TRUE").length;
  const guestName = filtered.filter(r => (r.cust_name || "").trim().toLowerCase() === "guest").length;

  const respTimes = filtered.filter(r => r.response_time && !isNaN(+r.response_time)).map(r => +r.response_time);
  const rt = { under10: 0, mid: 0, over20: 0, total: respTimes.length };
  respTimes.forEach(t => { if (t < 10) rt.under10++; else if (t <= 20) rt.mid++; else rt.over20++; });

  const audioTopics = {
    tidakAdaSuara:  r => r.Topic === "Panggilan diakhiri (Tidak ada Suara nasabah)",
    suaraAgent:     r => r.Topic === "Panggilan diakhiri (Suara agent tidak didengar nasabah)",
    terputusSuara:  r => r.Topic === "Terputus (Suara nasabah tidak ada)",
  };
  const isGuest = r => String(r.guest_mode).toUpperCase() === "TRUE";
  const audioRows = filtered.filter(r => Object.values(audioTopics).some(fn => fn(r)));
  const tidakAdaSuara  = filtered.filter(audioTopics.tidakAdaSuara).length;
  const suaraAgent     = filtered.filter(audioTopics.suaraAgent).length;
  const terputusSuara  = filtered.filter(audioTopics.terputusSuara).length;
  const audioTotal     = audioRows.length;
  const audioGuest     = audioRows.filter(isGuest).length;
  const audioLogin     = audioTotal - audioGuest;
  const audioPct       = total > 0 ? (audioTotal / total * 100).toFixed(1) : "0";
  const audioGuestPct  = audioTotal > 0 ? (audioGuest / audioTotal * 100).toFixed(1) : "0";
  const audioLoginPct  = audioTotal > 0 ? (audioLogin / audioTotal * 100).toFixed(1) : "0";

  const TOPIC_EXCLUDE = new Set([
    "Panggilan diakhiri (Tidak ada Suara nasabah)",
    "Panggilan diakhiri (Suara agent tidak didengar nasabah)",
  ]);
  const topicMap = {};
  filtered.forEach(r => { const t = (r.Topic || "").trim(); if (t && t !== "-" && !TOPIC_EXCLUDE.has(t)) topicMap[t] = (topicMap[t] || 0) + 1; });
  const topicBreakdown = Object.entries(topicMap).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([topic, count]) => ({ topic: topic.length > 40 ? topic.substring(0, 40) + "…" : topic, count }));

  // Status by mode (guest vs login per status)
  const statusModeMap = { RESOLVED: { guest: 0, login: 0 }, DROPPED: { guest: 0, login: 0 }, ABANDONED: { guest: 0, login: 0 }, PRE_QUEUE: { guest: 0, login: 0 } };
  filtered.forEach(r => {
    const s = r.status; const isGuest = String(r.guest_mode).toUpperCase() === "TRUE";
    if (statusModeMap[s]) { if (isGuest) statusModeMap[s].guest++; else statusModeMap[s].login++; }
  });
  const statusByMode = Object.entries(statusModeMap)
    .filter(([, v]) => v.guest + v.login > 0)
    .map(([s, v]) => ({ status: s.charAt(0) + s.slice(1).toLowerCase().replace("_queue", "-Queue"), guest: v.guest, login: v.login }));

  // Hourly data — WIB (UTC+7), split by guest/login
  const hourMap = {};
  for (let h = 0; h < 24; h++) hourMap[h] = {
    hour: String(h).padStart(2, "0") + ":00",
    gResolved: 0, gDropped: 0, gAbandoned: 0, gPrequeue: 0,
    lResolved: 0, lDropped: 0, lAbandoned: 0, lPrequeue: 0,
    total: 0,
  };
  filtered.forEach(r => {
    const h = (new Date(r.created_at).getUTCHours() + 7) % 24;
    const guest = String(r.guest_mode).toUpperCase() === "TRUE";
    const p = guest ? "g" : "l";
    hourMap[h].total++;
    if (r.status === "RESOLVED")  hourMap[h][p + "Resolved"]++;
    else if (r.status === "DROPPED")   hourMap[h][p + "Dropped"]++;
    else if (r.status === "ABANDONED") hourMap[h][p + "Abandoned"]++;
    else if (r.status === "PRE_QUEUE") hourMap[h][p + "Prequeue"]++;
  });
  const hourlyData = Object.values(hourMap).filter(h => h.total > 0);

  // Waiting time
  const waitTimes = filtered.filter(r => r["Wait Time"] && !isNaN(+r["Wait Time"])).map(r => +r["Wait Time"]);
  const wt = { u10: 0, mid: 0, o20: 0, total: waitTimes.length };
  waitTimes.forEach(t => { if (t < 10) wt.u10++; else if (t <= 20) wt.mid++; else wt.o20++; });
  const waitingTime = {
    under10: wt.total ? (wt.u10 / wt.total * 100).toFixed(1) : "0",
    "10to20": wt.total ? (wt.mid / wt.total * 100).toFixed(1) : "0",
    over20:   wt.total ? (wt.o20 / wt.total * 100).toFixed(1) : "0",
  };

  // Agent ranking
  const agentMap = {};
  filtered.forEach(r => {
    const agent = (r.agent_name || "").trim();
    if (!agent || agent === "-") return;
    if (!agentMap[agent]) agentMap[agent] = { total: 0, guest: 0, login: 0, resolved: 0, dropped: 0, abandoned: 0, durSecs: [], rows: [] };
    agentMap[agent].total++;
    if (String(r.guest_mode).toUpperCase() === "TRUE") agentMap[agent].guest++; else agentMap[agent].login++;
    if (r.status === "RESOLVED")  agentMap[agent].resolved++;
    if (r.status === "DROPPED")   agentMap[agent].dropped++;
    if (r.status === "ABANDONED") agentMap[agent].abandoned++;
    const jawab = r.jawab_at  ? new Date(r.jawab_at).getTime()  : null;
    const end   = r.end_time  ? new Date(r.end_time).getTime()  : null;
    if (jawab && end && end > jawab) agentMap[agent].durSecs.push((end - jawab) / 1000);
    agentMap[agent].rows.push(r);
  });
  const fmtDur = secs => {
    if (!secs || isNaN(secs)) return "-";
    const m = Math.floor(secs / 60), s = Math.round(secs % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };
  const agentRanking = Object.entries(agentMap)
    .map(([agent, v]) => {
      const avgSec = v.durSecs.length ? v.durSecs.reduce((a, b) => a + b, 0) / v.durSecs.length : null;
      const rows = v.rows.map(r => ({
        date:          (r.created_at || "").substring(0, 10),
        conversation_id: getField(r, 'conv_id', 'Convo id', 'convo_id', 'conversation_id'),
        customer_name: r.cust_name || "-",
        duration:      (() => {
          const j = r.jawab_at  ? new Date(r.jawab_at).getTime()  : null;
          const e = r.end_time  ? new Date(r.end_time).getTime()  : null;
          return j && e && e > j ? fmtDur((e - j) / 1000) : "-";
        })(),
      }));
      return { agent, total: v.total, guest: v.guest, login: v.login, resolved: v.resolved, dropped: v.dropped, abandoned: v.abandoned, avgDur: fmtDur(avgSec), pct: (v.total / total * 100).toFixed(1), rows };
    })
    .sort((a, b) => b.total - a.total);

  const dailyMap = {};
  filtered.forEach(r => {
    const d = (r.created_at || "").substring(0, 10);
    if (!d) return;
    if (!dailyMap[d]) dailyMap[d] = { total: 0, guest: 0, nonGuest: 0 };
    dailyMap[d].total++;
    if (String(r.guest_mode).toUpperCase() === "TRUE") dailyMap[d].guest++; else dailyMap[d].nonGuest++;
  });
  const dailyCalls = Object.entries(dailyMap).sort().map(([d, v]) => ({ date: d.substring(5), ...v }));

  // Feedback
  const fbs = filtered.filter(r => (r.Feedback || "").trim()).map(r => r.Feedback.trim());
  const audioKw = ["suara", "tidak terdengar", "mute", "mematikan", "mikropon", "tidak ada suara", "ga ada suara", "gada suara"];
  const putusKw = ["terputus", "putus", "ditutup", "di tutup", "dimatikan", "end call"];
  const connectKw = ["tidak bisa sambung", "tidak bisa digunakan", "susah"];
  const posKw = ["bagus", "baik", "ramah", "membantu", "puas", "terima kasih", "mantap", "good", "luar biasa", "cepat", "sipp", "terbaik"];
  const pos = [], negApp = [], negSvc = [];
  fbs.forEach(fb => {
    const l = fb.toLowerCase();
    if ([...audioKw, ...putusKw, ...connectKw].some(k => l.includes(k))) negApp.push(fb);
    else if (posKw.some(k => l.includes(k))) pos.push(fb);
    else if (fb.length > 10) negSvc.push(fb);
  });

  // Issues
  const toDetail = rows => rows.map(r => ({
    date:            (r.created_at || "").substring(0, 10),
    conversation_id: getField(r, 'conv_id', 'Convo id', 'convo_id', 'conversation_id'),
    customer_name:   r.cust_name || "-",
    agent_name:      r.agent_name || "-",
  }));

  const issues = [];
  const audioNoSoundRows = filtered.filter(r => ["Panggilan diakhiri (Tidak ada Suara nasabah)", "Terputus (Suara nasabah tidak ada)"].includes(r.Topic));
  if (audioNoSoundRows.length > 0) issues.push({ type: "Audio - Tidak Ada Suara Nasabah", description: "Nasabah tidak bisa berbicara/didengar agent. Dominan di Guest Mode", count: audioNoSoundRows.length, rows: toDetail(audioNoSoundRows) });

  const agentNoHearRows = filtered.filter(r => r.Topic === "Panggilan diakhiri (Suara agent tidak didengar nasabah)");
  if (agentNoHearRows.length > 0) issues.push({ type: "Audio - Suara Agent Tidak Didengar", description: "Agent bicara tapi nasabah tidak dengar", count: agentNoHearRows.length, rows: toDetail(agentNoHearRows) });

  const muteRows = filtered.filter(r => /mute|mematikan/i.test(r.Feedback || ""));
  if (muteRows.length > 0) issues.push({ type: "Agent Mute Complaint", description: "Feedback: agent mematikan suara/mikropon", count: muteRows.length, rows: toDetail(muteRows) });

  const putusRows = filtered.filter(r => putusKw.some(k => (r.Feedback || "").toLowerCase().includes(k)));
  if (putusRows.length > 0) issues.push({ type: "Panggilan Terputus", description: "Panggilan terputus sebelum selesai", count: putusRows.length, rows: toDetail(putusRows) });

  const guestAudioRows = filtered.filter(r => String(r.guest_mode).toUpperCase() === "TRUE" && ["Panggilan diakhiri (Tidak ada Suara nasabah)", "Panggilan diakhiri (Suara agent tidak didengar nasabah)"].includes(r.Topic));
  const totalAudio = tidakAdaSuara + suaraAgent;
  if (totalAudio > 10 && guestAudioRows.length / totalAudio > 0.6) issues.push({ type: "Guest Mode Audio Disproportion", description: `Guest = ${(guestAudioRows.length / totalAudio * 100).toFixed(0)}% audio issues vs ${(guestMode / total * 100).toFixed(0)}% total calls`, count: guestAudioRows.length, rows: toDetail(guestAudioRows) });
  issues.sort((a, b) => b.count - a.count);

  // Service Level = resolved / total * 100
  const serviceLevel = (resolved / total * 100).toFixed(1);

  // Average Call Length = avg duration of resolved calls (jawab_at → end_time)
  const resolvedRows = filtered.filter(r => r.status === "RESOLVED");
  const resolvedDurs = resolvedRows.map(r => {
    const j = r.jawab_at ? new Date(r.jawab_at).getTime() : null;
    const e = r.end_time ? new Date(r.end_time).getTime() : null;
    return j && e && e > j ? (e - j) / 1000 : null;
  }).filter(v => v !== null);
  const avgCallLenSec = resolvedDurs.length ? resolvedDurs.reduce((a, b) => a + b, 0) / resolvedDurs.length : null;
  const avgCallLen = avgCallLenSec
    ? `${Math.floor(avgCallLenSec / 60)}:${String(Math.round(avgCallLenSec % 60)).padStart(2, "0")}`
    : "-";

  // Repeat Calls = calls from customers who called more than once
  const custCallMap = {};
  filtered.forEach(r => {
    const name = (r.cust_name || "").trim();
    if (name && name.toLowerCase() !== "guest") custCallMap[name] = (custCallMap[name] || 0) + 1;
  });
  const repeatUsers  = Object.values(custCallMap).filter(c => c > 1).length;
  const repeatCalls  = Object.values(custCallMap).filter(c => c > 1).reduce((a, b) => a + b, 0);

  return {
    totalCalls: total, uniqueUsers: uniq.size, attemptPerUser: (total / Math.max(1, uniq.size)).toFixed(1),
    serviceLevel, avgCallLen, repeatCalls, repeatUsers,
    resolved, dropped, abandoned, prequeue,
    guestMode, nonGuestMode: total - guestMode, guestName, loginName: total - guestName,
    responseTime: { under10: rt.total ? (rt.under10 / rt.total * 100).toFixed(2) : 0, "10to20": rt.total ? (rt.mid / rt.total * 100).toFixed(2) : 0, over20: rt.total ? (rt.over20 / rt.total * 100).toFixed(2) : 0 },
    audioIssues: { tidakAdaSuara, suaraAgentTidak: suaraAgent, terputusSuara, audioTotal, audioGuest, audioLogin, audioPct, audioGuestPct, audioLoginPct },
    topicBreakdown, dailyCalls,
    statusByMode, hourlyData, waitingTime, agentRanking,
    feedbackAnalysis: { total: fbs.length, positiveSamples: pos, negAppSamples: negApp, negServiceSamples: negSvc },
    issues
  };
}

export function processKYCData(rows, dateFrom, dateTo) {
  const from = new Date(dateFrom + "T00:00:00Z");
  const to = new Date(dateTo + "T23:59:59Z");
  const filtered = rows.filter(r => {
    const d = new Date(r.created_at);
    return d >= from && d <= to;
  });

  const total = filtered.length;
  if (total === 0) return null;

  // Unique users excluding guest
  const isGuest = r => (r.cust_name || "").trim().toLowerCase() === "guest" || !(r.cust_name || "").trim();
  const uniq = new Set(filtered.filter(r => !isGuest(r)).map(r => r.cust_name.trim()));
  const resolved = filtered.filter(r => r.status === "RESOLVED").length;
  const dropped = filtered.filter(r => r.status === "DROPPED").length;

  // Per unique user: find latest resolved call → determine kyc outcome
  const userLatestResolved = {};
  filtered
    .filter(r => !isGuest(r) && r.status === "RESOLVED")
    .forEach(r => {
      const name = r.cust_name.trim();
      const ts = new Date(r.created_at).getTime();
      if (!userLatestResolved[name] || ts > userLatestResolved[name].ts) {
        userLatestResolved[name] = { ts, kyc_status: (r.kyc_status || "").trim() };
      }
    });

  let completed = 0, failed = 0, pending = 0;
  Object.values(userLatestResolved).forEach(({ kyc_status }) => {
    if (kyc_status === "COMPLETED") completed++;
    else if (kyc_status === "FAILED") failed++;
    else pending++;
  });

  const waitTimes = filtered.filter(r => r["Wait Time"] && !isNaN(+r["Wait Time"])).map(r => +r["Wait Time"]);
  const u10w = waitTimes.filter(t => t <= 10).length;

  const respTimes = filtered.filter(r => r["Jawab Duration"] && !isNaN(+r["Jawab Duration"])).map(r => +r["Jawab Duration"]);
  const rt = { u10: 0, mid: 0, o20: 0, total: respTimes.length };
  respTimes.forEach(t => { if (t < 10) rt.u10++; else if (t <= 20) rt.mid++; else rt.o20++; });

  const rejMap = {};
  filtered.forEach(r => { const rr = (r.rejection_reason || "").trim(); if (rr) { if (!rejMap[rr]) rejMap[rr] = []; rejMap[rr].push(r); } });

  const topicMap = {};
  filtered.forEach(r => { const t = (r.Topic || "").trim(); if (t) topicMap[t] = (topicMap[t] || 0) + 1; });

  const dailyMap = {};
  filtered.forEach(r => {
    const d = (r.created_at || "").substring(0, 10);
    if (!d) return;
    if (!dailyMap[d]) dailyMap[d] = { total: 0, unique: new Set(), completed: 0, failed: 0 };
    dailyMap[d].total++;
    if (r.cust_name) dailyMap[d].unique.add(r.cust_name.trim());
    if (r.kyc_status === "COMPLETED") dailyMap[d].completed++;
    if (r.kyc_status === "FAILED") dailyMap[d].failed++;
  });

  const toDetailKyc = rows => rows.map(r => ({
    date:            (r.created_at || "").substring(0, 10),
    conversation_id: getField(r, 'conv_id', 'Convo id', 'convo_id', 'conversation_id'),
    customer_name:   r.cust_name || "-",
    agent_name:      r.agent_name || "-",
  }));

  // ── Funnel ──────────────────────────────────────────────────────────────────
  const berlangsung = filtered.filter(r => !["DROPPED", "ABANDONED", "PRE_QUEUE"].includes(r.status)).length;
  const kycSelesai  = filtered.filter(r => r.kyc_status && r.kyc_status.trim() !== "").length;
  const disetujui   = completed;
  const dropRate = (a, b) => b === 0 ? "0.0" : ((a - b) / a * 100).toFixed(1);
  const funnelData  = [
    { stage: "Antrean KYC",     value: total,       drop: null,                           color: "#006CEB" },
    { stage: "KYC Berlangsung", value: berlangsung,  drop: dropRate(total, berlangsung),   color: "#2CA7E4" },
    { stage: "KYC Selesai",     value: kycSelesai,   drop: dropRate(berlangsung, kycSelesai), color: "#159367" },
    { stage: "Disetujui",       value: disetujui,    drop: dropRate(kycSelesai, disetujui),   color: "#E5AC00" },
  ];

  // ── Rejected Issues (from Topic + Conversation_Summary) ─────────────────────
  const rejectedRows = filtered.filter(r => r.kyc_status === "FAILED");

  // Topic breakdown for rejected conversations
  const rejTopicMap = {};
  rejectedRows.forEach(r => { const t = (r.Topic || "").trim(); if (t && t !== "-") rejTopicMap[t] = (rejTopicMap[t] || 0) + 1; });
  const rejTopicIssues = Object.entries(rejTopicMap)
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([type, count]) => ({ type, description: "Topik dipilih agent pada saat KYC ditolak", count, source: "Topik Agent", rows: toDetailKyc(rejectedRows.filter(r => (r.Topic || "").trim() === type)) }));

  // Keyword analysis on Conversation_Summary for rejected rows
  const SUMMARY_PATTERNS = [
    { label: "KTP Tidak Jelas / Rusak",      keys: ["ktp", "foto ktp", "blur", "buram", "tidak terbaca", "ktp rusak", "ktp tidak jelas"] },
    { label: "Data Tidak Sesuai",             keys: ["tidak sesuai", "tidak cocok", "tidak sama", "berbeda", "nama ibu", "tempat lahir", "tanggal lahir"] },
    { label: "Video / Koneksi Bermasalah",    keys: ["video", "tidak muncul", "freeze", "lag", "terputus", "koneksi", "blank", "hitam"] },
    { label: "Liveness Check Gagal",          keys: ["liveness", "blink", "kedip", "gerak kepala", "selfie"] },
    { label: "Nasabah Tidak Kooperatif",      keys: ["tidak kooperatif", "menolak", "tidak mau", "tidak bersedia", "kabur"] },
    { label: "Timeout / Waktu Habis",         keys: ["timeout", "waktu habis", "expired", "time out"] },
  ];
  const rejSummaryIssues = SUMMARY_PATTERNS
    .map(p => {
      const matchRows = rejectedRows.filter(r =>
        p.keys.some(k => (r.Conversation_Summary || "").toLowerCase().includes(k))
      );
      return { type: p.label, description: "Terdeteksi dari Conversation Summary", count: matchRows.length, source: "Summary", rows: toDetailKyc(matchRows) };
    })
    .filter(i => i.count > 0)
    .sort((a, b) => b.count - a.count);

  // Merge: topic issues first, then summary (deduplicate by label)
  const seenLabels = new Set();
  const rejectedIssues = [...rejTopicIssues, ...rejSummaryIssues].filter(i => {
    if (seenLabels.has(i.type)) return false;
    seenLabels.add(i.type); return true;
  });

  // ── General Issues ───────────────────────────────────────────────────────────
  const issues = [];
  const videoRows = filtered.filter(r => (r.Topic || "").includes("Video") || (r.Conversation_Summary || "").toLowerCase().includes("video"));
  if (videoRows.length > 0) issues.push({ type: "Video Nasabah Tidak Muncul", description: "Video nasabah tidak muncul di sisi agent", count: videoRows.length, rows: toDetailKyc(videoRows) });

  const discRows = filtered.filter(r => (r.Topic || "").includes("terputus"));
  if (discRows.length > 0) issues.push({ type: "Nasabah Terputus", description: "Koneksi terputus saat verifikasi KYC", count: discRows.length, rows: toDetailKyc(discRows) });

  const ktpRows = filtered.filter(r => (r.rejection_reason || "").includes("KTP"));
  if (ktpRows.length > 0) issues.push({ type: "KTP Rusak/Tidak Jelas", description: "Foto KTP tidak terbaca", count: ktpRows.length, rows: toDetailKyc(ktpRows) });

  const connRows = filtered.filter(r => (r.Topic || "").includes("Koneksi"));
  if (connRows.length > 0) issues.push({ type: "Koneksi Tidak Stabil", description: "Jaringan tidak stabil, video call gagal", count: connRows.length, rows: toDetailKyc(connRows) });

  const dataRows = filtered.filter(r => ["Nama Ibu Kandung Tidak Sesuai", "Tempat Lahir Tidak Sesuai", "Tanggal Lahir Tidak Sesuai"].includes((r.rejection_reason || "").trim()));
  if (dataRows.length > 0) issues.push({ type: "Data Tidak Sesuai", description: "Data verifikasi tidak cocok dengan KTP", count: dataRows.length, rows: toDetailKyc(dataRows) });
  issues.sort((a, b) => b.count - a.count);

  const agentKycMap = {};
  filtered.forEach(r => {
    const name = (r.agent_name || "").trim() || "Unknown";
    if (!agentKycMap[name]) agentKycMap[name] = { total: 0, approved: 0, rejected: 0, rows: [] };
    agentKycMap[name].total++;
    if (r.kyc_status === "COMPLETED") agentKycMap[name].approved++;
    if (r.kyc_status === "FAILED")    agentKycMap[name].rejected++;
    agentKycMap[name].rows.push({
      date:            (r.created_at || "").substring(0, 10),
      conversation_id: getField(r, 'conv_id', 'Convo id', 'convo_id', 'conversation_id'),
      customer_name:   r.cust_name || "-",
      kyc_status:      r.kyc_status || "-",
    });
  });
  const agentRanking = Object.entries(agentKycMap)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([agent, v]) => ({
      agent,
      total:    v.total,
      approved: v.approved,
      rejected: v.rejected,
      pct: (v.total / Math.max(1, total) * 100).toFixed(1),
      rows: v.rows,
    }));

  return {
    totalCalls: total, uniqueUsers: uniq.size, attemptPerUser: (total / Math.max(1, uniq.size)).toFixed(1),
    resolved, dropped, abandoned: filtered.filter(r => r.status === "ABANDONED").length,
    completed, failed, pending, conversionRate: ((( completed + failed) / Math.max(1, uniq.size)) * 100).toFixed(2),
    assignmentTime: { under10: waitTimes.length ? (u10w / waitTimes.length * 100).toFixed(2) : 0 },
    responseTime: { under10: rt.total ? (rt.u10 / rt.total * 100).toFixed(2) : 0, "10to20": rt.total ? (rt.mid / rt.total * 100).toFixed(2) : 0, over20: rt.total ? (rt.o20 / rt.total * 100).toFixed(2) : 0 },
    funnelData, rejectedIssues, agentRanking,
    rejectionReasons: Object.entries(rejMap).sort((a, b) => b[1].length - a[1].length).map(([reason, rows]) => ({ reason, count: rows.length, rows: toDetailKyc(rows) })),
    topicBreakdown: Object.entries(topicMap).sort((a, b) => b[1] - a[1]).map(([topic, count]) => ({ topic, count })),
    dailyCalls: Object.entries(dailyMap).sort().map(([d, v]) => ({ date: d.substring(5), total: v.total, unique: v.unique.size, completed: v.completed, failed: v.failed })),
    issues
  };
}
