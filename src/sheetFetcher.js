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

export function processCallData(rows, dateFrom, dateTo) {
  const from = new Date(dateFrom + "T00:00:00Z");
  const to = new Date(dateTo + "T23:59:59Z");
  const filtered = rows.filter(r => {
    const d = new Date(r.created_at);
    return d >= from && d <= to;
  });

  const total = filtered.length;
  if (total === 0) return null;

  const uniq = new Set(filtered.map(r => (r.cust_name || "").trim()).filter(Boolean));
  const resolved = filtered.filter(r => r.status === "RESOLVED").length;
  const dropped = filtered.filter(r => r.status === "DROPPED").length;
  const abandoned = filtered.filter(r => r.status === "ABANDONED").length;
  const prequeue = filtered.filter(r => r.status === "PRE_QUEUE").length;

  const guestMode = filtered.filter(r => String(r.guest_mode).toUpperCase() === "TRUE").length;
  const guestName = filtered.filter(r => (r.cust_name || "").trim().toLowerCase() === "guest").length;

  const respTimes = filtered.filter(r => r.response_time && !isNaN(+r.response_time)).map(r => +r.response_time);
  const rt = { under10: 0, mid: 0, over20: 0, total: respTimes.length };
  respTimes.forEach(t => { if (t < 10) rt.under10++; else if (t <= 20) rt.mid++; else rt.over20++; });

  const tidakAdaSuara = filtered.filter(r => r.Topic === "Panggilan diakhiri (Tidak ada Suara nasabah)").length;
  const suaraAgent = filtered.filter(r => r.Topic === "Panggilan diakhiri (Suara agent tidak didengar nasabah)").length;
  const terputusSuara = filtered.filter(r => r.Topic === "Terputus (Suara nasabah tidak ada)").length;

  const topicMap = {};
  filtered.forEach(r => { const t = (r.Topic || "").trim(); if (t && t !== "-") topicMap[t] = (topicMap[t] || 0) + 1; });
  const topicBreakdown = Object.entries(topicMap).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([topic, count]) => ({ topic: topic.length > 40 ? topic.substring(0, 40) + "…" : topic, count }));

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
    if ([...audioKw, ...putusKw, ...connectKw].some(k => l.includes(k))) { if (negApp.length < 15) negApp.push(fb); }
    else if (posKw.some(k => l.includes(k))) { if (pos.length < 15) pos.push(fb); }
    else if (fb.length > 10 && negSvc.length < 15) negSvc.push(fb);
  });

  // Issues
  const issues = [];
  if (tidakAdaSuara + terputusSuara > 0) issues.push({ type: "Audio - Tidak Ada Suara Nasabah", description: "Nasabah tidak bisa berbicara/didengar agent. Dominan di Guest Mode", count: tidakAdaSuara + terputusSuara });
  if (suaraAgent > 0) issues.push({ type: "Audio - Suara Agent Tidak Didengar", description: "Agent bicara tapi nasabah tidak dengar", count: suaraAgent });
  const muteC = fbs.filter(f => /mute|mematikan/i.test(f)).length;
  if (muteC > 0) issues.push({ type: "Agent Mute Complaint", description: "Feedback: agent mematikan suara/mikropon", count: muteC });
  const putusC = fbs.filter(f => putusKw.some(k => f.toLowerCase().includes(k))).length;
  if (putusC > 0) issues.push({ type: "Panggilan Terputus", description: "Panggilan terputus sebelum selesai", count: putusC });
  const guestAudio = filtered.filter(r => String(r.guest_mode).toUpperCase() === "TRUE" && ["Panggilan diakhiri (Tidak ada Suara nasabah)", "Panggilan diakhiri (Suara agent tidak didengar nasabah)"].includes(r.Topic)).length;
  const totalAudio = tidakAdaSuara + suaraAgent;
  if (totalAudio > 10 && guestAudio / totalAudio > 0.6) issues.push({ type: "Guest Mode Audio Disproportion", description: `Guest = ${(guestAudio / totalAudio * 100).toFixed(0)}% audio issues vs ${(guestMode / total * 100).toFixed(0)}% total calls`, count: guestAudio });
  issues.sort((a, b) => b.count - a.count);

  return {
    totalCalls: total, uniqueUsers: uniq.size, attemptPerUser: (total / Math.max(1, uniq.size)).toFixed(1),
    resolved, dropped, abandoned, prequeue,
    guestMode, nonGuestMode: total - guestMode, guestName, loginName: total - guestName,
    responseTime: { under10: rt.total ? (rt.under10 / rt.total * 100).toFixed(2) : 0, "10to20": rt.total ? (rt.mid / rt.total * 100).toFixed(2) : 0, over20: rt.total ? (rt.over20 / rt.total * 100).toFixed(2) : 0 },
    audioIssues: { tidakAdaSuara, suaraAgentTidak: suaraAgent, terputusSuara },
    topicBreakdown, dailyCalls,
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

  const uniq = new Set(filtered.map(r => (r.cust_name || "").trim()).filter(Boolean));
  const resolved = filtered.filter(r => r.status === "RESOLVED").length;
  const dropped = filtered.filter(r => r.status === "DROPPED").length;
  const completed = filtered.filter(r => r.kyc_status === "COMPLETED").length;
  const failed = filtered.filter(r => r.kyc_status === "FAILED").length;
  const pending = Math.max(0, total - completed - failed - dropped);

  const waitTimes = filtered.filter(r => r["Wait Time"] && !isNaN(+r["Wait Time"])).map(r => +r["Wait Time"]);
  const u10w = waitTimes.filter(t => t <= 10).length;

  const respTimes = filtered.filter(r => r["Jawab Duration"] && !isNaN(+r["Jawab Duration"])).map(r => +r["Jawab Duration"]);
  const rt = { u10: 0, mid: 0, o20: 0, total: respTimes.length };
  respTimes.forEach(t => { if (t < 10) rt.u10++; else if (t <= 20) rt.mid++; else rt.o20++; });

  const rejMap = {};
  filtered.forEach(r => { const rr = (r.rejection_reason || "").trim(); if (rr) rejMap[rr] = (rejMap[rr] || 0) + 1; });

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

  const issues = [];
  const videoI = filtered.filter(r => (r.Topic || "").includes("Video") || (r.Conversation_Summary || "").toLowerCase().includes("video")).length;
  if (videoI > 0) issues.push({ type: "Video Nasabah Tidak Muncul", description: "Video nasabah tidak muncul di sisi agent", count: videoI });
  const discI = filtered.filter(r => (r.Topic || "").includes("terputus")).length;
  if (discI > 0) issues.push({ type: "Nasabah Terputus", description: "Koneksi terputus saat verifikasi KYC", count: discI });
  const ktpI = filtered.filter(r => (r.rejection_reason || "").includes("KTP")).length;
  if (ktpI > 0) issues.push({ type: "KTP Rusak/Tidak Jelas", description: "Foto KTP tidak terbaca", count: ktpI });
  const connI = filtered.filter(r => (r.Topic || "").includes("Koneksi")).length;
  if (connI > 0) issues.push({ type: "Koneksi Tidak Stabil", description: "Jaringan tidak stabil, video call gagal", count: connI });
  const dataI = filtered.filter(r => ["Nama Ibu Kandung Tidak Sesuai", "Tempat Lahir Tidak Sesuai", "Tanggal Lahir Tidak Sesuai"].includes((r.rejection_reason || "").trim())).length;
  if (dataI > 0) issues.push({ type: "Data Tidak Sesuai", description: "Data verifikasi tidak cocok dengan KTP", count: dataI });
  issues.sort((a, b) => b.count - a.count);

  return {
    totalCalls: total, uniqueUsers: uniq.size, attemptPerUser: (total / Math.max(1, uniq.size)).toFixed(1),
    resolved, dropped, abandoned: filtered.filter(r => r.status === "ABANDONED").length,
    completed, failed, pending, conversionRate: ((completed / Math.max(1, completed + failed + pending)) * 100).toFixed(2),
    assignmentTime: { under10: waitTimes.length ? (u10w / waitTimes.length * 100).toFixed(2) : 0 },
    responseTime: { under10: rt.total ? (rt.u10 / rt.total * 100).toFixed(2) : 0, "10to20": rt.total ? (rt.mid / rt.total * 100).toFixed(2) : 0, over20: rt.total ? (rt.o20 / rt.total * 100).toFixed(2) : 0 },
    rejectionReasons: Object.entries(rejMap).sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count })),
    topicBreakdown: Object.entries(topicMap).sort((a, b) => b[1] - a[1]).map(([topic, count]) => ({ topic, count })),
    dailyCalls: Object.entries(dailyMap).sort().map(([d, v]) => ({ date: d.substring(5), total: v.total, unique: v.unique.size, completed: v.completed, failed: v.failed })),
    issues
  };
}
