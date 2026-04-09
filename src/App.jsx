import { useState, useCallback } from "react";

const AIRPORT_CODES = {
  CHI: "Chicago", NYC: "New York City", AUH: "Abu Dhabi",
  SEA: "Seattle", SFR: "San Francisco", LAX: "Los Angeles",
  ORD: "Chicago O'Hare", JFK: "JFK New York", SFO: "San Francisco",
  MIA: "Miami", DFW: "Dallas", ATL: "Atlanta",
  BOS: "Boston", DEN: "Denver", LAS: "Las Vegas",
};

function parsePDFText(text) {
  const rows = [];
  const re = /(\d{4}-\d{2}-\d{2})\s+(Arrival|Departure)\s+([A-Z]{3})\b/gi;
  let m;
  while ((m = re.exec(text)) !== null)
    rows.push({ date: m[1], type: m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase(), location: m[3] });
  if (!rows.length) {
    for (const line of text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean)) {
      const d = line.match(/(\d{4}-\d{2}-\d{2})/);
      const t = line.match(/\b(Arrival|Departure)\b/i);
      const locs = [...line.matchAll(/\b([A-Z]{3})\b/g)];
      if (d && t && locs.length)
        rows.push({ date: d[1], type: t[1].charAt(0).toUpperCase() + t[1].slice(1).toLowerCase(), location: locs[locs.length - 1][1] });
    }
  }
  return rows;
}

function leapYear(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
function diy(y) { return leapYear(y) ? 366 : 365; }

function computeMetrics(rows) {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => new Date(a.date) - new Date(b.date));
  const trips = []; let i = 0;
  while (i < sorted.length) {
    if (sorted[i].type === "Arrival") {
      const arrival = sorted[i]; let dep = null;
      for (let j = i + 1; j < sorted.length; j++) { if (sorted[j].type === "Departure") { dep = sorted[j]; i = j; break; } }
      trips.push({ arrival, departure: dep });
    }
    i++;
  }
  let totalUsaDays = 0, totalOutsideDays = 0;
  const yearlyDays = {}, yearlyOutsideDays = {}, tripLog = [];

  function tally(s, e, b) {
    const c = new Date(s); c.setHours(0, 0, 0, 0);
    const f = new Date(e); f.setHours(0, 0, 0, 0);
    while (c < f) { const y = c.getFullYear(); b[y] = (b[y] || 0) + 1; c.setDate(c.getDate() + 1); }
  }

  for (let t = 0; t < trips.length; t++) {
    const { arrival, departure } = trips[t];
    const aD = new Date(arrival.date), dD = departure ? new Date(departure.date) : new Date();
    const stay = Math.round((dD - aD) / 86400000);
    totalUsaDays += stay; tally(aD, dD, yearlyDays);
    let gapDays = null, gapEnd = null;
    if (departure && t + 1 < trips.length) {
      const nA = new Date(trips[t + 1].arrival.date), dDep = new Date(departure.date);
      gapDays = Math.round((nA - dDep) / 86400000);
      totalOutsideDays += gapDays; gapEnd = trips[t + 1].arrival.date;
      tally(dDep, nA, yearlyOutsideDays);
    }
    tripLog.push({ arrival: arrival.date, arrivalLoc: arrival.location, departure: departure ? departure.date : "Present", departureLoc: departure ? departure.location : "—", stayDays: stay, gapDays, gapEnd });
  }

  const locVisits = {};
  sorted.forEach(r => {
    if (!locVisits[r.location]) locVisits[r.location] = { arrivals: 0, departures: 0 };
    locVisits[r.location][r.type === "Arrival" ? "arrivals" : "departures"]++;
  });

  const firstEntry = sorted.find(r => r.type === "Arrival");
  const lastEntry = sorted[sorted.length - 1];
  const spanDays = firstEntry ? Math.round((new Date(lastEntry.date) - new Date(firstEntry.date)) / 86400000) : 0;

  new Set([...Object.keys(yearlyDays), ...Object.keys(yearlyOutsideDays)]).forEach(yr => {
    const cap = diy(+yr) - (yearlyDays[yr] || 0);
    if ((yearlyOutsideDays[yr] || 0) > cap) yearlyOutsideDays[yr] = cap;
  });
  if (firstEntry) {
    const fy = new Date(firstEntry.date).getFullYear();
    yearlyOutsideDays[fy] = diy(fy) - (yearlyDays[fy] || 0);
    Object.keys(yearlyOutsideDays).forEach(yr => { if (+yr < fy) delete yearlyOutsideDays[yr]; });
  }

  // Fill unaccounted days in every year up to today as outside
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const currentYear = today.getFullYear();
  if (firstEntry) {
    const fy = new Date(firstEntry.date).getFullYear();
    for (let yr = fy; yr <= currentYear; yr++) {
      const inD = yearlyDays[yr] || 0;
      const outD = yearlyOutsideDays[yr] || 0;
      const d = diy(yr);
      const yearStart = new Date(yr, 0, 1);
      const yearEnd = new Date(yr + 1, 0, 1);
      const daysPassed = Math.round((Math.min(today, yearEnd) - yearStart) / 86400000);
      const unaccounted = daysPassed - inD - outD;
      if (unaccounted > 0) yearlyOutsideDays[yr] = outD + unaccounted;
      const cap = d - inD;
      if ((yearlyOutsideDays[yr] || 0) > cap) yearlyOutsideDays[yr] = cap;
    }
  }

  let usaStreak = 0;
  if (tripLog.length && tripLog[tripLog.length - 1].departure === "Present")
    usaStreak = tripLog[tripLog.length - 1].stayDays;

  let longestAbroad = 0;
  tripLog.forEach(t => { if (t.gapDays && t.gapDays > longestAbroad) longestAbroad = t.gapDays; });

  return { trips, tripLog, totalUsaDays, totalOutsideDays, yearlyDays, yearlyOutsideDays, locVisits, spanDays, sorted, usaStreak, longestAbroad, currentYear };
}

