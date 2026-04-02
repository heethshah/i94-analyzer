import { useState, useCallback } from “react”;

const AIRPORT_CODES = {
CHI: “Chicago”, NYC: “New York”, AUH: “Abu Dhabi”,
SEA: “Seattle”, SFR: “San Francisco”, LAX: “Los Angeles”,
ORD: “Chicago O’Hare”, JFK: “JFK New York”, SFO: “San Francisco”,
MIA: “Miami”, DFW: “Dallas”, ATL: “Atlanta”,
BOS: “Boston”, DEN: “Denver”, LAS: “Las Vegas”,
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
const locs = […line.matchAll(/\b([A-Z]{3})\b/g)];
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
const sorted = […rows].sort((a, b) => new Date(a.date) - new Date(b.date));
const trips = []; let i = 0;
while (i < sorted.length) {
if (sorted[i].type === “Arrival”) {
const arrival = sorted[i]; let dep = null;
for (let j = i + 1; j < sorted.length; j++) { if (sorted[j].type === “Departure”) { dep = sorted[j]; i = j; break; } }
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
tripLog.push({ arrival: arrival.date, arrivalLoc: arrival.location, departure: departure ? departure.date : “Present”, departureLoc: departure ? departure.location : “—”, stayDays: stay, gapDays, gapEnd });
}

const locVisits = {};
sorted.forEach(r => {
if (!locVisits[r.location]) locVisits[r.location] = { arrivals: 0, departures: 0 };
locVisits[r.location][r.type === “Arrival” ? “arrivals” : “departures”]++;
});

const firstEntry = sorted.find(r => r.type === “Arrival”);
const lastEntry = sorted[sorted.length - 1];
const spanDays = firstEntry ? Math.round((new Date(lastEntry.date) - new Date(firstEntry.date)) / 86400000) : 0;

new Set([…Object.keys(yearlyDays), …Object.keys(yearlyOutsideDays)]).forEach(yr => {
const cap = diy(+yr) - (yearlyDays[yr] || 0);
if ((yearlyOutsideDays[yr] || 0) > cap) yearlyOutsideDays[yr] = cap;
});
if (firstEntry) {
const fy = new Date(firstEntry.date).getFullYear();
yearlyOutsideDays[fy] = diy(fy) - (yearlyDays[fy] || 0);
Object.keys(yearlyOutsideDays).forEach(yr => { if (+yr < fy) delete yearlyOutsideDays[yr]; });
}

// Current USA streak
let usaStreak = 0;
if (tripLog.length && tripLog[tripLog.length - 1].departure === “Present”) {
usaStreak = tripLog[tripLog.length - 1].stayDays;
}

// Longest trip abroad
let longestAbroad = 0;
tripLog.forEach(t => { if (t.gapDays && t.gapDays > longestAbroad) longestAbroad = t.gapDays; });

return { trips, tripLog, totalUsaDays, totalOutsideDays, yearlyDays, yearlyOutsideDays, locVisits, spanDays, sorted, usaStreak, longestAbroad };
}

function fmt(d) {
if (!d || d === “Present”) return “Present”;
return new Date(d).toLocaleDateString(“en-US”, { month: “short”, day: “numeric”, year: “numeric” });
}

// Donut chart component
function Donut({ pct }) {
const r = 54, cx = 64, cy = 64;
const circ = 2 * Math.PI * r;
const dash = (pct / 100) * circ;
return (
<svg width="128" height="128" viewBox="0 0 128 128">
<circle cx={cx} cy={cy} r={r} fill="none" stroke="#C8A882" strokeWidth="14" opacity="0.25" />
<circle cx={cx} cy={cy} r={r} fill=“none” stroke=”#C0392B” strokeWidth=“14”
strokeDasharray={`${(100 - pct) / 100 * circ} ${pct / 100 * circ}`}
strokeDashoffset={circ * 0.25}
strokeLinecap=“round” />
<circle cx={cx} cy={cy} r={r} fill=“none” stroke=”#2C5F4A” strokeWidth=“14”
strokeDasharray={`${dash} ${circ - dash}`}
strokeDashoffset={circ * 0.25 + (100 - pct) / 100 * circ}
strokeLinecap=“round” />
<text x={cx} y={cy - 6} textAnchor=“middle” fill=”#2C2C1E” fontFamily=”‘Playfair Display’, serif” fontSize=“18” fontWeight=“700”>{pct}%</text>
<text x={cx} y={cy + 12} textAnchor=“middle” fill=”#8B7355” fontFamily=”‘Barlow Condensed’, sans-serif” fontSize=“9” fontWeight=“600” letterSpacing=“2”>IN USA</text>
</svg>
);
}

const TABS = [“Overview”, “Trips”, “Locations”, “By Year”, “Timeline”];

export default function App() {
const [metrics, setMetrics] = useState(null);
const [rawRows, setRawRows] = useState([]);
const [dragging, setDragging] = useState(false);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(””);
const [tab, setTab] = useState(0);

const handleFile = useCallback(async (file) => {
if (!file || file.type !== “application/pdf”) { setError(“Upload a PDF file.”); return; }
setError(””); setLoading(true);
try {
if (!window.pdfjsLib) {
await new Promise((res, rej) => {
const s = document.createElement(“script”);
s.src = “https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js”;
s.onload = res; s.onerror = rej; document.head.appendChild(s);
});
window.pdfjsLib.GlobalWorkerOptions.workerSrc = “https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js”;
}
const buf = await file.arrayBuffer();
const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
let txt = “”;
for (let p = 1; p <= pdf.numPages; p++) {
const pg = await pdf.getPage(p);
const ct = await pg.getTextContent();
txt += ct.items.map(x => x.str).join(” “) + “\n”;
}
const rows = parsePDFText(txt);
if (!rows.length) { setError(“No travel records found. Ensure it’s from i94.cbp.dhs.gov.”); setLoading(false); return; }
setRawRows(rows); setMetrics(computeMetrics(rows));
} catch (e) { setError(“Failed to read PDF: “ + e.message); }
setLoading(false);
}, []);

const onDrop = useCallback((e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }, [handleFile]);

const usaPct = metrics ? Math.round(metrics.totalUsaDays / (metrics.totalUsaDays + metrics.totalOutsideDays) * 100) : 0;

return (
<div style={{ fontFamily: “‘Barlow’, sans-serif”, minHeight: “100vh”, background: “#E8E0D0”, color: “#2C2C1E” }}>
<style>{`
@import url(‘https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;900&family=Barlow:wght@300;400;500;600&family=Barlow+Condensed:wght@400;500;600;700&display=swap’);
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { -webkit-font-smoothing: antialiased; }
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: #E8E0D0; }
::-webkit-scrollbar-thumb { background: #C8B89A; border-radius: 99px; }

```
    .fade { animation: fu .45s cubic-bezier(0.22,1,0.36,1) both; }
    .d1 { animation-delay: .04s; } .d2 { animation-delay: .08s; } .d3 { animation-delay: .12s; } .d4 { animation-delay: .16s; }
    @keyframes fu { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }

    .card {
      background: #F0E8D8;
      border: 1px solid #C8B89A;
      border-radius: 4px;
      position: relative;
    }
    .card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      border-radius: 4px 4px 0 0;
    }
    .card-green::before { background: #2C5F4A; }
    .card-red::before { background: #C0392B; }
    .card-gold::before { background: #B8860B; }
    .card-brown::before { background: #6B4226; }

    .card-lift { transition: transform .18s, box-shadow .18s; }
    .card-lift:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(44,44,30,.12); }

    .tab-btn {
      border: 1px solid #C8B89A;
      cursor: pointer;
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: .1em;
      text-transform: uppercase;
      transition: all .15s;
      border-radius: 3px;
      white-space: nowrap;
      background: transparent;
      color: #8B7355;
      padding: 6px 14px;
    }
    .tab-btn:hover:not(.on) { background: #E0D4BE; color: #5C4A2A; }
    .tab-btn.on { background: #2C5F4A; color: #F0E8D8; border-color: #2C5F4A; }

    .row-r { transition: background .1s; border-bottom: 1px solid #DDD0B8; }
    .row-r:hover { background: #E8DCC8; }
    .row-r:last-child { border-bottom: none; }

    .upload-zone {
      border: 2px dashed #C8B89A;
      border-radius: 6px;
      background: #EDE5D5;
      transition: all .2s;
      cursor: pointer;
    }
    .upload-zone:hover, .upload-zone.drag {
      border-color: #2C5F4A;
      background: #E4F0EB;
    }

    .badge-arr { display:inline-flex; align-items:center; font-family:'Barlow Condensed',sans-serif; font-size:10px; font-weight:700; padding:2px 9px; border-radius:3px; letter-spacing:.08em; text-transform:uppercase; background:#E4F0EB; color:#2C5F4A; border:1px solid #9FBFB0; }
    .badge-dep { display:inline-flex; align-items:center; font-family:'Barlow Condensed',sans-serif; font-size:10px; font-weight:700; padding:2px 9px; border-radius:3px; letter-spacing:.08em; text-transform:uppercase; background:#F5E8E6; color:#C0392B; border:1px solid #D4A49A; }
    .badge-num { display:inline-flex; align-items:center; font-family:'Barlow Condensed',sans-serif; font-size:10px; font-weight:700; padding:2px 9px; border-radius:3px; letter-spacing:.08em; text-transform:uppercase; background:#F0E8D8; color:#8B7355; border:1px solid #C8B89A; }

    .divider { border: none; border-top: 1px solid #C8B89A; }
    .section-label { font-family:'Barlow Condensed',sans-serif; font-size:10px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#8B7355; }

    .bar-track { height: 7px; border-radius: 99px; background: #D8CCBA; overflow: hidden; display: flex; }
    .bar-in { background: linear-gradient(90deg, #2C5F4A, #3D7A61); transition: width .9s cubic-bezier(0.22,1,0.36,1); }
    .bar-out { background: linear-gradient(90deg, #A0291F, #C0392B); transition: width .9s cubic-bezier(0.22,1,0.36,1); }

    .dot-arr { width:8px; height:8px; border-radius:50%; background:#2C5F4A; flex-shrink:0; }
    .dot-dep { width:8px; height:8px; border-radius:50%; background:#C0392B; flex-shrink:0; }
    .dot-gap { width:6px; height:6px; border-radius:50%; background:#B8860B; flex-shrink:0; }
    .t-rail { width:1.5px; background:linear-gradient(to bottom,#2C5F4A60,#C0392B50); margin:4px auto; }

    .stat-num { font-family:'Playfair Display',serif; font-weight:700; }
    .heading { font-family:'Playfair Display',serif; }

    @media(max-width:480px) {
      .stat-big { font-size: 42px !important; }
    }
  `}</style>

  {/* Nav */}
  <nav style={{ background: "#2C2C1E", borderBottom: "1px solid #1A1A12", position: "sticky", top: 0, zIndex: 50 }}>
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 4, background: "#2C5F4A", border: "1px solid #3D7A61", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F0E8D8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div>
          <div className="heading" style={{ fontSize: 15, color: "#F0E8D8", fontWeight: 700, letterSpacing: "-.2px" }}>I-94 Analyzer</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 9, color: "#6B5E4A", letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 600 }}>CBP Travel History</div>
        </div>
      </div>
      {metrics && (
        <button onClick={() => { setMetrics(null); setRawRows([]); setError(""); setTab(0); }}
          style={{ border: "1px solid #3A3A2A", borderRadius: 3, background: "none", fontSize: 10, padding: "5px 14px", color: "#8B7A5A", cursor: "pointer", fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 600, transition: "all .15s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#5A5A3A"; e.currentTarget.style.color = "#C8B89A"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#3A3A2A"; e.currentTarget.style.color = "#8B7A5A"; }}>
          New File
        </button>
      )}
    </div>
  </nav>

  <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 20px 90px" }}>

    {/* Upload */}
    {!metrics && (
      <div className="fade">
        <div className={`upload-zone ${dragging ? "drag" : ""}`}
          style={{ padding: "clamp(48px,10vw,80px) 28px", textAlign: "center" }}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !loading && document.getElementById("fi").click()}>

          {loading ? (
            <div>
              <div style={{ width: 36, height: 36, border: "2px solid #C8B89A", borderTop: "2px solid #2C5F4A", borderRadius: "50%", margin: "0 auto 18px", animation: "spin 1s linear infinite" }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              <div className="heading" style={{ fontSize: 20, color: "#2C2C1E", marginBottom: 6 }}>Parsing PDF</div>
              <div style={{ fontSize: 13, color: "#8B7355" }}>Extracting travel records…</div>
            </div>
          ) : (
            <div>
              <div style={{ width: 52, height: 52, borderRadius: 6, border: "1px solid #C8B89A", background: "#E8DCC8", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6B4226" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><polyline points="9 15 12 18 15 15" />
                </svg>
              </div>
              <div className="heading" style={{ fontSize: 24, color: "#2C2C1E", marginBottom: 8, fontWeight: 700 }}>Drop Your I-94 PDF</div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 12, color: "#8B7355", marginBottom: 22, letterSpacing: ".06em", textTransform: "uppercase" }}>Exported from i94.cbp.dhs.gov · Processed locally</div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#2C5F4A", color: "#F0E8D8", fontFamily: "'Barlow Condensed',sans-serif", fontSize: 12, fontWeight: 700, padding: "10px 24px", borderRadius: 4, letterSpacing: ".1em", textTransform: "uppercase" }}>
                Browse File
              </div>
            </div>
          )}
          <input id="fi" type="file" accept="application/pdf" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: "12px 16px", background: "#F5E8E6", border: "1px solid #D4A49A", borderRadius: 4, fontSize: 13, color: "#8B2020", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            {error}
          </div>
        )}
      </div>
    )}

    {/* Dashboard */}
    {metrics && (
      <div>

        {/* Page title */}
        <div className="fade" style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
            <h1 className="heading" style={{ fontSize: "clamp(28px,6vw,40px)", fontWeight: 900, color: "#2C2C1E", letterSpacing: "-.5px" }}>Travel Record</h1>
            <div style={{ display: "flex", gap: 6 }}>
              <span className="badge-num">{rawRows.length} Events</span>
              <span className="badge-num">{Object.keys(metrics.yearlyDays).length} Years</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <div style={{ flex: 1, height: 1, background: "#C8B89A" }} />
            <div style={{ display: "flex", gap: 5 }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: 1, background: "#C0392B", transform: "rotate(45deg)" }} />)}
            </div>
            <div style={{ flex: 1, height: 1, background: "#C8B89A" }} />
          </div>
        </div>

        {/* Stat cards */}
        <div className="fade d1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(148px,1fr))", gap: 10, marginBottom: 12 }}>
          {[
            { label: "Days Inside USA", value: metrics.totalUsaDays, cls: "card-green" },
            { label: "Days Outside USA", value: metrics.totalOutsideDays, cls: "card-red" },
            { label: "USA Streak", value: metrics.usaStreak, cls: "card-gold", suffix: "Current" },
            { label: "Longest Abroad", value: metrics.longestAbroad, cls: "card-brown" },
          ].map((s, idx) => (
            <div key={s.label} className={`card card-lift ${s.cls}`} style={{ padding: "18px 16px" }}>
              <div className="stat-num stat-big" style={{ fontSize: 48, lineHeight: .9, color: "#2C2C1E", marginBottom: 10 }}>
                {s.value.toLocaleString()}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div className="section-label" style={{ fontSize: 9 }}>{s.label}</div>
                <span className="badge-num">Days</span>
              </div>
            </div>
          ))}
        </div>

        {/* Donut + distribution */}
        <div className="fade d2 card" style={{ padding: "20px", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
            <div className="section-label" style={{ minWidth: 40 }}>Split</div>
            <div style={{ display: "flex", justifyContent: "center", flex: "0 0 auto" }}>
              <Donut pct={usaPct} />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ marginBottom: 12 }}>
                <div className="stat-num" style={{ fontSize: 28, color: "#2C5F4A", lineHeight: 1 }}>{metrics.totalUsaDays}d</div>
                <div className="section-label" style={{ marginTop: 2 }}>Inside USA</div>
              </div>
              <div>
                <div className="stat-num" style={{ fontSize: 28, color: "#C0392B", lineHeight: 1 }}>{metrics.totalOutsideDays}d</div>
                <div className="section-label" style={{ marginTop: 2 }}>Outside USA</div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="fade d3" style={{ display: "flex", gap: 4, marginBottom: 12, overflowX: "auto", paddingBottom: 2 }}>
          {TABS.map((t, idx) => (
            <button key={t} className={`tab-btn ${tab === idx ? "on" : ""}`} onClick={() => setTab(idx)}>{t}</button>
          ))}
        </div>

        {/* Overview */}
        {tab === 0 && (
          <div className="fade card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #C8B89A" }}>
              <span className="section-label">All Records</span>
              <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, color: "#8B7355" }}>{rawRows.length} entries</span>
            </div>
            {[...rawRows].sort((a, b) => new Date(b.date) - new Date(a.date)).map((r, i, arr) => (
              <div key={i} className="row-r" style={{ display: "flex", alignItems: "center", padding: "11px 18px", gap: 12 }}>
                <div className={r.type === "Arrival" ? "dot-arr" : "dot-dep"} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#2C2C1E" }}>
                    {AIRPORT_CODES[r.location] || r.location}
                    <span style={{ color: "#B8A888", fontSize: 11, fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: ".06em", marginLeft: 6 }}>{r.location}</span>
                  </div>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, color: "#8B7355", marginTop: 1, letterSpacing: ".04em" }}>{fmt(r.date)}</div>
                </div>
                <span className={r.type === "Arrival" ? "badge-arr" : "badge-dep"}>{r.type}</span>
              </div>
            ))}
          </div>
        )}

        {/* Trips */}
        {tab === 1 && (
          <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {metrics.tripLog.map((t, i) => (
              <div key={i} className={`card card-lift ${i % 2 === 0 ? "card-green" : "card-red"}`} style={{ padding: "16px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 18, height: 1, background: "#C8B89A" }} />
                      <span className="section-label">Trip {i + 1}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "#2C5F4A", fontWeight: 500, marginBottom: 4 }}>
                      Arrived <span style={{ color: "#5C4A2A", fontWeight: 400 }}>{fmt(t.arrival)}</span>
                      <span style={{ color: "#B8A888", fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, letterSpacing: ".04em" }}> · {AIRPORT_CODES[t.arrivalLoc] || t.arrivalLoc}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: t.departure === "Present" ? "#8B7355" : "#C0392B" }}>
                      {t.departure === "Present" ? "Currently in USA" : `Departed `}
                      {t.departure !== "Present" && <span style={{ color: "#5C4A2A", fontWeight: 400 }}>{fmt(t.departure)}</span>}
                      {t.departure !== "Present" && <span style={{ color: "#B8A888", fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, letterSpacing: ".04em" }}> · {AIRPORT_CODES[t.departureLoc] || t.departureLoc}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div className="stat-num" style={{ fontSize: 38, color: "#2C2C1E", lineHeight: .9 }}>{t.stayDays}</div>
                    <div className="section-label" style={{ marginTop: 4, fontSize: 8 }}>days in USA</div>
                  </div>
                </div>
                {t.gapDays !== null && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #DDD0B8", display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="dot-gap" />
                    <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 12, color: "#B8860B", fontWeight: 600, letterSpacing: ".04em" }}>{t.gapDays}d outside</span>
                    <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, color: "#8B7355" }}>· returned {fmt(t.gapEnd)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Locations */}
        {tab === 2 && (
          <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(metrics.locVisits).sort((a, b) => (b[1].arrivals + b[1].departures) - (a[1].arrivals + a[1].departures)).map(([code, v]) => (
              <div key={code} className="card card-lift" style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: 4, border: "1px solid #C8B89A", background: "#E8DCC8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 14, color: "#2C5F4A", letterSpacing: ".06em" }}>{code}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#2C2C1E", marginBottom: 4 }}>{AIRPORT_CODES[code] || code}</div>
                  <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
                    <span style={{ color: "#2C5F4A", fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 600, letterSpacing: ".04em" }}>{v.arrivals} arrivals</span>
                    <span style={{ color: "#C0392B", fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 600, letterSpacing: ".04em" }}>{v.departures} departures</span>
                  </div>
                </div>
                <div className="stat-num" style={{ fontSize: 28, color: "#C8B89A" }}>{v.arrivals + v.departures}</div>
              </div>
            ))}
          </div>
        )}

        {/* By Year */}
        {tab === 3 && (
          <div className="fade card" style={{ padding: "18px 18px 12px" }}>
            {/* Legend */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span className="section-label">Days by Year</span>
              <div style={{ display: "flex", gap: 12 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'Barlow Condensed',sans-serif", fontSize: 10, color: "#2C5F4A", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>
                  <span style={{ width: 10, height: 3, borderRadius: 99, background: "#2C5F4A", display: "inline-block" }} />Inside
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'Barlow Condensed',sans-serif", fontSize: 10, color: "#C0392B", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>
                  <span style={{ width: 10, height: 3, borderRadius: 99, background: "#C0392B", display: "inline-block" }} />Outside
                </span>
              </div>
            </div>

            {(()=>{
              const allYrs = Array.from(new Set([...Object.keys(metrics.yearlyDays), ...Object.keys(metrics.yearlyOutsideDays)])).sort((a,b) => b-a);
              return allYrs.map(yr => {
                const inD = metrics.yearlyDays[yr] || 0;
                const outD = metrics.yearlyOutsideDays[yr] || 0;
                const d = diy(+yr);
                const inP = Math.round(inD / d * 100);
                const outP = Math.round(outD / d * 100);
                return (
                  <div key={yr} style={{ marginBottom: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                      <div className="stat-num" style={{ fontSize: 22, color: "#2C2C1E" }}>{yr}</div>
                      <div style={{ display: "flex", gap: 12 }}>
                        <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 12, color: "#2C5F4A", fontWeight: 700 }}>
                          {inD}d
                        </span>
                        <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 12, color: "#C0392B", fontWeight: 700 }}>
                          {outD}d
                        </span>
                      </div>
                    </div>
                    <div className="bar-track">
                      {inP > 0 && <div className="bar-in" style={{ width: `${inP}%`, borderRadius: outP === 0 ? "99px" : "99px 0 0 99px" }} />}
                      {outP > 0 && <div className="bar-out" style={{ width: `${outP}%`, borderRadius: inP === 0 ? "99px" : "0 99px 99px 0" }} />}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}

        {/* Timeline */}
        {tab === 4 && (
          <div className="fade card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #C8B89A" }}>
              <span className="section-label">Full Timeline</span>
              <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, color: "#8B7355" }}>{metrics.tripLog.length} trips</span>
            </div>
            {metrics.tripLog.map((t, i) => (
              <div key={i}>
                <div style={{ display: "flex", padding: "14px 18px", gap: 14, alignItems: "flex-start", borderBottom: "1px solid #DDD0B8" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 3, flexShrink: 0, width: 8 }}>
                    <div className="dot-arr" />
                    <div className="t-rail" style={{ height: 42 }} />
                    <div className={t.departure === "Present" ? "dot-gap" : "dot-dep"} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "#2C5F4A", fontWeight: 500, marginBottom: 6 }}>
                      Arrived {fmt(t.arrival)}
                      <span style={{ color: "#B8A888", fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11 }}> · {AIRPORT_CODES[t.arrivalLoc] || t.arrivalLoc}</span>
                    </div>
                    <div style={{ display: "inline-flex", alignItems: "baseline", gap: 5, background: "#E4F0EB", border: "1px solid #9FBFB0", borderRadius: 3, padding: "3px 10px", marginBottom: 6 }}>
                      <span className="stat-num" style={{ fontSize: 16, color: "#2C5F4A" }}>{t.stayDays}</span>
                      <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 9, color: "#2C5F4A", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>days in USA</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: t.departure === "Present" ? "#8B7355" : "#C0392B" }}>
                      {t.departure === "Present" ? "Currently in USA" : `Departed ${fmt(t.departure)}`}
                      {t.departure !== "Present" && <span style={{ color: "#B8A888", fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, fontWeight: 400 }}> · {AIRPORT_CODES[t.departureLoc] || t.departureLoc}</span>}
                    </div>
                  </div>
                  <span className="badge-num">#{i + 1}</span>
                </div>
                {t.gapDays !== null && (
                  <div style={{ padding: "9px 18px 9px 50px", background: "#F5EDD8", borderBottom: "1px solid #DDD0B8", display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="dot-gap" />
                    <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 12, color: "#8B6914", fontWeight: 700, letterSpacing: ".04em" }}>{t.gapDays}d outside USA</span>
                    <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, color: "#8B7355" }}>· returned {fmt(t.gapEnd)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    )}
  </div>
</div>
```

);
}