function fmt(d, short = false) {
  if (!d || d === "Present") return "Present";
  if (short) return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Donut({ pct, size = 100 }) {
  const r = 38, cx = 50, cy = 50;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#FAF6F2" strokeWidth="12" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#B83832" strokeWidth="10"
        strokeDasharray={`${(100 - pct) / 100 * circ} ${pct / 100 * circ}`}
        strokeDashoffset={circ * 0.25} strokeLinecap="butt" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2E7D52" strokeWidth="10"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ * 0.25 + (100 - pct) / 100 * circ} strokeLinecap="butt" />
      <text x={cx} y={cy - 4} textAnchor="middle" fill="#3D2F28" fontFamily="'Playfair Display',serif" fontSize="14" fontWeight="700">{pct}%</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#A89888" fontFamily="'Barlow Condensed',sans-serif" fontSize="7" fontWeight="600" letterSpacing="1.5">IN USA</text>
    </svg>
  );
}

const TABS = ["Overview", "Trips", "Locations", "By Year", "Timeline"];

export default function App() {
  const [metrics, setMetrics] = useState(null);
  const [rawRows, setRawRows] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState(0);

  const handleHome = useCallback(() => {
    setMetrics(null);
    setRawRows([]);
    setError("");
    setTab(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const handleFile = useCallback(async (file) => {
    if (!file || file.type !== "application/pdf") { setError("Upload a PDF file."); return; }
    setError(""); setLoading(true);
    try {
      if (!window.pdfjsLib) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
          s.onload = res; s.onerror = rej; document.head.appendChild(s);
        });
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      }
      const buf = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
      let txt = "";
      for (let p = 1; p <= pdf.numPages; p++) {
        const pg = await pdf.getPage(p);
        const ct = await pg.getTextContent();
        txt += ct.items.map(x => x.str).join(" ") + "\n";
      }
      const rows = parsePDFText(txt).map(r => ({ ...r, location: r.location === "NEW" ? "NYC" : r.location }));
      if (!rows.length) { setError("No travel records found. Ensure it's from i94.cbp.dhs.gov."); setLoading(false); return; }
      setRawRows(rows); setMetrics(computeMetrics(rows));
    } catch (e) { setError("Failed to read PDF: " + e.message); }
    setLoading(false);
  }, []);

  const onDrop = useCallback((e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }, [handleFile]);
  const usaPct = metrics ? Math.round(metrics.totalUsaDays / (metrics.totalUsaDays + metrics.totalOutsideDays) * 100) : 0;

  return (
    <div style={{ fontFamily: "'Barlow',sans-serif", minHeight: "100vh", background: "#F2EDE8", color: "#3D2F28", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Barlow:wght@300;400;500;600&family=Barlow+Condensed:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { -webkit-text-size-adjust: 100%; height: 100%; }
        body { -webkit-font-smoothing: antialiased; overflow-x: hidden; height: 100%; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: #F2EDE8; }
        ::-webkit-scrollbar-thumb { background: #CCBCB0; border-radius: 99px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fu { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .fade { animation: fu .35s ease both; }
        .hdr { background: linear-gradient(135deg, #3D2F28 0%, #4A3830 100%); border-bottom: 1px solid rgba(200,184,154,.15); position: sticky; top: 0; z-index: 50; }
        .hdr-inner { max-width: 1400px; margin: 0 auto; padding: 0 clamp(12px,3vw,32px); height: 52px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .hdr-brand { display: flex; align-items: center; gap: 10px; }
        .hdr-icon { width: 30px; height: 30px; border-radius: 6px; background: linear-gradient(135deg, #B5704A, #D4906A); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .hdr-title { font-family: 'Playfair Display',serif; font-size: clamp(14px,2vw,17px); color: #F5ECD8; font-weight: 700; letter-spacing: -.2px; }
        .hdr-sub { font-family: 'Barlow Condensed',sans-serif; font-size: 9px; color: #7A6845; letter-spacing: .12em; text-transform: uppercase; font-weight: 600; }
        .hdr-meta { display: flex; align-items: center; gap: 8px; }
        .hdr-badge { font-family: 'Barlow Condensed',sans-serif; font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 3px; letter-spacing: .06em; text-transform: uppercase; background: rgba(181,112,74,.15); color: #B5704A; border: 1px solid rgba(181,112,74,.3); }
        .hdr-btn { border: 1px solid rgba(181,112,74,.2); border-radius: 4px; background: rgba(181,112,74,.05); font-size: 10px; padding: 5px 12px; color: #9A7860; cursor: pointer; font-family: 'Barlow Condensed',sans-serif; letter-spacing: .08em; text-transform: uppercase; font-weight: 600; transition: all .15s; }
        .hdr-btn:hover { background: rgba(181,112,74,.12); color: #B5704A; }
        .outer { max-width: 1400px; margin: 0 auto; padding: clamp(12px,2vw,20px) clamp(12px,3vw,32px) 24px; width: 100%; }
        .dash { display: grid; grid-template-columns: 220px 1fr; gap: 12px; align-items: start; }
        @media(max-width: 900px) { .dash { grid-template-columns: 1fr; } }
        .sidebar { display: flex; flex-direction: column; gap: 8px; }
        @media(max-width: 900px) { .sidebar { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; } }
        .scard { background: #FAF6F2; border: 1px solid #DDD5CC; border-radius: 6px; padding: 12px 14px; position: relative; overflow: hidden; transition: transform .15s; }
        .scard::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; border-radius:6px 0 0 6px; }
        .scard-g::before { background: #2C5F4A; }
        .scard-r::before { background: #C0392B; }
        .scard-o::before { background: #B5704A; }
        .scard-b::before { background: #2C5F8A; }
        .scard:hover { transform: translateY(-1px); }
        .scard-val { font-family: 'Playfair Display',serif; font-weight: 700; font-size: clamp(26px,3vw,34px); line-height: 1; color: #3D2F28; margin: 2px 0 6px; }
.scard-g .scard-val { color: #2E7D52; }
.scard-r .scard-val { color: #B83832; }
.scard-o .scard-val { color: #B5704A; }
.scard-b .scard-val { color: #2C5F8A; }
        .scard-lbl { font-family: 'Barlow Condensed',sans-serif; font-size: 9px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #A89888; }
        .scard-days { font-family: 'Barlow Condensed',sans-serif; font-size: 9px; font-weight: 600; color: #C8A888; border: 1px solid #DDD5CC; border-radius: 2px; padding: 1px 5px; float: right; margin-top: -2px; }
        .donut-card { background: #FAF6F2; border: 1px solid #DDD5CC; border-radius: 6px; padding: 14px; display: flex; align-items: center; gap: 14px; }
        .donut-stats { flex: 1; }
        .donut-row { margin-bottom: 8px; }
        .donut-row:last-child { margin-bottom: 0; }
        .donut-num { font-family: 'Playfair Display',serif; font-weight: 700; font-size: 20px; line-height: 1; }
        .donut-lbl { font-family: 'Barlow Condensed',sans-serif; font-size: 9px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #A89888; margin-top: 2px; }
        .dist-bar { background: #FAF6F2; border: 1px solid #DDD5CC; border-radius: 6px; padding: 10px 14px; }
        .dist-track { height: 6px; border-radius: 99px; background: #DDD5CC; overflow: hidden; display: flex; margin: 6px 0 5px; }
        .bar-in { background: linear-gradient(90deg,#2E7D52,#4A9A6A); }
        .bar-out { background: linear-gradient(90deg,#963028,#B83832); }
        .main-panel { background: #FAF6F2; border: 1px solid #DDD5CC; border-radius: 6px; overflow: hidden; display: flex; flex-direction: column; }
        .panel-hdr { display: flex; align-items: center; border-bottom: 1px solid #DDD5CC; flex-shrink: 0; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
        .panel-hdr::-webkit-scrollbar { display: none; }
        .tab-btn { border: none; border-right: 1px solid #DDD5CC; cursor: pointer; font-family: 'Barlow Condensed',sans-serif; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; transition: all .15s; white-space: nowrap; background: transparent; color: #A89888; padding: 10px 16px; flex-shrink: 0; }
        .tab-btn:hover:not(.on) { background: #F0E8E0; color: #5C3A28; }
        .tab-btn.on { background: #3D2F28; color: #F0E8DE; }
        .tab-btn:last-child { border-right: none; }
        .panel-body { overflow-y: auto; flex: 1; }
        @media(min-width: 901px) { .panel-body { max-height: calc(100vh - 160px); } }
        @media(max-width: 900px) { .panel-body { max-height: 55vh; } }
        .ov-row { display: flex; align-items: center; padding: 9px 14px; border-bottom: 1px solid #EDE0D8; gap: 10px; transition: background .1s; }
        .ov-row:hover { background: #F0E8E0; }
        .ov-row:last-child { border-bottom: none; }
        .trip-row { padding: 11px 14px; border-bottom: 1px solid #EDE0D8; display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; transition: background .1s; }
        .trip-row:hover { background: #F0E8E0; }
        .trip-gap { padding: 7px 14px 7px 28px; background: #F5EDE6; border-bottom: 1px solid #EDE0D8; display: flex; align-items: center; gap: 7px; }
        .loc-row { display: flex; align-items: center; padding: 10px 14px; border-bottom: 1px solid #EDE0D8; gap: 12px; transition: background .1s; }
        .loc-row:hover { background: #F0E8E0; }
        .loc-row:last-child { border-bottom: none; }
        .yr-row { padding: 10px 14px; border-bottom: 1px solid #EDE0D8; }
        .yr-row:last-child { border-bottom: none; }
        .yr-bar-track { height: 5px; border-radius: 99px; background: #DDD5CC; overflow: hidden; display: flex; margin-top: 5px; }
        .tl-entry { display: flex; padding: 10px 14px; gap: 10px; align-items: flex-start; border-bottom: 1px solid #EDE0D8; transition: background .1s; }
        .tl-entry:hover { background: #EDE5D5; }
        .tl-gap-row { padding: 6px 14px 6px 36px; background: #F5EDE6; border-bottom: 1px solid #EDE0D8; display: flex; align-items: center; gap: 7px; }
        .b-arr { display:inline-flex; font-family:'Barlow Condensed',sans-serif; font-size:9px; font-weight:700; padding:2px 7px; border-radius:2px; letter-spacing:.07em; text-transform:uppercase; background:#E4F0EB; color:#2C5F4A; border:1px solid #9FBFB0; white-space:nowrap; }
        .b-dep { display:inline-flex; font-family:'Barlow Condensed',sans-serif; font-size:9px; font-weight:700; padding:2px 7px; border-radius:2px; letter-spacing:.07em; text-transform:uppercase; background:#F5E8E6; color:#C0392B; border:1px solid #D4A49A; white-space:nowrap; }
        .b-num { display:inline-flex; font-family:'Barlow Condensed',sans-serif; font-size:9px; font-weight:700; padding:2px 7px; border-radius:2px; letter-spacing:.07em; text-transform:uppercase; background:#F0E8D8; color:#8B7355; border:1px solid #C8B89A; white-space:nowrap; flex-shrink:0; }
        .lbl { font-family:'Barlow Condensed',sans-serif; font-size:9px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:#A89888; }
        .dot-a { width:7px; height:7px; border-radius:50%; background:#2C5F4A; flex-shrink:0; }
        .dot-d { width:7px; height:7px; border-radius:50%; background:#C0392B; flex-shrink:0; }
        .dot-g { width:5px; height:5px; border-radius:50%; background:#B8860B; flex-shrink:0; }
        .t-rail { width:1px; background:linear-gradient(to bottom,#2C5F4A50,#C0392B40); margin:3px auto; flex-shrink:0; }
        .upload-zone { border: 2px dashed #DDD5CC; border-radius: 8px; background: #F0E8E0; transition: all .2s; cursor: pointer; }
        .upload-zone:hover, .upload-zone.drag { border-color: #B5704A; background: #F5EDE6; }
        @media(max-width:480px) { .hdr-meta { display: none; } .tab-btn { padding: 9px 11px; font-size: 10px; } }
      `}</style>

      <header className="hdr">
        <div className="hdr-inner">
          <div className="hdr-brand" onClick={handleHome} style={{ cursor: "pointer" }}>
            <div className="hdr-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1A1A0E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div>
              <div className="hdr-title">I-94 Analyzer</div>
              <div className="hdr-sub">CBP Travel History</div>
            </div>
          </div>
          {metrics && (
            <div className="hdr-meta">
              <span className="hdr-badge">{rawRows.length} Records</span>
              <span className="hdr-badge">{Object.keys(metrics.yearlyDays).length} Years</span>
                  </div>
          )}
        </div>
      </header>

      <div className="outer">

        {!metrics && (
          <div className="fade" style={{ maxWidth: 560, margin: "40px auto 0" }}>
            <div className={`upload-zone ${dragging ? "drag" : ""}`}
              style={{ padding: "clamp(48px,8vw,80px) 32px", textAlign: "center" }}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => !loading && document.getElementById("fi").click()}>
              {loading ? (
                <div>
                  <div style={{ width: 32, height: 32, border: "2px solid #C8B89A", borderTop: "2px solid #B8860B", borderRadius: "50%", margin: "0 auto 16px", animation: "spin 1s linear infinite" }} />
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, color: "#3D2F28", marginBottom: 4 }}>Parsing PDF</div>
                  <div style={{ fontSize: 12, color: "#A89888" }}>Extracting travel records...</div>
                </div>
              ) : (
                <div>
                  <div style={{ width: 52, height: 52, borderRadius: 8, border: "1px solid #DDD5CC", background: "#F0E8E0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6B4226" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/>
                    </svg>
                  </div>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: "clamp(20px,3vw,28px)", color: "#3D2F28", marginBottom: 6, fontWeight: 700 }}>Drop Your I-94 PDF</div>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, color: "#A89888", marginBottom: 22, letterSpacing: ".06em", textTransform: "uppercase" }}>From i94.cbp.dhs.gov · Processed locally</div>
                  <div style={{ display: "inline-flex", alignItems: "center", background: "linear-gradient(135deg,#1A1A0E,#2C2416)", color: "#C8860B", fontFamily: "'Barlow Condensed',sans-serif", fontSize: 12, fontWeight: 700, padding: "10px 26px", borderRadius: 4, letterSpacing: ".1em", textTransform: "uppercase", border: "1px solid rgba(200,134,11,.3)" }}>
                    Browse File
                  </div>
                </div>
              )}
              <input id="fi" type="file" accept="application/pdf" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
            </div>
            {error && (
              <div style={{ marginTop: 10, padding: "10px 14px", background: "#F5E8E6", border: "1px solid #D4A49A", borderRadius: 4, fontSize: 12, color: "#8B2020", display: "flex", gap: 8 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {error}
              </div>
            )}
          </div>
        )}

        {metrics && (
          <div className="dash fade">

            <div className="sidebar">
              {[
                { label: "Days in USA", value: metrics.totalUsaDays, cls: "scard-g" },
                { label: "Days Outside", value: metrics.totalOutsideDays, cls: "scard-r" },
                { label: "USA Streak", value: metrics.usaStreak, cls: "scard-o" },
                { label: "Longest Abroad", value: metrics.longestAbroad, cls: "scard-b" },
              ].map(s => (
                <div key={s.label} className={`scard ${s.cls}`}>
                  <span className="scard-days">days</span>
                  <div className="scard-val">{s.value.toLocaleString()}</div>
                  <div className="scard-lbl">{s.label}</div>
                </div>
              ))}

              <div className="dist-bar">
                <div className="lbl" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Split</span>
                  <span>{usaPct}% USA</span>
                </div>
                <div className="dist-track">
                  <div className="bar-in" style={{ width: `${usaPct}%` }} />
                  <div className="bar-out" style={{ width: `${100 - usaPct}%` }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 600, letterSpacing: ".06em" }}>
                  <span style={{ color: "#2C5F4A" }}>USA</span>
                  <span style={{ color: "#C0392B" }}>OUTSIDE</span>
                </div>
              </div>
            </div>

            <div className="main-panel">
              <div className="panel-hdr">
                {TABS.map((t, idx) => (
                  <button key={t} className={`tab-btn ${tab === idx ? "on" : ""}`} onClick={() => setTab(idx)}>{t}</button>
                ))}
              </div>

              <div className="panel-body">

                {tab === 0 && (
                  <div>
                    {[...rawRows].sort((a, b) => new Date(b.date) - new Date(a.date)).map((r, i) => (
                      <div key={i} className="ov-row">
                        <div className={r.type === "Arrival" ? "dot-a" : "dot-d"} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "#3D2F28", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {AIRPORT_CODES[r.location] || r.location}
                            <span style={{ color: "#C8B0A0", fontSize: 10, fontFamily: "'Barlow Condensed',sans-serif", marginLeft: 5 }}>{r.location}</span>
                          </div>
                          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 10, color: "#A89888" }}>{fmt(r.date)}</div>
                        </div>
                        <span className={r.type === "Arrival" ? "b-arr" : "b-dep"}>{r.type}</span>
                      </div>
                    ))}
                  </div>
                )}

                {tab === 1 && (
                  <div>
                    {metrics.tripLog.map((t, i) => (
                      <div key={i}>
                        <div className="trip-row">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 9, fontWeight: 700, color: "#C8B0A0", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 5 }}>Trip {i + 1}</div>
                            <div style={{ fontSize: 12, color: "#2C5F4A", fontWeight: 500, marginBottom: 3 }}>
                              {fmt(t.arrival, true)}
                              <span style={{ color: "#C8B0A0", fontFamily: "'Barlow Condensed',sans-serif", fontSize: 10 }}> · {AIRPORT_CODES[t.arrivalLoc] || t.arrivalLoc}</span>
                            </div>
                            <div style={{ fontSize: 12, color: t.departure === "Present" ? "#8B7355" : "#C0392B", fontWeight: 500 }}>
                              {t.departure === "Present" ? "Currently in USA" : fmt(t.departure, true)}
                              {t.departure !== "Present" && <span style={{ color: "#C8B0A0", fontFamily: "'Barlow Condensed',sans-serif", fontSize: 10 }}> · {AIRPORT_CODES[t.departureLoc] || t.departureLoc}</span>}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 26, color: "#3D2F28", lineHeight: 1 }}>{t.stayDays}</div>
                            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 8, color: "#A89888", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>days in USA</div>
                          </div>
                        </div>
                        {t.gapDays !== null && (
                          <div className="trip-gap">
                            <div className="dot-g" />
                            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 10, color: "#8B6914", fontWeight: 700 }}>{t.gapDays}d outside</span>
                            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 10, color: "#A89888" }}>· back {fmt(t.gapEnd, true)}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {tab === 2 && (
                  <div>
                    {Object.entries(metrics.locVisits).sort((a, b) => (b[1].arrivals + b[1].departures) - (a[1].arrivals + a[1].departures)).map(([code, v]) => (
                      <div key={code} className="loc-row">
                        <div style={{ width: 38, height: 38, borderRadius: 4, border: "1px solid #C8B89A", background: "#E8DCC8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 12, color: "#2C5F4A" }}>{code}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "#3D2F28", marginBottom: 3 }}>{AIRPORT_CODES[code] || code}</div>
                          <div style={{ display: "flex", gap: 10, fontSize: 10, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 600 }}>
                            <span style={{ color: "#2C5F4A" }}>{v.arrivals} arr</span>
                            <span style={{ color: "#C0392B" }}>{v.departures} dep</span>
                          </div>
                        </div>
                        <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 22, color: "#D8CCBA" }}>{v.arrivals + v.departures}</div>
                      </div>
                    ))}
                  </div>
                )}

                {tab === 3 && (
                  <div>
                    <div style={{ padding: "8px 14px 6px", borderBottom: "1px solid #EDE5D5", display: "flex", justifyContent: "space-between" }}>
                      <span className="lbl">Year</span>
                      <div style={{ display: "flex", gap: 12 }}>
                        <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 9, color: "#2C5F4A", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ width: 8, height: 2, background: "#2C5F4A", display: "inline-block", borderRadius: 99 }} />Inside
                        </span>
                        <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 9, color: "#C0392B", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ width: 8, height: 2, background: "#C0392B", display: "inline-block", borderRadius: 99 }} />Outside
                        </span>
                      </div>
                    </div>
                    {(() => {
                      const allYrs = Array.from(new Set([
                        ...Object.keys(metrics.yearlyDays),
                        ...Object.keys(metrics.yearlyOutsideDays),
                        String(metrics.currentYear)
                      ])).sort((a, b) => b - a);
                      return allYrs.map(yr => {
                        const inD = metrics.yearlyDays[yr] || 0;
                        const outD = metrics.yearlyOutsideDays[yr] || 0;
                        const d = diy(+yr);
                        const inP = Math.round(inD / d * 100);
                        const outP = Math.round(outD / d * 100);
                        return (
                          <div key={yr} className="yr-row">
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                              <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 18, color: "#3D2F28" }}>{yr}</div>
                              <div style={{ display: "flex", gap: 10 }}>
                                <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, color: "#2C5F4A", fontWeight: 700 }}>{inD}d</span>
                                <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, color: "#C0392B", fontWeight: 700 }}>{outD}d</span>
                              </div>
                            </div>
                            <div className="yr-bar-track">
                              {inP > 0 && <div className="bar-in" style={{ width: `${inP}%`, borderRadius: outP === 0 ? "99px" : "99px 0 0 99px" }} />}
                              {outP > 0 && <div className="bar-out" style={{ width: `${outP}%`, borderRadius: inP === 0 ? "99px" : "0 99px 99px 0" }} />}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}

                {tab === 4 && (
                  <div>
                    {metrics.tripLog.map((t, i) => (
                      <div key={i}>
                        <div className="tl-entry">
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 2, flexShrink: 0, width: 7 }}>
                            <div className="dot-a" />
                            <div className="t-rail" style={{ height: 32 }} />
                            <div className={t.departure === "Present" ? "dot-g" : "dot-d"} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, color: "#2C5F4A", fontWeight: 500, marginBottom: 4 }}>
                              {fmt(t.arrival)}
                              <span style={{ color: "#C8B0A0", fontFamily: "'Barlow Condensed',sans-serif", fontSize: 10 }}> · {AIRPORT_CODES[t.arrivalLoc] || t.arrivalLoc}</span>
                            </div>
                            <div style={{ display: "inline-flex", alignItems: "baseline", gap: 4, background: "#E4F0EB", border: "1px solid #9FBFB0", borderRadius: 2, padding: "2px 8px", marginBottom: 4 }}>
                              <span style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 14, color: "#2C5F4A" }}>{t.stayDays}</span>
                              <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 8, color: "#2C5F4A", fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" }}>days</span>
                            </div>
                            <div style={{ fontSize: 11, color: t.departure === "Present" ? "#8B7355" : "#C0392B", fontWeight: 500 }}>
                              {t.departure === "Present" ? "Currently in USA" : fmt(t.departure)}
                              {t.departure !== "Present" && <span style={{ color: "#C8B0A0", fontFamily: "'Barlow Condensed',sans-serif", fontSize: 10 }}> · {AIRPORT_CODES[t.departureLoc] || t.departureLoc}</span>}
                            </div>
                          </div>
                          <span className="b-num">#{i + 1}</span>
                        </div>
                        {t.gapDays !== null && (
                          <div className="tl-gap-row">
                            <div className="dot-g" />
                            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 10, color: "#8B6914", fontWeight: 700 }}>{t.gapDays}d outside USA</span>
                            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 10, color: "#A89888" }}>· back {fmt(t.gapEnd, true)}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
