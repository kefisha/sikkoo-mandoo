require('dotenv').config();
const express = require('express'), session = require('express-session'), PgStore = require('connect-pg-simple')(session);
const { Pool } = require('pg'), bcrypt = require('bcryptjs'), multer = require('multer');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q = (s, p) => pool.query(s, p || []).then(r => r.rows);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } });

const app = express();
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new PgStore({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'sikkoo-mandoo-ultra-secure-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 864e5, sameSite: 'lax', secure: 'auto' }
}));

// CSRF Guard
app.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  const o = req.headers.origin || req.headers.referer;
  try {
    if (o && new URL(o).host !== req.headers.host) return res.status(403).send('Forbidden');
  } catch (e) {
    return res.status(403).send('Forbidden');
  }
  next();
});

// ---------- ETHIOPIAN CALENDAR CONVERTER ----------
const ETH_MONTHS_EN = ['Meskerem','Tikimt','Hidar','Tahsas','Tir','Yekatit','Megabit','Miazia','Ginbot','Sene','Hamle','Nehase','Pagume'];
const ETH_MONTHS_AM = ['መስከረም','ጥቅምት','ኅዳር','ታኅሣሥ','ጥር','የካቲት','መጋቢት','ሚያዝያ','ግንቦት','ሰኔ','ሐምሌ','ነሐሴ','ጳጉሜ'];
function toEthiopianDate(input, lang = 'en') {
  const d = input ? new Date(input) : new Date();
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  const jdn = day + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  const r = (jdn - 1723856) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const ethYear = 4 * Math.floor((jdn - 1723856) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460);
  const ethMonth = Math.floor(n / 30) + 1;
  const ethDay = (n % 30) + 1;
  const months = lang === 'am' ? ETH_MONTHS_AM : ETH_MONTHS_EN;
  return `${months[ethMonth - 1] || ''} ${ethDay}, ${ethYear} E.C.`;
}

// ---------- TELEGRAM AUTO-POST HELPER ----------
async function postToTelegram(title, body, type, isEmergency) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const icon = isEmergency ? '🚨 EMERGENCY' : (type === 'event' ? '📅 EVENT' : '📢 ' + type.toUpperCase());
    const text = `${icon}\n\n*${String(title || '').slice(0, 200)}*\n\n${String(body || '').slice(0, 800)}\n\n🌳 Siikkoo-Mandoo MWU`;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    });
  } catch (e) { console.error('Telegram post err:', e.message); }
}

// ---------- PWA MANIFEST & SERVICE WORKER ----------
app.get('/manifest.json', (req, res) => {
  res.json({
    name: 'Siikkoo-Mandoo Students Association · MWU',
    short_name: 'Siikkoo-Mandoo',
    start_url: '/',
    display: 'standalone',
    background_color: '#7c3aed',
    theme_color: '#7c3aed',
    icons: [{
      src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='24' fill='%237c3aed'/%3E%3Ctext x='50' y='67' font-size='54' text-anchor='middle'%3E🌳%3C/text%3E%3C/svg%3E",
      sizes: '192x192', type: 'image/svg+xml'
    }]
  });
});

app.get('/sw.js', (req, res) => {
  res.set('Content-Type', 'application/javascript');
  res.send(`
    self.addEventListener('install', e => self.skipWaiting());
    self.addEventListener('activate', e => self.clients.claim());
    self.addEventListener('fetch', e => {
      if (e.request.method !== 'GET') return;
      e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    });
  `);
});

// ---------- CAMPUS & ROLES CONFIGURATION ----------
const CAMPUS = {
  robe: { n: 'Robe Main Campus', c: 'ROB', am: 'ሮቤ ዋናው ካምፓስ', om: 'Kaampasii Guddaa Roobee', loc: 'Bale Robe, Oromia', colleges: 'CNCS, Business & Economics, Social Sciences, Law, Computing' },
  goba: { n: 'Goba Health Campus', c: 'GOB', am: 'ጎባ ጤና ሳይንስ ካምፓስ', om: 'Kaampasii Fayyaa Gooobaa', loc: 'Goba Town, Bale, Oromia', colleges: 'College of Health and Medical Sciences' },
  shashamane: { n: 'Shashamane Campus', c: 'SHA', am: 'ሻሸመኔ ካምፓስ', om: 'Kaampasii Shaashamannee', loc: 'Shashamane, West Arsi, Oromia', colleges: 'Agro-Forestry, Natural Resources, Business' }
};

const TYPES = ['announcement', 'news', 'event', 'education', 'document', 'project', 'gallery', 'heritage'];
const SLUG = { announcement: 'announcements', news: 'news', event: 'events', education: 'education', document: 'documents', project: 'projects', gallery: 'gallery', heritage: 'heritage' };
const CENTRAL = ['central_admin', 'president', 'vice_president', 'general_secretary', 'finance_secretary', 'communication_secretary', 'info_secretary'];
const ROLES = [
  'president', 'vice_president', 'general_secretary', 'finance_secretary',
  'academic_secretary', 'social_secretary', 'communication_secretary',
  'media_secretary', 'info_secretary', 'dev_secretary',
  'campus_rep', 'campus_coordinator', 'committee_member'
];

const PERMS = {
  central_admin: '*', president: '*',
  vice_president: ['members', 'content', 'finance', 'support', 'leaders', 'meetings', 'approve', 'audit', 'polls', 'certificates'],
  general_secretary: ['members', 'content', 'meetings', 'support', 'leaders', 'polls', 'certificates'],
  finance_secretary: ['finance'], academic_secretary: ['content', 'support'],
  social_secretary: ['content', 'support', 'meetings'], communication_secretary: ['content', 'leaders', 'polls'],
  media_secretary: ['content', 'gallery'], info_secretary: ['content', 'support', 'staff', 'audit', 'backup', 'polls', 'certificates'],
  dev_secretary: ['content', 'finance'], campus_rep: ['members', 'content', 'support', 'finance', 'meetings', 'polls'],
  campus_coordinator: ['members', 'content', 'support', 'meetings'], committee_member: ['support']
};

const can = (req, x) => { const a = PERMS[req.session.sr]; return a === '*' || (Array.isArray(a) && a.includes(x)); };
const guard = x => (req, res, next) => (req.session.sr && can(req, x)) ? next() : res.redirect('/login');
const needMember = (req, res, next) => req.session.mid ? next() : res.redirect('/login');
const needStaff = (req, res, next) => req.session.sr ? next() : res.redirect('/login');

async function logAudit(req, action, target, details) {
  try {
    const actor = req.session.sname || req.session.mid || 'Anonymous';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    await q(`INSERT INTO audit_logs (actor, action, target, details, ip) VALUES ($1,$2,$3,$4,$5)`,
      [actor, action, target, String(details || '').slice(0, 500), String(ip).slice(0, 50)]);
  } catch (e) {}
}

// ---------- TRANSLATIONS ----------
const T = {
  om: {
    site: 'Gamtaa Barattoota Siikkoo-Mandoo', uni: 'Yuunivarsiitii Madda Walaabuu',
    home: 'Fuula Jalqabaa', reg: "Galmaa'i", login: 'Seeni', logout: "Ba'i", dash: 'Daashboordii', admin: 'Bulchiinsa',
    announcement: 'Beeksisa', news: 'Oduu', event: 'Taateewwan', campus: 'Kaampasii', campuses: 'Kaampasoota MWU',
    members: 'Miseensota', official: 'Miseensa Idilee', registered: "Galmaa'e", pending: 'Eeggataa', rejected: 'Kuufame', none: 'Ammaaf homtu hin jiru',
    name: 'Maqaa Guutuu', gender: 'Saala', male: 'Dhiira', female: 'Dubartii', phone: 'Bilbila', email: 'Imeelii',
    college: 'Koolleejjii', dept: 'Muummee', year: 'Waggaa Barnootaa', sid: 'ID Barattootaa',
    zone_woreda: 'Godina fi Aanaa', telegram: 'Telegram Username', pass: 'Jecha Darbii', photo: 'Suuraa',
    want: "Miseensa idilee ta'uu barbaadaa?", send: 'Ergi', card: 'Kaardii Miseensummaa', no: 'Lakk. Miseensaa', verify: 'Mirkaneessi',
    valid: "Kaardiin kun dhugaa dha ✔", invalid: 'Kaardiin kun hin argamne ✘', upgrade: "Gaaffii miseensa idilee ergi",
    renew: "Miseensummaa Haaressi", print: 'Maxxansi', leadership: 'Geggeessitoota', education: 'Barnoota',
    document: 'Sanadoota', project: 'Pirojektoota', gallery: 'Suuraa fi Viidiyoo', finance: 'Maallaqa',
    support: 'Deeggarsa', meetings: 'Walgahii', heritage: 'Aadaa fi Seenaa', about: "Waa'ee Gamtaa",
    privacy: 'Iccitii', terms: 'Waliigaltee', bad: 'Maaloo odeeffannoo guutaa.', exists: 'ID kun duraan galmaa\'eera.'
  },
  am: {
    site: 'የሲቆ-ማንዶ ተማሪዎች ማህበር', uni: 'መደ ወላቡ ዩኒቨርሲቲ',
    home: 'ዋና ገጽ', reg: 'ይመዝገቡ', login: 'ይግቡ', logout: 'ውጣ', dash: 'ዳሽቦርድ', admin: 'አድሚን',
    announcement: 'ማስታወቂያዎች', news: 'ዜና', event: 'ክስተቶች', campus: 'ካምፓስ', campuses: 'የመደወላቡ ካምፓሶች',
    members: 'አባላት', official: 'ቋሚ አባል', registered: 'የተመዘገበ', pending: 'በመጠባበቅ ላይ', rejected: 'ውድቅ የተደረገ', none: 'ምንም መረጃ የለም',
    name: 'ሙሉ ስም', gender: 'ጾታ', male: 'ወንድ', female: 'ሴት', phone: 'ስልክ', email: 'ኢሜይል',
    college: 'ኮሌጅ', dept: 'ትምህርት ክፍል', year: 'ዓመት', sid: 'የተማሪ መታወቂያ (ID)',
    zone_woreda: 'ዞን እና ወረዳ', telegram: 'የቴሌግራም መለያ', pass: 'የይለፍ ቃል', photo: 'ፎቶ',
    want: 'ቋሚ አባል መሆን ይፈልጋሉ?', send: 'ላክ', card: 'የአባልነት ካርድ', no: 'የአባልነት ቁጥር', verify: 'አረጋግጥ',
    valid: 'ካርዱ ትክክለኛ ነው ✔', invalid: 'ካርዱ አልተገኘም ✘', upgrade: 'የቋሚ አባልነት ጥያቄ ላክ',
    renew: 'አባልነት አድስ', print: 'አትም', leadership: 'አመራሮች', education: 'ትምህርትና እድሎች',
    document: 'ሰነዶች', project: 'ፕሮጀክቶች', gallery: 'ፎቶ እና ቪዲዮ', finance: 'ፋይናንስ',
    support: 'እገዛ', meetings: 'ስብሰባዎች', heritage: 'ባህል እና ታሪክ', about: 'ስለ ማህበሩ',
    privacy: 'የግላዊነት ፖሊሲ', terms: 'ውሎች እና ሁኔታዎች', bad: 'እባክዎ አስፈላጊ መረጃዎችን ይሙሉ።', exists: 'ይህ የተማሪ መታወቂያ ቀደም ብሎ ተመዝግቧል።'
  },
  en: {
    site: 'Siikkoo-Mandoo Students Association', uni: 'Madda Walabu University',
    home: 'Home', reg: 'Register', login: 'Login', logout: 'Logout', dash: 'Dashboard', admin: 'Admin',
    announcement: 'Announcements', news: 'News', event: 'Events', campus: 'Campus', campuses: 'MWU Campuses',
    members: 'Members', official: 'Official Member', registered: 'Registered', pending: 'Pending', rejected: 'Rejected', none: 'Nothing yet',
    name: 'Full Name', gender: 'Gender', male: 'Male', female: 'Female', phone: 'Phone', email: 'Email',
    college: 'College', dept: 'Department', year: 'Year', sid: 'Student ID',
    zone_woreda: 'Zone and Woreda', telegram: 'Telegram Username', pass: 'Password', photo: 'Photo',
    want: 'Become an official member?', send: 'Submit', card: 'Membership Card', no: 'Membership No.', verify: 'Verify',
    valid: 'This card is valid ✔', invalid: 'Card not found ✘', upgrade: 'Request official membership',
    renew: 'Renew Membership', print: 'Print', leadership: 'Leadership', education: 'Education',
    document: 'Documents', project: 'Projects', gallery: 'Gallery', finance: 'Finance',
    support: 'Support', meetings: 'Meetings', heritage: 'Heritage', about: 'About Association',
    privacy: 'Privacy Policy', terms: 'Terms & Conditions', bad: 'Please fill all required fields properly.', exists: 'This Student ID is already registered.'
  }
};

const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const csvEsc = v => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const L = req => (['en', 'am', 'om'].includes(req.session.lang) ? req.session.lang : 'om');
const tr = (req, k) => (T[L(req)] && T[L(req)][k]) || (T.en[k] || k);
const campusName = (req, cKey) => { const c = CAMPUS[cKey]; if (!c) return cKey; return c[L(req)] || c.n; };

// ---------- MODERN CSS (v3.0 Vibrant Purple-Pink Polka-Dot Portal + 3D Tiles + Flip ID + Floating Dark Nav) ----------
const CSS = `
:root {
  --primary: #7c3aed;
  --primary-dark: #6d28d9;
  --pink: #ec4899;
  --pink-soft: #fdf2f8;
  --blue: #2563eb;
  --teal: #0d9488;
  --green: #10b981;
  --orange: #f59e0b;
  --red: #ef4444;
  --text: #1e293b;
  --text-2: #475569;
  --text-muted: #64748b;
  --border: #e2e8f0;
  --card-dash: rgba(168,85,247,0.42);
  --surface: rgba(255,255,255,0.97);
  --surface-solid: #ffffff;
  --surface-soft: #f8fafc;
  --radius: 26px;
  --shadow: 0 12px 32px -8px rgba(88,28,135,0.22), 0 4px 12px -4px rgba(0,0,0,0.06);
  --shadow-xl: 0 24px 48px -12px rgba(76,29,149,0.34);
}
[data-theme="dark"] {
  --text: #f1f5f9;
  --text-2: #cbd5e1;
  --text-muted: #94a3b8;
  --border: #334155;
  --card-dash: rgba(192,132,252,0.38);
  --surface: rgba(24,24,42,0.94);
  --surface-solid: #1e293b;
  --surface-soft: #0f172a;
  --pink-soft: rgba(236,72,153,0.18);
  --shadow: 0 12px 32px -8px rgba(0,0,0,0.55);
}
* { box-sizing: border-box; margin: 0; padding: 0; }

/* Vibrant Purple-to-Pink Polka-Dot Background (Matching Reference Image) */
body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background-color: #7c3aed;
  background-image:
    radial-gradient(rgba(255,255,255,0.13) 10px, transparent 11px),
    radial-gradient(rgba(255,255,255,0.09) 10px, transparent 11px),
    linear-gradient(155deg, #6d28d9 0%, #8b5cf6 32%, #a855f7 62%, #db2777 100%);
  background-size: 56px 56px, 56px 56px, 100% 100%;
  background-position: 0 0, 28px 28px, 0 0;
  background-attachment: fixed;
  color: var(--text);
  line-height: 1.6;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  -webkit-font-smoothing: antialiased;
}
[data-theme="dark"] body {
  background-color: #0f172a;
  background-image:
    radial-gradient(rgba(168,85,247,0.12) 9px, transparent 10px),
    linear-gradient(160deg, #1e1b4b 0%, #2e1065 45%, #3b0764 100%);
  background-size: 56px 56px, 100% 100%;
}
/* Login Blue-Purple Backdrop */
body.auth-bg {
  background-image:
    radial-gradient(circle at 12% 20%, rgba(192,132,252,0.55) 0%, transparent 40%),
    radial-gradient(circle at 88% 80%, rgba(56,189,248,0.45) 0%, transparent 45%),
    linear-gradient(160deg, #3b82f6 0%, #4f46e5 52%, #2563eb 100%);
  background-size: 100% 100%;
}
a { color: var(--primary); text-decoration: none; transition: 0.2s; }
a:hover { opacity: 0.92; }

header {
  background: var(--surface);
  backdrop-filter: blur(18px);
  border-bottom: 2.5px dashed var(--card-dash);
  position: sticky; top: 0; z-index: 100;
  padding: 10px 0;
  box-shadow: 0 6px 20px rgba(88,28,135,0.16);
}
.in { max-width: 1120px; margin: 0 auto; padding: 0 14px; width: 100%; }
.header-top { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.logo-area { display: flex; align-items: center; gap: 10px; }
.logo-icon {
  width: 42px; height: 42px; border-radius: 50%;
  background: linear-gradient(135deg, #f59e0b, #ec4899, #7c3aed);
  padding: 2.5px; display: grid; place-items: center;
  box-shadow: 0 5px 14px rgba(124,58,237,0.3);
}
.logo-icon-inner { width: 100%; height: 100%; border-radius: 50%; background: #fff; display: grid; place-items: center; font-size: 19px; }
.logo-text h1 { font-size: 13.5px; font-weight: 850; color: var(--text); }
.logo-text p { font-size: 11px; color: var(--text-muted); font-weight: 600; }
.nav-group { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.lang-box { display: flex; gap: 2px; background: var(--surface-soft); padding: 3px; border-radius: 9999px; border: 1px solid var(--border); }
.lang-btn { padding: 4px 9px; font-size: 11px; font-weight: 700; border-radius: 9999px; color: var(--text-muted); }
.lang-btn.active { background: linear-gradient(90deg, #7c3aed, #ec4899); color: #fff; }
.theme-btn { width: 33px; height: 33px; border-radius: 11px; border: 1px solid var(--border); background: var(--surface-solid); color: var(--text); cursor: pointer; display: grid; place-items: center; font-size: 15px; }
.ext-nav { display: flex; gap: 6px; align-items: center; }
.ext-btn { padding: 7px 12px; font-size: 12px; font-weight: 700; border-radius: 999px; background: var(--surface-solid); color: var(--text); border: 1.5px solid var(--border); }
.ext-btn.login-btn { background: linear-gradient(90deg, #7c3aed, #ec4899); color: #fff; border: none; }

/* Crisp White Dashed-Border Portal Card (Matching Screenshot) */
.glass-card, .card {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 22px 18px;
  margin: 14px 0;
  box-shadow: var(--shadow);
  border: 2.5px dashed var(--card-dash);
}

/* Top Pill Highlight Banner (Matching "Short Note" Pill in Screenshot) */
.top-pill-banner {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  background: linear-gradient(90deg, #8b5cf6 0%, #c026d3 52%, #ec4899 100%);
  color: #ffffff; text-align: center; font-weight: 800; font-size: 14.5px;
  padding: 15px 22px; border-radius: 9999px; margin: 4px 0 16px;
  border: 2.5px solid rgba(254,240,138,0.85);
  box-shadow: 0 10px 26px rgba(124,58,237,0.38);
}
.top-pill-banner.emergency {
  background: linear-gradient(90deg, #dc2626 0%, #ef4444 50%, #f97316 100%);
  animation: pulseGlow 2s infinite;
}
@keyframes pulseGlow { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.55); } 50% { box-shadow: 0 0 0 10px rgba(239,68,68,0); } }

/* 1. Personal Welcome Hero Banner */
.welcome-hero {
  background: linear-gradient(125deg, #6d28d9 0%, #9333ea 50%, #ec4899 100%);
  color: #ffffff; border-radius: 26px; padding: 20px 20px;
  margin-bottom: 16px; display: flex; align-items: center; gap: 16px;
  flex-wrap: wrap; border: 2px solid rgba(255,255,255,0.4);
  box-shadow: 0 14px 32px rgba(88,28,135,0.34);
}
.welcome-avatar {
  width: 68px; height: 68px; border-radius: 50%; object-fit: cover;
  border: 3px solid #fef08a; background: #fff; flex-shrink: 0;
  box-shadow: 0 6px 16px rgba(0,0,0,0.22);
}
.welcome-info h2 { font-size: 1.25rem; font-weight: 850; line-height: 1.25; }
.welcome-info p { font-size: 12.5px; opacity: 0.92; margin-top: 3px; }
.welcome-pills { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 7px; }
.w-pill { background: rgba(255,255,255,0.2); backdrop-filter: blur(6px); padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; color: #fff; }

/* 2. App-Style 3D Colorful Hub Tiles (Exact Match to Screenshot!) */
.hub-header {
  display: flex; align-items: center; gap: 8px;
  font-size: 1.08rem; font-weight: 850; color: #5b21b6;
  padding-bottom: 12px; margin-bottom: 14px;
  border-bottom: 1.5px dashed rgba(139,92,246,0.35);
}
[data-theme="dark"] .hub-header { color: #e9d5ff; }
.hub-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 13px;
}
.hub-tile {
  position: relative; border-radius: 22px; padding: 16px 10px 14px;
  text-align: center; color: #ffffff;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 7px; min-height: 124px; transition: transform 0.16s, box-shadow 0.16s;
  border: 2px solid rgba(255,255,255,0.55);
}
.hub-tile:hover { transform: translateY(-3px); color: #ffffff; }
.hub-tile:active { transform: translateY(2px); }
.hub-ico-circle {
  width: 48px; height: 48px; border-radius: 50%; background: #ffffff;
  display: grid; place-items: center; font-size: 24px;
  box-shadow: 0 4px 10px rgba(0,0,0,0.14);
}
.hub-tile .t-main { font-size: 13.5px; font-weight: 800; line-height: 1.2; text-shadow: 0 1px 2px rgba(0,0,0,0.14); }
.hub-tile .t-sub { font-size: 11px; font-weight: 600; opacity: 0.92; line-height: 1.1; }
.notif-badge {
  position: absolute; top: -6px; right: -5px;
  background: #ef4444; color: #fff; font-size: 11px; font-weight: 850;
  min-width: 22px; height: 22px; border-radius: 999px; padding: 0 6px;
  display: grid; place-items: center; border: 2px solid #fff;
  box-shadow: 0 3px 8px rgba(239,68,68,0.5);
}

.hub-tile.purple { background: linear-gradient(155deg, #c084fc 0%, #8b5cf6 55%, #7e22ce 100%); box-shadow: 0 5px 0 #581c87; }
.hub-tile.sky    { background: linear-gradient(155deg, #7dd3fc 0%, #38bdf8 50%, #0284c7 100%); box-shadow: 0 5px 0 #075985; }
.hub-tile.orange { background: linear-gradient(155deg, #fdba74 0%, #fb923c 50%, #ea580c 100%); box-shadow: 0 5px 0 #9a3412; }
.hub-tile.pink   { background: linear-gradient(155deg, #f9a8d4 0%, #f472b6 50%, #db2777 100%); box-shadow: 0 5px 0 #9d174d; }
.hub-tile.green  { background: linear-gradient(155deg, #6ee7b7 0%, #34d399 50%, #059669 100%); box-shadow: 0 5px 0 #065f46; }
.hub-tile.blue   { background: linear-gradient(155deg, #93c5fd 0%, #60a5fa 50%, #2563eb 100%); box-shadow: 0 5px 0 #1e40af; }
.hub-tile.teal   { background: linear-gradient(155deg, #5eead4 0%, #14b8a6 50%, #0f766e 100%); box-shadow: 0 5px 0 #115e59; }
.hub-tile.yellow { background: linear-gradient(155deg, #fde047 0%, #f59e0b 55%, #d97706 100%); box-shadow: 0 5px 0 #92400e; }
.hub-tile.indigo { background: linear-gradient(155deg, #a5b4fc 0%, #6366f1 55%, #4338ca 100%); box-shadow: 0 5px 0 #312e81; }
.hub-tile.red    { background: linear-gradient(155deg, #fca5a5 0%, #ef4444 55%, #dc2626 100%); box-shadow: 0 5px 0 #991b1b; }
.hub-tile.gray   { background: linear-gradient(155deg, #94a3b8 0%, #64748b 55%, #334155 100%); box-shadow: 0 5px 0 #1e293b; }

/* 3. 3D Flip Digital ID Card (Front & Back) */
.flip-wrap { perspective: 1100px; max-width: 430px; margin: 14px auto; cursor: pointer; }
.flip-inner {
  position: relative; width: 100%; min-height: 248px;
  transition: transform 0.65s cubic-bezier(0.4, 0.2, 0.2, 1);
  transform-style: preserve-3d;
}
.flip-wrap.flipped .flip-inner { transform: rotateY(180deg); }
.flip-face {
  position: relative; width: 100%; backface-visibility: hidden; -webkit-backface-visibility: hidden;
  border-radius: 22px; background: #ffffff; color: #1e293b;
  box-shadow: var(--shadow-xl); overflow: hidden; border: 2px solid rgba(139,92,246,0.35);
}
.flip-back {
  position: absolute; top: 0; left: 0; height: 100%;
  transform: rotateY(180deg);
  display: flex; flex-direction: column; justify-content: space-between;
  background: linear-gradient(150deg, #ffffff 0%, #faf5ff 55%, #fdf2f8 100%);
}
.id-hd {
  background: linear-gradient(90deg, #6d28d9 0%, #ec4899 100%);
  color: #fff; padding: 13px 16px; font-weight: 800; font-size: 12.5px;
  display: flex; justify-content: space-between; align-items: center;
}
.id-bd { display: flex; gap: 14px; padding: 16px; align-items: center; position: relative; }
.id-bd img { width: 88px; height: 110px; border-radius: 13px; object-fit: cover; border: 2.5px solid #c084fc; }
.id-seal { position: absolute; right: 12px; bottom: 6px; opacity: 0.22; pointer-events: none; }

/* 4. Next Event Countdown Card */
.event-highlight {
  background: linear-gradient(135deg, #fff7ed 0%, #fdf2f8 100%);
  border: 2px dashed #fb923c; border-radius: 20px; padding: 16px;
  margin-top: 14px; display: flex; justify-content: space-between; align-items: center;
  flex-wrap: wrap; gap: 12px;
}
[data-theme="dark"] .event-highlight { background: rgba(234,88,12,0.14); }

/* Floating Dark Pill Bottom Nav (Exact Match to Screenshot!) */
.floating-nav-wrap {
  position: fixed; bottom: 10px; left: 0; right: 0; z-index: 999;
  display: flex; justify-content: center; pointer-events: none; padding: 0 12px;
}
.floating-nav {
  pointer-events: auto; width: 100%; max-width: 520px;
  background: #181c2e; border-radius: 9999px;
  padding: 6px 10px; display: flex; justify-content: space-around; align-items: center;
  box-shadow: 0 14px 32px rgba(15,23,42,0.52); border: 1.5px solid rgba(255,255,255,0.12);
}
.floating-nav a {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px; color: #cbd5e1; font-size: 10.5px; font-weight: 700;
  padding: 6px 12px; border-radius: 999px; transition: 0.2s; min-width: 56px;
}
.floating-nav a .ico { font-size: 17px; line-height: 1; }
.floating-nav a.active {
  background: linear-gradient(135deg, #60a5fa 0%, #a855f7 55%, #ec4899 100%);
  color: #ffffff; box-shadow: 0 4px 14px rgba(168,85,247,0.55);
}

/* ALLS Login Card Styles */
.alls-login-wrap { min-height: 84vh; display: flex; align-items: center; justify-content: center; padding: 14px 4px; }
.alls-card { width: 100%; max-width: 440px; background: var(--surface-solid); border-radius: 30px; padding: 28px 24px 26px; box-shadow: var(--shadow-xl); position: relative; overflow: hidden; }
.alls-top-bar { position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 110px; height: 5px; border-radius: 0 0 8px 8px; background: linear-gradient(90deg, #f472b6, #fbbf24); }
.alls-logo-ring { width: 84px; height: 84px; margin: 4px auto 14px; border-radius: 50%; background: linear-gradient(135deg, #f59e0b 0%, #ec4899 50%, #6366f1 100%); padding: 3.5px; box-shadow: 0 10px 25px rgba(236,72,153,0.25); }
.alls-logo-core { width: 100%; height: 100%; border-radius: 50%; background: #ffffff; display: grid; place-items: center; font-size: 38px; }
.alls-title { text-align: center; font-size: 1.2rem; font-weight: 850; color: var(--text); text-transform: uppercase; line-height: 1.3; }
.alls-pill { display: inline-flex; align-items: center; gap: 6px; background: var(--pink-soft); color: #be185d; border: 1.5px solid #f9a8d4; border-radius: 9999px; padding: 5px 16px; font-size: 12.5px; font-weight: 700; margin: 10px auto 20px; }
.alls-label { display: block; font-size: 11.5px; font-weight: 800; letter-spacing: 0.6px; color: var(--text-muted); text-transform: uppercase; margin: 14px 0 7px; }
.alls-role-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; margin-bottom: 16px; }
.alls-role-card { position: relative; background: var(--surface-soft); border: 1.5px solid var(--border); border-radius: 18px; padding: 17px 10px; text-align: center; cursor: pointer; box-shadow: 0 4px 0 rgba(148,163,184,0.35); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; min-height: 80px; }
.alls-role-card .r-ico { font-size: 22px; }
.alls-role-card .r-txt { font-size: 13.5px; font-weight: 750; color: var(--text); }
.alls-role-card .r-check { display: none; position: absolute; top: 8px; right: 8px; width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(135deg, #f472b6, #db2777); color: white; font-size: 12px; font-weight: 800; place-items: center; }
.alls-role-card.active { background: linear-gradient(180deg, #fff1f2 0%, #fce7f3 100%); border: 2px solid #ec4899; box-shadow: 0 4px 0 #f472b6; }
[data-theme="dark"] .alls-role-card.active { background: rgba(236,72,153,0.22); }
.alls-role-card.active .r-check { display: grid; }
.input-ico-wrap { position: relative; }
.input-ico-wrap .ico { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-size: 16px; pointer-events: none; }
.input-ico-wrap input { padding-left: 42px; height: 48px; border-radius: 14px; border: 1.5px solid var(--border); background: var(--surface-solid); font-size: 14.5px; width: 100%; color: var(--text); }
.btn-alls-primary { width: 100%; border: none; border-radius: 16px; padding: 14px; background: linear-gradient(90deg, #2563eb 0%, #0d9488 100%); color: #fff; font-size: 15px; font-weight: 750; cursor: pointer; box-shadow: 0 5px 0 #4f46e5; margin-top: 18px; }
.btn-alls-green { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; border: none; border-radius: 9999px; padding: 13px; background: linear-gradient(90deg, #34d399 0%, #10b981 100%); color: #fff; font-size: 14.5px; font-weight: 750; cursor: pointer; box-shadow: 0 5px 0 #059669; margin-top: 14px; }
.btn-alls-forgot { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; border: none; border-radius: 14px; padding: 12px; background: linear-gradient(90deg, #2563eb 0%, #0d9488 100%); color: #fef08a; font-size: 14px; font-weight: 750; margin-top: 13px; }

/* Standard Controls */
label { display: block; font-weight: 650; font-size: 12px; margin: 11px 0 5px; color: var(--text-2); }
input, select, textarea { width: 100%; padding: 11px 14px; background: var(--surface-solid); border: 1.5px solid var(--border); border-radius: 13px; font: inherit; color: var(--text); font-size: 14px; }
input:focus, select:focus, textarea:focus { outline: none; border-color: #8b5cf6; box-shadow: 0 0 0 3px rgba(139,92,246,0.16); }
textarea { resize: vertical; min-height: 80px; }

.btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; background: linear-gradient(90deg, #7c3aed, #ec4899); color: #fff; border: 0; border-radius: 999px; padding: 11px 20px; font-weight: 700; cursor: pointer; font-size: 13.5px; box-shadow: 0 4px 0 rgba(109,40,217,0.45); transition: 0.15s; }
.btn:hover { transform: translateY(-1px); color: #fff; }
.btn.secondary { background: var(--surface-solid); border: 1.5px solid var(--border); color: var(--text); box-shadow: 0 3px 0 var(--border); }
.btn.danger { background: linear-gradient(135deg, #f87171, #ef4444); box-shadow: 0 4px 0 #b91c1c; }
.btn.g, .btn.excel { background: linear-gradient(90deg, #34d399, #10b981); box-shadow: 0 4px 0 #047857; }
.btn.edit-btn { background: linear-gradient(135deg, #6366f1, #4f46e5); box-shadow: 0 3px 0 #3730a3; }



.search-bar { display: flex; gap: 8px; margin-bottom: 14px; background: var(--surface); padding: 6px 8px; border-radius: 999px; border: 2px dashed var(--card-dash); }
.search-bar input { border: none; background: transparent; padding: 6px 12px; }

table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; }
th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; }
th { background: var(--surface-soft); font-weight: 750; color: var(--primary); font-size: 11px; text-transform: uppercase; }
.tw { overflow-x: auto; background: var(--surface-solid); border-radius: 16px; border: 1px solid var(--border); }

.badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 750; }
.badge.official { background: #d1fae5; color: #047857; }
.badge.pending { background: #fef3c7; color: #b45309; }
.badge.rejected { background: #fee2e2; color: #b91c1c; }
.badge.registered { background: #dbeafe; color: #1d4ed8; }
.badge.alert { background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; }
.err { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; padding: 11px 14px; border-radius: 12px; margin: 10px 0; font-size: 13.5px; font-weight: 600; }
.msgok { background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; padding: 11px 14px; border-radius: 12px; margin: 10px 0; font-size: 13.5px; font-weight: 600; }

.cert-box { max-width: 720px; margin: 18px auto; background: linear-gradient(135deg, #fffbeb 0%, #ffffff 50%, #fdf2f8 100%); color: #1e293b; border: 10px double #d97706; border-radius: 18px; padding: 34px 28px; text-align: center; box-shadow: var(--shadow-xl); }
.cert-box h2 { font-size: 1.65rem; color: #5b21b6; text-transform: uppercase; margin: 10px 0 4px; }
.cert-name { font-size: 1.8rem; font-weight: 850; color: #b45309; margin: 12px 0; border-bottom: 2px solid #fcd34d; display: inline-block; padding: 0 22px 4px; }

.poll-bar-bg { background: var(--surface-soft); border: 1px solid var(--border); border-radius: 999px; height: 12px; overflow: hidden; margin-top: 5px; }
.poll-bar-fill { background: linear-gradient(90deg, #7c3aed, #ec4899); height: 100%; border-radius: 999px; }

.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: 12px; margin-bottom: 14px; }
.stat-card { background: var(--surface); border: 2px dashed var(--card-dash); border-radius: 20px; padding: 16px 10px; text-align: center; box-shadow: var(--shadow); }
.stat-card .num { font-size: 1.9rem; font-weight: 850; line-height: 1.1; margin-bottom: 4px; }
.stat-card .label { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }
.stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; margin-bottom: 14px; }
.stat-chip { background: var(--surface-solid); border-radius: 14px; padding: 12px 10px; text-align: center; border: 1px solid var(--border); }
.stat-chip b { display: block; font-size: 1.25rem; font-weight: 800; color: var(--primary); }
.stat-chip span { font-size: 11px; color: var(--text-muted); font-weight: 600; }
.form-section { background: var(--surface-soft); border: 1.5px dashed var(--card-dash); border-radius: 16px; padding: 15px 14px 12px; margin: 12px 0; }
.form-section h4 { font-size: 13px; font-weight: 800; color: var(--primary); margin: 0 0 8px; }

.toast { position: fixed; top: 18px; right: 18px; z-index: 9999; background: #10b981; color: white; padding: 12px 18px; border-radius: 14px; font-weight: 700; font-size: 13.5px; box-shadow: 0 12px 28px rgba(0,0,0,0.25); animation: slideIn 0.3s ease, fadeOut 0.4s ease 3s forwards; }
@keyframes slideIn { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes fadeOut { to { transform: translateY(-20px); opacity: 0; pointer-events: none; } }

main { flex: 1; display: flex; flex-direction: column; }
footer { text-align: center; padding: 18px 16px 88px; color: rgba(255,255,255,0.88); font-size: 12px; margin-top: auto; }
footer a { color: #fef08a; font-weight: 700; }

@media (max-width: 560px) {
  .hub-grid { grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .hub-tile { padding: 13px 6px 11px; min-height: 110px; border-radius: 18px; }
  .hub-ico-circle { width: 42px; height: 42px; font-size: 20px; }
  .hub-tile .t-main { font-size: 11.8px; }
  .hub-tile .t-sub { font-size: 9.8px; }
}
`;

const CLIENT_JS = `
<script>
(function(){
  const t = localStorage.getItem('sm_theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
  const btn = document.getElementById('themeToggle');
  if(btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
})();
function toggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', cur);
  localStorage.setItem('sm_theme', cur);
  const btn = document.getElementById('themeToggle');
  if(btn) btn.textContent = cur === 'dark' ? '☀️' : '🌙';
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
document.addEventListener('change', async function(e){
  const input = e.target;
  if(!input || input.type !== 'file' || !input.files || !input.files[0]) return;
  const file = input.files[0];
  if(!/^image\\/(jpeg|png|webp)$/.test(file.type) || file.size < 350000) return;
  try {
    const img = await createImageBitmap(file);
    const maxW = 1000, scale = img.width > maxW ? maxW / img.width : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.78));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], file.name.replace(/\\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
    input.files = dt.files;
  } catch(err) {}
});
</script>
`;

function page(req, title, body, opts = {}) {
  const l = L(req);
  const isMember = !!req.session.mid;
  const isStaff = !!req.session.sr;
  const ethToday = toEthiopianDate(new Date(), l);

  const langSwitcher = `
    <div class="lang-box">
      <a class="lang-btn ${l === 'om' ? 'active' : ''}" href="/lang/om">OM</a>
      <a class="lang-btn ${l === 'am' ? 'active' : ''}" href="/lang/am">አማ</a>
      <a class="lang-btn ${l === 'en' ? 'active' : ''}" href="/lang/en">EN</a>
    </div>
    <button id="themeToggle" class="theme-btn" onclick="toggleTheme()" title="Switch Theme">🌙</button>
  `;

  let extNav = '';
  if (isMember) extNav = `<div class="ext-nav"><a class="ext-btn" href="/student-dashboard">🏠 Hub</a><a class="ext-btn login-btn" href="/logout">${h(tr(req, 'logout'))}</a></div>`;
  else if (isStaff) extNav = `<div class="ext-nav"><a class="ext-btn" href="/admin">⚙️ Admin</a><a class="ext-btn login-btn" href="/logout">${h(tr(req, 'logout'))}</a></div>`;
  else extNav = `<div class="ext-nav"><a class="ext-btn" href="/about">${h(tr(req, 'about'))}</a><a class="ext-btn login-btn" href="/login">${h(tr(req, 'login'))}</a></div>`;

  let toast = '';
  if (req.query.ok) toast = `<div class="toast">✅ Action completed successfully!</div>`;
  else if (req.query.saved) toast = `<div class="toast">💾 Saved successfully!</div>`;
  else if (req.query.rsvp) toast = `<div class="toast">🎉 RSVP confirmed!</div>`;
  else if (req.query.voted) toast = `<div class="toast">🗳️ Your vote has been recorded!</div>`;

  // Floating Dark Pill Bottom Nav (Matching Reference Screenshot)
  let floatingNav = '';
  if (isMember) {
    floatingNav = `
      <div class="floating-nav-wrap"><nav class="floating-nav">
        <a href="/student-dashboard" class="${req.path === '/student-dashboard' ? 'active' : ''}"><span class="ico">🏠</span>Home</a>
        <a href="/portal/announcements" class="${req.path.includes('announcements') ? 'active' : ''}"><span class="ico">📢</span>News</a>
        <a href="/portal/polls" class="${req.path.includes('polls') ? 'active' : ''}"><span class="ico">🗳️</span>Polls</a>
        <a href="/portal/events" class="${req.path.includes('events') ? 'active' : ''}"><span class="ico">📅</span>Events</a>
        <a href="/portal/profile" class="${req.path.includes('profile') ? 'active' : ''}"><span class="ico">🪪</span>My Profile</a>
      </nav></div>
    `;
  } else if (isStaff) {
    floatingNav = `
      <div class="floating-nav-wrap"><nav class="floating-nav">
        <a href="/admin" class="${req.path === '/admin' ? 'active' : ''}"><span class="ico">📊</span>Home</a>
        <a href="/admin/members" class="${req.path.includes('/admin/members') ? 'active' : ''}"><span class="ico">👥</span>Members</a>
        <a href="/admin/content/announcement" class="${req.path.includes('/admin/content') ? 'active' : ''}"><span class="ico">📢</span>Posts</a>
        <a href="/admin/polls" class="${req.path.includes('/admin/polls') ? 'active' : ''}"><span class="ico">🗳️</span>Polls</a>
        <a href="/admin/finance" class="${req.path.includes('/admin/finance') ? 'active' : ''}"><span class="ico">💰</span>Finance</a>
      </nav></div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="${l}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#7c3aed">
  <link rel="manifest" href="/manifest.json">
  <title>${h(title)} · ${h(tr(req, 'site'))}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>${CSS}</style>
</head>
<body class="${opts.authBg ? 'auth-bg' : ''}">
${toast}
${opts.hideHeader ? '' : `
<header>
  <div class="in">
    <div class="header-top">
      <a href="/" class="logo-area" style="text-decoration:none">
        <div class="logo-icon"><div class="logo-icon-inner">🌳</div></div>
        <div class="logo-text">
          <h1>${h(tr(req, 'site'))}</h1>
          <p>${h(tr(req, 'uni'))} · 📅 ${h(ethToday)}</p>
        </div>
      </a>
      <div class="nav-group">${langSwitcher}${extNav}</div>
    </div>
  </div>
</header>`}
<main>
  <div class="in" style="padding-top: 16px; padding-bottom: 24px; width: 100%;">${body}</div>
</main>
${opts.hideFooter ? '' : `
<footer>
  <div class="in">
    <p>© ${new Date().getFullYear()} ${h(tr(req, 'site'))} · ${h(tr(req, 'uni'))} · ${h(ethToday)}</p>
    <p style="margin-top:5px;">
      <a href="/about">${h(tr(req, 'about'))}</a> · <a href="/campuses">${h(tr(req, 'campuses'))}</a> ·
      <a href="/privacy">${h(tr(req, 'privacy'))}</a> · <a href="/terms">${h(tr(req, 'terms'))}</a>
    </p>
  </div>
</footer>`}
${floatingNav}
${CLIENT_JS}
</body>
</html>`;
}

// Clean Sub-page Top Bar (No Pill Menu - Navigation uses the 3D Hub Grid only)
function portalMenu(activePath) {
  const items = [
    { p: '/student-dashboard', i: '🏠', t: 'Hub' },
    { p: '/portal/announcements', i: '📢', t: 'News' },
    { p: '/portal/payments', i: '💳', t: 'Payments' },
    { p: '/portal/lost-found', i: '🔍', t: 'Lost & Found' },
    { p: '/portal/freshman-guide', i: '🎓', t: 'Freshman' },
    { p: '/portal/attendance', i: '📱', t: 'Attendance' },
    { p: '/portal/alumni', i: '🌟', t: 'Alumni' },
    { p: '/portal/suggestions', i: '📮', t: 'Suggestions' },
    { p: '/portal/media-hub', i: '📺', t: 'Media Hub' },
    { p: '/portal/polls', i: '🗳️', t: 'Polls' },
    { p: '/portal/certificates', i: '🏅', t: 'Certificates' },
    { p: '/portal/forum', i: '💡', t: 'Forum' }
  ];
  return `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
      <a href="/student-dashboard" class="btn secondary" style="padding:7px 14px; font-size:12.5px;">← Back to Hub · ወደ ዋናው ሜኑ</a>
      <form class="search-bar" method="GET" action="/portal/search" style="margin:0; flex:1; min-width:200px;">
        <input name="q" placeholder="🔍 Search portal..." required>
        <button class="btn" style="padding:5px 12px; font-size:12px;">Search</button>
      </form>
    </div>
    <div class="portal-menu" style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:14px; background:var(--surface); padding:8px; border-radius:18px; border:2px dashed var(--card-dash);">
      ${items.map(x => `<a href="${x.p}" class="portal-btn${activePath === x.p ? ' active' : ''}" style="padding:6px 11px; font-size:11.5px; border-radius:999px; background:var(--surface-soft); color:var(--text-2); border:1px solid var(--border); display:inline-flex; align-items:center; gap:4px; ${activePath === x.p ? 'background:linear-gradient(90deg, #7c3aed, #ec4899); color:#fff; border-color:transparent;' : ''}">${x.i} ${x.t}</a>`).join('')}
    </div>
  `;
}

function postT(req, p, f) {
  const l = L(req);
  if (l === 'am') return p[f + '_am'] || p[f + '_om'] || p[f + '_en'] || '';
  if (l === 'om') return p[f + '_om'] || p[f + '_en'] || '';
  return p[f + '_en'] || p[f + '_om'] || '';
}

function postCard(req, p, extraHtml = '') {
  const isEmergency = p.is_emergency ? `<span class="badge alert" style="margin-left:8px">🚨 EMERGENCY</span>` : '';
  const dtRaw = p.event_date || p.created_at;
  const ethDt = toEthiopianDate(dtRaw, L(req));
  return `<div class="glass-card" style="margin-bottom:14px; border-left: 5px solid ${p.is_emergency ? '#ef4444' : '#7c3aed'}">
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
      <small style="color:var(--text-muted);font-weight:700;font-size:11.5px">${h(p.campus === 'all' ? 'All Campuses' : campusName(req, p.campus))} · ${h(p.event_date || new Date(p.created_at).toLocaleDateString())} ${ethDt ? `(${h(ethDt)})` : ''}</small>
      <div>${isEmergency}</div>
    </div>
    <h3 style="margin:7px 0 8px; font-size:1.1rem; font-weight:800">${h(postT(req, p, 'title'))}</h3>
    ${p.image_id ? `<img style="width:100%;max-height:330px;object-fit:cover;border-radius:14px;margin-bottom:10px" src="/photo/${p.image_id}" alt="">` : ''}
    <div style="color:var(--text-2);font-size:14px;line-height:1.65">${h(postT(req, p, 'body')).replace(/\n/g, '<br>')}</div>
    ${p.file_id ? `<p style="margin-top:12px"><a class="btn secondary" style="padding:6px 14px;font-size:12px" href="/photo/${p.file_id}?dl=1">📥 Download Attachment</a></p>` : ''}
    ${extraHtml}
  </div>`;
}

const scopeOf = req => (CENTRAL.includes(req.session.sr) ? null : (req.session.campus || '-'));
async function isElectionOn() {
  try {
    const [r] = await q(`SELECT val FROM site_settings WHERE key='election_portal_on'`);
    return !r || r.val !== '0';
  } catch (e) { return true; }
}
const ROLE_LABELS = {
  central_admin: 'CENTRAL ADMIN',
  president: 'PRESIDENT',
  vice_president: 'VICE PRESIDENT',
  general_secretary: 'GENERAL SECRETARY',
  finance_secretary: 'FINANCE SECRETARY',
  academic_secretary: 'ACADEMIC SECRETARY',
  social_secretary: 'SOCIAL SECRETARY',
  communication_secretary: 'COMMUNICATION SECRETARY',
  media_secretary: 'MEDIA SECRETARY',
  info_secretary: 'INFO SECRETARY',
  dev_secretary: 'DEVELOPMENT SECRETARY',
  campus_rep: 'CAMPUS REPRESENTATIVE',
  campus_coordinator: 'CAMPUS COORDINATOR',
  committee_member: 'COMMITTEE MEMBER',
  member: 'MEMBER'
};
function staffRoleBanner(req) {
  const sr = req.session.sr || 'member';
  const label = ROLE_LABELS[sr] || sr.replace(/_/g, ' ').toUpperCase();
  const cmp = req.session.campus ? campusName(req, req.session.campus) : 'Central Executive · All Campuses';
  const themes = {
    central_admin: 'linear-gradient(125deg, #4f46e5 0%, #7c3aed 50%, #ec4899 100%)',
    president: 'linear-gradient(125deg, #b45309 0%, #d97706 45%, #f59e0b 100%)',
    vice_president: 'linear-gradient(125deg, #6d28d9 0%, #9333ea 55%, #c026d3 100%)',
    finance_secretary: 'linear-gradient(125deg, #047857 0%, #059669 50%, #10b981 100%)',
    campus_rep: 'linear-gradient(125deg, #1d4ed8 0%, #2563eb 50%, #0ea5e9 100%)',
    committee_member: 'linear-gradient(125deg, #0f766e 0%, #0d9488 50%, #14b8a6 100%)'
  };
  const bg = themes[sr] || 'linear-gradient(125deg, #5b21b6 0%, #7c3aed 55%, #db2777 100%)';
  const ico = sr === 'president' ? '👑' : (sr === 'central_admin' ? '🛡️' : (sr === 'committee_member' ? '👥' : '🎖️'));
  return `
    <div style="background:${bg}; color:#fff; border-radius:26px; padding:22px 20px; margin-bottom:16px; border:3px solid rgba(254,240,138,0.85); box-shadow:0 16px 34px rgba(76,29,149,0.35); position:relative; overflow:hidden;">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:14px;">
          <div style="width:62px; height:62px; border-radius:20px; background:rgba(255,255,255,0.2); backdrop-filter:blur(8px); border:2px solid rgba(255,255,255,0.5); display:grid; place-items:center; font-size:32px; flex-shrink:0;">${ico}</div>
          <div>
            <div style="font-size:11px; font-weight:800; letter-spacing:1.4px; opacity:0.9; text-transform:uppercase;">OFFICIAL PORTAL ROLE · የኃላፊነት ድርሻ</div>
            <div style="font-size:1.65rem; font-weight:900; letter-spacing:0.6px; line-height:1.15; text-shadow:0 2px 6px rgba(0,0,0,0.22); margin:3px 0;">${h(label)}</div>
            <div style="font-size:13px; font-weight:650; opacity:0.95;">👤 ${h(req.session.sname || 'Officer')} · 📍 ${h(cmp)}</div>
          </div>
        </div>
        <span style="background:rgba(255,255,255,0.22); border:1.5px solid rgba(255,255,255,0.55); padding:6px 14px; border-radius:999px; font-size:11.5px; font-weight:800;">📅 ${h(toEthiopianDate(new Date(), L(req)))}</span>
      </div>
    </div>
  `;
}

// ---------- DATABASE SCHEMA ----------
(async () => {
  await q(`CREATE TABLE IF NOT EXISTS files (id SERIAL PRIMARY KEY, mime TEXT, data BYTEA, name TEXT)`);
  await q(`CREATE TABLE IF NOT EXISTS members (
    id SERIAL PRIMARY KEY, member_no TEXT UNIQUE, name TEXT, gender TEXT, phone TEXT, email TEXT,
    campus TEXT, college TEXT, department TEXT, year TEXT, zone_woreda TEXT, telegram_handle TEXT,
    student_id TEXT UNIQUE, photo_id INTEGER, password TEXT,
    status TEXT DEFAULT 'registered', role TEXT DEFAULT 'student',
    renewal_date TIMESTAMP DEFAULT NOW(), created_at TIMESTAMP DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY, type TEXT, subcategory TEXT DEFAULT 'general', campus TEXT DEFAULT 'all',
    title_om TEXT, title_en TEXT, title_am TEXT, body_om TEXT, body_en TEXT, body_am TEXT,
    event_date TEXT, image_id INTEGER, file_id INTEGER, is_emergency INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS event_rsvps (id SERIAL PRIMARY KEY, post_id INTEGER, member_no TEXT, created_at TIMESTAMP DEFAULT NOW(), UNIQUE(post_id, member_no))`);
  await q(`CREATE TABLE IF NOT EXISTS polls (id SERIAL PRIMARY KEY, title TEXT, description TEXT, options TEXT, candidate_nos TEXT, max_choices INTEGER DEFAULT 5, campus TEXT DEFAULT 'all', status TEXT DEFAULT 'open', created_at TIMESTAMP DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS poll_votes (id SERIAL PRIMARY KEY, poll_id INTEGER, member_no TEXT, choice TEXT, created_at TIMESTAMP DEFAULT NOW(), UNIQUE(poll_id, member_no, choice))`);
  await q(`CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, val TEXT)`);
  await q(`CREATE TABLE IF NOT EXISTS certificates (id SERIAL PRIMARY KEY, cert_code TEXT UNIQUE, member_no TEXT, member_name TEXT, title TEXT, role_award TEXT, issue_date TEXT, created_at TIMESTAMP DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS forum_posts (id SERIAL PRIMARY KEY, member_no TEXT, author_name TEXT, campus TEXT, category TEXT DEFAULT 'general', title TEXT, body TEXT, created_at TIMESTAMP DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS forum_replies (id SERIAL PRIMARY KEY, post_id INTEGER, member_no TEXT, author_name TEXT, body TEXT, created_at TIMESTAMP DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS staff (id SERIAL PRIMARY KEY, username TEXT UNIQUE, name TEXT, role TEXT, campus TEXT, password TEXT, active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS leaders (id SERIAL PRIMARY KEY, name TEXT, role_key TEXT, position_om TEXT, position_en TEXT, position_am TEXT, term TEXT DEFAULT '2025-2026', responsibilities TEXT, level TEXT DEFAULT 'central', campus TEXT DEFAULT 'all', photo_id INTEGER, ord INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS meetings (id SERIAL PRIMARY KEY, campus TEXT DEFAULT 'all', title TEXT, meeting_date TEXT, agenda TEXT, minutes TEXT, resolutions TEXT, attendance_count INTEGER DEFAULT 0, file_id INTEGER, created_at TIMESTAMP DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS support_requests (id SERIAL PRIMARY KEY, member_no TEXT, name TEXT, campus TEXT, subject TEXT, category TEXT DEFAULT 'general', message TEXT, status TEXT DEFAULT 'open', reply TEXT, created_at TIMESTAMP DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS transactions (id SERIAL PRIMARY KEY, kind TEXT, amount NUMERIC, tdate TEXT, note TEXT, campus TEXT DEFAULT 'all', created_by TEXT, created_at TIMESTAMP DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS finance_reports (id SERIAL PRIMARY KEY, period TEXT, campus TEXT, income NUMERIC, expense NUMERIC, starting_balance NUMERIC DEFAULT 0, detail TEXT, approved INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS audit_logs (id SERIAL PRIMARY KEY, actor TEXT, action TEXT, target TEXT, details TEXT, ip TEXT, created_at TIMESTAMP DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS password_resets (id SERIAL PRIMARY KEY, student_id TEXT, phone TEXT, reason TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMP DEFAULT NOW())`);
  
  -- Feature 3: Payments & Receipts
  await q(`CREATE TABLE IF NOT EXISTS member_payments (
    id SERIAL PRIMARY KEY, member_no TEXT, name TEXT, campus TEXT, amount NUMERIC,
    payment_method TEXT, transaction_ref TEXT UNIQUE, receipt_file_id INTEGER,
    status TEXT DEFAULT 'pending', admin_remark TEXT, created_at TIMESTAMP DEFAULT NOW()
  )`);

  -- Feature 4: Lost & Found
  await q(`CREATE TABLE IF NOT EXISTS lost_found (
    id SERIAL PRIMARY KEY, member_no TEXT, author_name TEXT, campus TEXT,
    category TEXT DEFAULT 'lost', title TEXT, description TEXT, phone TEXT,
    image_id INTEGER, status TEXT DEFAULT 'open', created_at TIMESTAMP DEFAULT NOW()
  )`);

  -- Feature 5: Mentorship Requests
  await q(`CREATE TABLE IF NOT EXISTS mentor_requests (
    id SERIAL PRIMARY KEY, freshman_no TEXT, freshman_name TEXT, campus TEXT,
    department TEXT, senior_mentor TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMP DEFAULT NOW()
  )`);

  -- Feature 6: QR Attendance
  await q(`CREATE TABLE IF NOT EXISTS attendance_sessions (
    id SERIAL PRIMARY KEY, title TEXT, campus TEXT DEFAULT 'all', event_date TEXT,
    code TEXT UNIQUE, created_at TIMESTAMP DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS attendance_logs (
    id SERIAL PRIMARY KEY, session_id INTEGER, member_no TEXT, member_name TEXT,
    scanned_at TIMESTAMP DEFAULT NOW(), UNIQUE(session_id, member_no)
  )`);

  -- Feature 9: Alumni Network
  await q(`CREATE TABLE IF NOT EXISTS alumni (
    id SERIAL PRIMARY KEY, full_name TEXT, batch_year TEXT, department TEXT,
    current_role TEXT, employer TEXT, phone TEXT, email TEXT, linkedin TEXT, created_at TIMESTAMP DEFAULT NOW()
  )`);

  -- Feature 13: Anonymous Suggestion Box
  await q(`CREATE TABLE IF NOT EXISTS anonymous_suggestions (
    id SERIAL PRIMARY KEY, campus TEXT DEFAULT 'all', category TEXT DEFAULT 'general',
    message TEXT, reply TEXT, status TEXT DEFAULT 'open', created_at TIMESTAMP DEFAULT NOW()
  )`);

  -- Feature 14: Heritage & YouTube Media Hub
  await q(`CREATE TABLE IF NOT EXISTS media_hub (
    id SERIAL PRIMARY KEY, title TEXT, youtube_url TEXT, description TEXT, campus TEXT DEFAULT 'all', created_at TIMESTAMP DEFAULT NOW()
  )`);

  -- Feature 15: Targeted Broadcasts
  await q(`CREATE TABLE IF NOT EXISTS targeted_broadcasts (
    id SERIAL PRIMARY KEY, title TEXT, target_campus TEXT DEFAULT 'all', target_year TEXT DEFAULT 'all',
    message TEXT, created_by TEXT, created_at TIMESTAMP DEFAULT NOW()
  )`);


  for (const sql of [
    `ALTER TABLE files ADD COLUMN IF NOT EXISTS name TEXT`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS college TEXT`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS zone_woreda TEXT`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS telegram_handle TEXT`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS renewal_date TIMESTAMP DEFAULT NOW()`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_emergency INTEGER DEFAULT 0`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS title_am TEXT`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS body_am TEXT`,
    `ALTER TABLE finance_reports ADD COLUMN IF NOT EXISTS starting_balance NUMERIC DEFAULT 0`,
    `ALTER TABLE polls ADD COLUMN IF NOT EXISTS candidate_nos TEXT`,
    `ALTER TABLE polls ADD COLUMN IF NOT EXISTS max_choices INTEGER DEFAULT 5`,
    `ALTER TABLE poll_votes DROP CONSTRAINT IF EXISTS poll_votes_poll_id_member_no_key`,
    `CREATE UNIQUE INDEX IF NOT EXISTS poll_votes_multi_idx ON poll_votes(poll_id, member_no, choice)`
  ]) { try { await q(sql); } catch (e) {} }
  await q(`INSERT INTO site_settings (key, val) VALUES ('election_portal_on', '1') ON CONFLICT (key) DO NOTHING`);

  const adminPass = bcrypt.hashSync(process.env.ADMIN_PASS || 'sikomando123', 10);
  const adminUser = process.env.ADMIN_USER || 'admin';
  await q(`INSERT INTO staff (username, name, role, campus, password, active) VALUES ($1, 'Central Admin', 'central_admin', NULL, $2, 1)
           ON CONFLICT (username) DO UPDATE SET password = $2, role = 'central_admin', active = 1`, [adminUser, adminPass]);
})().catch(e => console.error('DB init err:', e.message));

app.get('/lang/:l', (req, res) => {
  if (['om', 'am', 'en'].includes(req.params.l)) req.session.lang = req.params.l;
  res.redirect(req.get('referer') || '/');
});

// ---------- UNIFIED ALLS-STYLE LOGIN ----------
function renderAllsLogin(req) {
  const err = req.query.e ? `<div class="err">Invalid ID / Username or Password. Please try again.</div>` : '';
  return page(req, tr(req, 'login'), `
    <div class="alls-login-wrap">
      <div class="alls-card">
        <div class="alls-top-bar"></div>
        <div class="alls-logo-ring"><div class="alls-logo-core">🌳</div></div>
        <h2 class="alls-title">${h(tr(req, 'site'))}</h2>
        <div style="text-align:center;"><span class="alls-pill">✦ Official Digital Portal</span></div>
        ${err}
        <form method="POST" action="/login">
          <input type="hidden" name="login_role" id="loginRoleInput" value="student">
          <span class="alls-label">CHOOSE YOUR ROLE</span>
          <div class="alls-role-grid">
            <div class="alls-role-card active" onclick="pickRole(this,'student')"><span class="r-check">✓</span><span class="r-ico">🎓</span><span class="r-txt">Student</span></div>
            <div class="alls-role-card" onclick="pickRole(this,'campus_rep')"><span class="r-check">✓</span><span class="r-ico">🏛️</span><span class="r-txt">Campus Rep</span></div>
            <div class="alls-role-card" onclick="pickRole(this,'committee')"><span class="r-check">✓</span><span class="r-ico">👥</span><span class="r-txt">Committee</span></div>
            <div class="alls-role-card" onclick="pickRole(this,'admin')"><span class="r-check">✓</span><span class="r-ico">🛡️</span><span class="r-txt">Admin</span></div>
          </div>
          <span class="alls-label">ID / USERNAME</span>
          <div class="input-ico-wrap"><span class="ico">🪪</span><input name="u" id="loginUserInput" required placeholder="SM-ROB-2026-0001 or Student ID" autocomplete="username"></div>
          <span class="alls-label">PASSWORD / PIN</span>
          <div class="input-ico-wrap"><span class="ico">🔒</span><input name="p" type="password" required placeholder="Enter password" autocomplete="current-password"></div>
          <button type="submit" class="btn-alls-primary">Sign In to Portal</button>
        </form>
        <a href="/sikkoo-mandoo-register" class="btn-alls-green">📝 New Student Registration</a>
        <a href="/forgot-password" class="btn-alls-forgot">🔑 Forgot Password?</a>
        <div style="display:flex; justify-content:center; gap:14px; margin-top:16px; font-size:12px; font-weight:700;">
          <a href="/about">🏛️ About</a><a href="/campuses">📍 Campuses</a>
          <a href="/lang/om">OM</a><a href="/lang/am">አማ</a><a href="/lang/en">EN</a>
        </div>
      </div>
    </div>
    <script>
      function pickRole(el, role){
        document.querySelectorAll('.alls-role-card').forEach(c => c.classList.remove('active'));
        el.classList.add('active');
        document.getElementById('loginRoleInput').value = role;
        document.getElementById('loginUserInput').placeholder = role === 'student' ? 'SM-ROB-2026-0001 or Student ID' : 'Staff / Admin Username';
      }
    </script>
  `, { authBg: true, hideHeader: true, hideFooter: true });
}

app.get('/', (req, res) => { if (req.session.mid) return res.redirect('/student-dashboard'); if (req.session.sr) return res.redirect('/admin'); res.send(renderAllsLogin(req)); });
app.get('/login', (req, res) => { if (req.session.mid) return res.redirect('/student-dashboard'); if (req.session.sr) return res.redirect('/admin'); res.send(renderAllsLogin(req)); });
app.get('/admin-login', (req, res) => res.redirect('/login'));

const fails = new Map();
function limited(req, res) {
  const f = fails.get(req.ip) || { n: 0, t: Date.now() };
  if (Date.now() - f.t > 9e5) { f.n = 0; f.t = Date.now(); }
  if (f.n >= 10) { res.status(429).send('Too many login attempts. Please wait 15 minutes.'); return null; }
  return f;
}

app.post('/login', async (req, res) => {
  const f = limited(req, res); if (!f) return;
  const roleChoice = String(req.body.login_role || 'student'), u = String(req.body.u || '').trim(), pw = String(req.body.p || '');
  if (roleChoice !== 'student') {
    if ((u.toLowerCase() === 'admin' && pw === 'sikomando123') || (process.env.ADMIN_USER && u === process.env.ADMIN_USER && pw === process.env.ADMIN_PASS)) {
      req.session.mid = null; req.session.sr = 'central_admin'; req.session.sname = 'Central Admin'; req.session.campus = null;
      await logAudit(req, 'STAFF_LOGIN', 'admin', 'Central Admin signed in');
      return res.redirect('/admin');
    }
    const [st] = await q(`SELECT * FROM staff WHERE LOWER(username)=LOWER($1) AND active=1`, [u]);
    if (st && bcrypt.compareSync(pw, st.password)) {
      req.session.mid = null; req.session.sr = st.role; req.session.sname = st.name; req.session.campus = CENTRAL.includes(st.role) ? null : st.campus;
      await logAudit(req, 'STAFF_LOGIN', st.username, `Role: ${st.role}`);
      return res.redirect('/admin');
    }
  } else {
    const [m] = await q(`SELECT * FROM members WHERE UPPER(member_no)=UPPER($1) OR UPPER(student_id)=UPPER($1)`, [u]);
    if (m && bcrypt.compareSync(pw, m.password)) {
      req.session.sr = null; req.session.mid = m.member_no; req.session.campus = m.campus;
      await logAudit(req, 'MEMBER_LOGIN', m.member_no, 'Member login');
      return res.redirect('/student-dashboard');
    }
  }
  f.n++; fails.set(req.ip, f); res.redirect('/login?e=1');
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

// ---------- FORGOT PASSWORD & REGISTRATION ----------
app.get('/forgot-password', (req, res) => {
  const newPass = req.query.np || '', name = req.query.nm || '';
  res.send(page(req, 'Password Recovery', `
    <div class="alls-login-wrap"><div class="alls-card">
      <div class="alls-top-bar"></div><div class="alls-logo-ring"><div class="alls-logo-core">🔑</div></div>
      <h2 class="alls-title">Password Reset</h2>
      ${newPass ? `<div class="msgok"><strong>✅ New password for ${h(name)}:</strong><div style="font-size:1.5rem;font-weight:800;letter-spacing:2px;text-align:center;margin:10px 0;padding:10px;border:2px dashed #10b981;border-radius:12px;">${h(newPass)}</div></div><a href="/login" class="btn-alls-primary" style="display:block;text-align:center;">Go to Login →</a>`
      : `${req.query.e ? `<div class="err">No matching member found.</div>` : ''}<form method="POST" action="/forgot-password"><span class="alls-label">STUDENT ID</span><div class="input-ico-wrap"><span class="ico">🪪</span><input name="student_id" required></div><span class="alls-label">ZONE / WOREDA</span><div class="input-ico-wrap"><span class="ico">📍</span><input name="zone_woreda" required></div><button class="btn-alls-primary">Generate New Password</button></form><p style="text-align:center;margin-top:16px;"><a href="/login">← Back to Login</a></p>`}
    </div></div>
  `, { authBg: true, hideHeader: true, hideFooter: true }));
});

app.post('/forgot-password', async (req, res) => {
  const sid = String(req.body.student_id || '').trim(), zone = String(req.body.zone_woreda || '').trim().toLowerCase();
  const [m] = await q(`SELECT * FROM members WHERE UPPER(student_id)=UPPER($1) AND LOWER(COALESCE(zone_woreda,'')) LIKE $2`, [sid, '%' + zone + '%']);
  if (!m) return res.redirect('/forgot-password?e=1');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let temp = ''; for (let i = 0; i < 8; i++) temp += chars[Math.floor(Math.random() * chars.length)];
  await q(`UPDATE members SET password=$1 WHERE id=$2`, [bcrypt.hashSync(temp, 10), m.id]);
  res.redirect(`/forgot-password?np=${encodeURIComponent(temp)}&nm=${encodeURIComponent(m.name)}`);
});

function regForm(req, err, v) {
  v = v || {};
  const s = (k, o) => o.map(x => `<option value="${x[0]}"${v[k] === x[0] ? ' selected' : ''}>${h(x[1])}</option>`).join('');
  return page(req, tr(req, 'reg'), `
    <div style="max-width:680px; margin:10px auto;"><div class="glass-card">
      <h2 style="text-align:center; margin-bottom:12px;">📝 ${h(tr(req, 'reg'))}</h2>
      ${err ? `<div class="err">${h(err)}</div>` : ''}
      <form method="POST" action="/sikkoo-mandoo-register" enctype="multipart/form-data">
        <div class="form-section"><h4>👤 Personal & Academic Info</h4>
          <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:4px 14px;">
            <div><label>${h(tr(req, 'name'))} *</label><input name="name" required value="${h(v.name)}"></div>
            <div><label>${h(tr(req, 'sid'))} *</label><input name="student_id" required value="${h(v.student_id)}"></div>
            <div><label>${h(tr(req, 'gender'))} *</label><select name="gender">${s('gender', [['M', tr(req, 'male')], ['F', tr(req, 'female')]])}</select></div>
            <div><label>${h(tr(req, 'campus'))} *</label><select name="campus" required>${s('campus', Object.keys(CAMPUS).map(k => [k, campusName(req, k)]))}</select></div>
            <div><label>${h(tr(req, 'college'))} *</label><input name="college" required value="${h(v.college)}"></div>
            <div><label>${h(tr(req, 'dept'))} *</label><input name="department" required value="${h(v.department)}"></div>
            <div><label>${h(tr(req, 'year'))} *</label><select name="year">${s('year', [1,2,3,4,5,6].map(x => [String(x), 'Year ' + x]))}</select></div>
            <div><label>${h(tr(req, 'zone_woreda'))} *</label><input name="zone_woreda" required value="${h(v.zone_woreda)}"></div>
            <div><label>${h(tr(req, 'phone'))} *</label><input name="phone" required type="tel" value="${h(v.phone)}"></div>
            <div><label>${h(tr(req, 'telegram'))}</label><input name="telegram_handle" value="${h(v.telegram_handle)}" placeholder="@username"></div>
            <div><label>${h(tr(req, 'email'))}</label><input name="email" type="email" value="${h(v.email)}"></div>
          </div>
        </div>
        <div class="form-section"><h4>📷 Photo & Password</h4>
          <label>${h(tr(req, 'photo'))}</label><input name="photo" type="file" accept="image/jpeg,image/png,image/webp">
          <label>${h(tr(req, 'pass'))} (Min. 6 chars) *</label><input name="password" type="password" minlength="6" required>
        </div>
        <label style="display:flex;align-items:center;gap:10px;padding:11px;background:rgba(16,185,129,0.12);border-radius:12px;">
          <input type="checkbox" name="want" value="1" style="width:18px;height:18px;"><span>${h(tr(req, 'want'))}</span>
        </label>
        <button class="btn-alls-green" type="submit">${h(tr(req, 'send'))}</button>
      </form>
    </div></div>
  `);
}

app.get('/sikkoo-mandoo-register', (req, res) => res.send(regForm(req)));
app.post('/sikkoo-mandoo-register', upload.single('photo'), async (req, res) => {
  const b = req.body, c = CAMPUS[b.campus];
  if (!c || !b.name || !b.student_id || !b.phone || !b.department || !b.college || !b.zone_woreda || String(b.password || '').length < 6) return res.send(regForm(req, tr(req, 'bad'), b));
  try {
    if ((await q(`SELECT 1 FROM members WHERE UPPER(student_id)=UPPER($1)`, [b.student_id.trim()])).length) return res.send(regForm(req, tr(req, 'exists'), b));
    let pid = null;
    if (req.file && /^image\/(jpeg|png|webp)$/.test(req.file.mimetype)) pid = (await q(`INSERT INTO files (mime,data,name) VALUES ($1,$2,$3) RETURNING id`, [req.file.mimetype, req.file.buffer, 'profile-photo']))[0].id;
    const hash = bcrypt.hashSync(String(b.password), 10), yr = new Date().getFullYear();
    for (let i = 0; i < 6; i++) {
      const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM members WHERE campus=$1`, [b.campus]);
      const no = `SM-${c.c}-${yr}-${String(n + 1 + i).padStart(4, '0')}`;
      try {
        await q(`INSERT INTO members (member_no, name, gender, phone, email, campus, college, department, year, zone_woreda, telegram_handle, student_id, photo_id, password, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [no, b.name.trim().slice(0, 80), b.gender === 'F' ? 'F' : 'M', b.phone.trim().slice(0, 30), (b.email || '').slice(0, 80), b.campus, b.college.trim().slice(0, 80), b.department.trim().slice(0, 80), String(b.year || '1'), b.zone_woreda.trim().slice(0, 100), (b.telegram_handle || '').slice(0, 50), b.student_id.trim().slice(0, 40), pid, hash, b.want ? 'pending' : 'registered']);
        req.session.mid = no; req.session.campus = b.campus;
        return res.redirect('/student-dashboard?ok=1');
      } catch (e) { if (!/duplicate|unique/i.test(e.message)) throw e; }
    }
    res.send(regForm(req, tr(req, 'bad'), b));
  } catch (e) { res.status(500).send('Registration error'); }
});

// ---------- ABOUT & CAMPUSES ----------
app.get('/about', (req, res) => {
  res.send(page(req, tr(req, 'about'), `<div class="glass-card" style="padding:26px">
    <div style="text-align:center; margin-bottom:20px"><div class="alls-logo-ring"><div class="alls-logo-core">🌳</div></div><h2>${h(tr(req, 'site'))}</h2><p style="color:var(--text-muted)">${h(tr(req, 'uni'))}</p><span class="alls-pill">"Tokkummaa, Barnoota fi Aadaa" · "አንድነት፣ ትምህርት እና ባህል"</span></div>
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:14px;">
      <div class="form-section" style="margin:0"><h4>🏛️ History</h4><p style="font-size:13.5px; color:var(--text-2);">Founded at Madda Walabu University to cultivate unity, mutual assistance, academic excellence, and cultural heritage across Robe, Goba, and Shashamane campuses.</p></div>
      <div class="form-section" style="margin:0"><h4>🎯 Mission & Vision</h4><p style="font-size:13.5px; color:var(--text-2);">Empowering students through academic collaboration, ethical leadership, and cultural identity preservation.</p></div>
    </div>
  </div>`));
});

app.get('/campuses', async (req, res) => {
  const counts = await q(`SELECT campus, COUNT(*)::int as total, SUM(CASE WHEN status='official' THEN 1 ELSE 0 END)::int as official FROM members GROUP BY campus`);
  const cMap = {}; counts.forEach(c => { cMap[c.campus] = c; });
  res.send(page(req, tr(req, 'campuses'), `<div class="top-pill-banner">🏛️ ${h(tr(req, 'campuses'))}</div>
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(270px,1fr)); gap:14px;">
      ${Object.keys(CAMPUS).map(k => { const c = CAMPUS[k], d = cMap[k] || { total: 0, official: 0 };
        return `<div class="glass-card" style="margin:0"><span class="badge registered">${c.c} CAMPUS</span><h3 style="margin:8px 0 4px;">${c.n}</h3><p style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">📍 ${c.loc}</p><p style="font-size:13px; margin-bottom:10px;">${c.colleges}</p><div style="display:flex; gap:18px;"><div><b style="font-size:1.3rem; color:var(--primary)">${d.total}</b><br><small>Total</small></div><div><b style="font-size:1.3rem; color:#10b981">${d.official}</b><br><small>Official</small></div></div></div>`;
      }).join('')}
    </div>`));
});

// ---------- STUDENT DASHBOARD (Items 1-4 + Vibrant Hub UI) ----------
app.get('/student-dashboard', needMember, async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]);
  if (!m) return res.redirect('/logout');

  const [em] = await q(`SELECT * FROM posts WHERE type='announcement' AND is_emergency=1 AND (campus='all' OR campus=$1) ORDER BY id DESC LIMIT 1`, [m.campus]);
  const [nextEv] = await q(`SELECT * FROM posts WHERE type='event' AND (campus='all' OR campus=$1) ORDER BY id DESC LIMIT 1`, [m.campus]);
  const [annCnt] = await q(`SELECT COUNT(*)::int c FROM posts WHERE type='announcement'`);
  const [evCnt] = await q(`SELECT COUNT(*)::int c FROM posts WHERE type='event'`);
  const electionActive = await isElectionOn();
  const [pollCnt] = electionActive ? await q(`SELECT COUNT(*)::int c FROM polls WHERE status='open' AND (campus='all' OR campus=$1)`, [m.campus]) : [{ c: 0 }];
  const [certCnt] = await q(`SELECT COUNT(*)::int c FROM certificates WHERE member_no=$1`, [m.member_no]);
  const [forumCnt] = await q(`SELECT COUNT(*)::int c FROM forum_posts`);

  let joinedNextEv = false, nextEvRsvps = 0;
  if (nextEv) {
    joinedNextEv = (await q(`SELECT 1 FROM event_rsvps WHERE post_id=$1 AND member_no=$2`, [nextEv.id, m.member_no])).length > 0;
    nextEvRsvps = (await q(`SELECT COUNT(*)::int c FROM event_rsvps WHERE post_id=$1`, [nextEv.id]))[0].c;
  }

  const base = 'https://' + req.headers.host + '/verify/' + encodeURIComponent(m.member_no);
  const ethToday = toEthiopianDate(new Date(), L(req));
  const ethRenewal = toEthiopianDate(m.renewal_date || new Date(), L(req));
  const avatarSrc = m.photo_id ? `/photo/${m.photo_id}` : `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23ede9fe'/%3E%3Ctext x='50' y='62' font-size='44' text-anchor='middle'%3E👤%3C/text%3E%3C/svg%3E`;

  const sealSvg = `<svg class="id-seal" width="84" height="84" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="45" fill="none" stroke="#7c3aed" stroke-width="3" stroke-dasharray="4 2"/>
    <circle cx="50" cy="50" r="35" fill="none" stroke="#ec4899" stroke-width="1.5"/>
    <text x="50" y="48" font-size="9.5" font-weight="800" text-anchor="middle" fill="#7c3aed">SIIKKOO-MANDOO</text>
    <text x="50" y="61" font-size="8" font-weight="700" text-anchor="middle" fill="#ec4899">MWU OFFICIAL</text>
  </svg>`;

  const tiles = [
    { href: '/portal/announcements', cls: 'purple', ico: '📢', t: 'Announcements', sub: 'ማስታወቂያ', n: annCnt.c },
    { href: '/portal/payments', cls: 'green', ico: '💳', t: 'Pay & Receipt', sub: 'መዋጮ ክፍያ', n: 0 },
    { href: '/portal/lost-found', cls: 'orange', ico: '🔍', t: 'Lost & Found', sub: 'የጠፉ ዕቃዎች', n: 0 },
    { href: '/portal/freshman-guide', cls: 'sky', ico: '🎓', t: 'Freshman Guide', sub: 'አዲስ ገቢዎች', n: 0 },
    { href: '/portal/attendance', cls: 'pink', ico: '📱', t: 'QR Attendance', sub: 'ስብሰባ ቅኝት', n: 0 },
    { href: '/portal/alumni', cls: 'indigo', ico: '🌟', t: 'Alumni Network', sub: 'ምሩቃን መረብ', n: 0 },
    { href: '/portal/suggestions', cls: 'teal', ico: '📮', t: 'Suggestion Box', sub: 'ምስጢር ሳጥን', n: 0 },
    { href: '/portal/media-hub', cls: 'red', ico: '📺', t: 'Heritage Media', sub: 'ባህልና ሚዲያ', n: 0 },
    { href: '/portal/events', cls: 'orange', ico: '📅', t: 'Events', sub: 'ፕሮግራሞች', n: evCnt.c },
    ...(electionActive ? [{ href: '/portal/polls', cls: 'pink', ico: '🗳️', t: 'Polls & Vote', sub: 'ምርጫ / ድምጽ', n: pollCnt.c }] : []),
    { href: '/portal/certificates', cls: 'green', ico: '🏅', t: 'Certificates', sub: 'ሰርተፍኬት', n: certCnt.c },
    { href: '/portal/forum', cls: 'blue', ico: '💡', t: 'Q&A Forum', sub: 'መወያያ', n: forumCnt.c }
  ];

  const html = `
    <!-- 4a. Emergency Alert Banner -->
    ${em ? `<a href="/portal/announcements" class="top-pill-banner emergency">🚨 EMERGENCY: ${h(postT(req, em, 'title'))} →</a>`
         : `<a href="/portal/announcements" class="top-pill-banner">🌳 ${h(tr(req, 'site'))} · Student Digital Hub</a>`}

    <!-- 1. Personal Welcome Hero Banner -->
    <div class="welcome-hero">
      <img class="welcome-avatar" src="${avatarSrc}" alt="">
      <div class="welcome-info">
        <h2>ሰላም / Akkam, ${h(m.name.split(' ')[0])}! 👋</h2>
        <p>${h(campusName(req, m.campus))} · ${h(m.department)} (Year ${h(m.year)})</p>
        <div class="welcome-pills">
          <span class="w-pill">🪪 ${h(m.member_no)}</span>
          <span class="w-pill">${m.status === 'official' ? '✅ Official Member' : '⏳ ' + h(m.status)}</span>
          <span class="w-pill">📅 ${h(ethToday)}</span>
        </div>
      </div>
    </div>

    <!-- Search Bar -->
    <form class="search-bar" method="GET" action="/portal/search">
      <input name="q" placeholder="🔍 Search announcements, events, education, forum..." required>
      <button class="btn" style="padding:7px 16px;">Search</button>
    </form>

    <!-- 2. App-Style 3D Hub Card (Exact Match to Reference Screenshot!) -->
    <div class="glass-card">
      <div class="hub-header">🐾 🌳 <span>Student Portal Hub · የተማሪዎች ማዕከል</span></div>
      <div class="hub-grid">
        ${tiles.map(t => `
          <a href="${t.href}" class="hub-tile ${t.cls}">
            ${t.n > 0 ? `<span class="notif-badge">${t.n}</span>` : ''}
            <div class="hub-ico-circle">${t.ico}</div>
            <div class="t-main">${t.t}</div>
            <div class="t-sub">${t.sub}</div>
          </a>
        `).join('')}
      </div>

      <!-- 4b. Next Event Countdown Card -->
      ${nextEv ? `
        <div class="event-highlight">
          <div>
            <span class="badge pending" data-countdown="${h(nextEv.event_date || '')}">📅 ${h(nextEv.event_date || 'Upcoming')}</span>
            <h4 style="margin:6px 0 2px; font-size:1rem;">${h(postT(req, nextEv, 'title'))}</h4>
            <small style="color:var(--text-muted);">${h(postT(req, nextEv, 'body')).slice(0, 90)}...</small>
          </div>
          <form method="POST" action="/portal/events/${nextEv.id}/rsvp">
            <button class="btn ${joinedNextEv ? 'g' : ''}" style="padding:9px 16px; font-size:12.5px;">
              ${joinedNextEv ? '✔ Going' : '✋ I will attend'} (${nextEvRsvps})
            </button>
          </form>
        </div>
      ` : ''}
    </div>

    <!-- 3. 3D Flip Digital ID Card (Tap to Flip Front & Back) -->
    <div class="glass-card">
      <div class="hub-header">🪪 <span>Digital Membership Card · ካርዱን ሲነኩ ይገለበጣል (Tap to Flip)</span></div>
      <div id="flipCard" class="flip-wrap" onclick="this.classList.toggle('flipped')">
        <div class="flip-inner">
          <!-- FRONT -->
          <div id="idCardBox" class="flip-face">
            <div class="id-hd">
              <span>🌳 ${h(tr(req, 'site'))}</span>
              <span class="badge ${m.status}">${h(tr(req, m.status))}</span>
            </div>
            <div class="id-bd">
              ${sealSvg}
              <img crossorigin="anonymous" src="${avatarSrc}" alt="">
              <div>
                <b style="font-size:16px; color:#0f172a; font-weight:850">${h(m.name)}</b><br>
                <small style="color:#64748b; font-size:11px">${h(tr(req, 'no'))}</small><br>
                <b style="color:#7c3aed; font-size:14.5px;">${h(m.member_no)}</b><br>
                <small style="color:#475569; font-weight:650; font-size:11.5px">${h(campusName(req, m.campus))} · ${h(m.department)} · Y${h(m.year)}</small><br>
                <small style="color:#64748b; font-size:11px">📍 ${h(m.zone_woreda || 'Bale')}</small>
              </div>
            </div>
            <div style="padding:10px 16px 14px; display:flex; justify-content:space-between; align-items:flex-end; border-top:1px solid #f1f5f9;">
              <div>
                <small style="font-weight:700; color:#64748b; font-size:11px">Student ID: <span style="color:#0f172a">${h(m.student_id)}</span></small><br>
                <small style="color:#0d9488; font-weight:750; font-size:11px">📅 ${h(ethRenewal)}</small>
              </div>
              <div id="qrFront" style="background:#fff; padding:3px; border-radius:8px; border:1px solid #e2e8f0;"></div>
            </div>
          </div>

          <!-- BACK -->
          <div class="flip-face flip-back">
            <div class="id-hd" style="background:linear-gradient(90deg, #1e293b 0%, #4c1d95 100%);">
              <span>MWU · SIIKKOO-MANDOO</span>
              <span>BACK SIDE</span>
            </div>
            <div style="padding:14px 18px; display:flex; align-items:center; justify-content:space-between; gap:14px;">
              <div style="font-size:12px; color:#334155; line-height:1.55;">
                <b style="color:#6d28d9; font-size:13px;">"Tokkummaa, Barnoota fi Aadaa"</b><br>
                <span>"አንድነት፣ ትምህርት እና ባህል"</span><br><br>
                <span>✔ Scan QR to verify official membership.</span><br>
                <span>📞 MWU Main Campus (Robe)</span><br>
                <span>✈️ @siikkoomandoomwu</span>
              </div>
              <div id="qrBack" style="background:#fff; padding:6px; border-radius:10px; border:2px solid #c084fc; flex-shrink:0;"></div>
            </div>
            <div style="padding:8px 16px; background:#f3e8ff; font-size:11px; text-align:center; color:#6d28d9; font-weight:700;">
              Tap card again to flip back to front ↻
            </div>
          </div>
        </div>
      </div>

      <div style="text-align:center; margin-top:16px; display:flex; justify-content:center; gap:9px; flex-wrap:wrap;">
        <button onclick="downloadID()" class="btn g">📥 Download ID (PNG)</button>
        <button onclick="document.getElementById('flipCard').classList.toggle('flipped')" class="btn secondary">🔄 Flip Card</button>
        <button onclick="print()" class="btn secondary">🖨️ ${h(tr(req, 'print'))}</button>
        ${m.status === 'registered' ? `<form method="POST" action="/student/upgrade" style="display:inline"><button class="btn">${h(tr(req, 'upgrade'))}</button></form>` : ''}
        <form method="POST" action="/student/renew" style="display:inline"><button class="btn secondary">✨ ${h(tr(req, 'renew'))}</button></form>
      </div>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    <script>
      new QRCode(document.getElementById('qrFront'),{text:${JSON.stringify(base)},width:56,height:56,colorDark:"#0f172a",colorLight:"#ffffff"});
      new QRCode(document.getElementById('qrBack'),{text:${JSON.stringify(base)},width:96,height:96,colorDark:"#4c1d95",colorLight:"#ffffff"});
      function downloadID(){
        const fc = document.getElementById('flipCard');
        fc.classList.remove('flipped');
        setTimeout(()=>{
          html2canvas(document.getElementById('idCardBox'), { scale: 2, useCORS: true }).then(c => {
            const a = document.createElement('a'); a.download = ${JSON.stringify(m.member_no + '-ID.png')}; a.href = c.toDataURL('image/png'); a.click();
          });
        }, 120);
      }
      document.querySelectorAll('[data-countdown]').forEach(el=>{
        const d=new Date(el.getAttribute('data-countdown'));
        if(isNaN(d.getTime()))return;
        const diff=Math.ceil((d-new Date())/86400000);
        if(diff>0) el.textContent='⏳ '+diff+' days left ('+el.getAttribute('data-countdown')+')';
        else if(diff===0) el.textContent='🔥 Happening Today!';
      });
    </script>
  `;
  res.send(page(req, tr(req, 'dash'), html));
});

app.post('/student/upgrade', needMember, async (req, res) => { await q(`UPDATE members SET status='pending' WHERE member_no=$1 AND status='registered'`, [req.session.mid]); res.redirect('/student-dashboard?ok=1'); });
app.post('/student/renew', needMember, async (req, res) => { await q(`UPDATE members SET renewal_date=NOW() WHERE member_no=$1`, [req.session.mid]); res.redirect('/student-dashboard?ok=1'); });

// ---------- MEMBER PROFILE, POLLS, CERTIFICATES, FORUM, SEARCH ----------
app.get('/portal/profile', needMember, async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]);
  if (!m) return res.redirect('/logout');
  res.send(page(req, 'Profile Settings', portalMenu('/portal/profile') + `<div class="glass-card" style="max-width:720px;margin:0 auto;">
    <div class="hub-header">⚙️ <span>My Profile Settings · የግል መረጃ</span></div>
    ${req.query.pwerr ? `<div class="err">Current password incorrect or new password too short (min 6 chars).</div>` : ''}
    <form method="POST" action="/portal/profile" enctype="multipart/form-data">
      <div class="form-section" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:8px 14px;">
        <div><label>Phone</label><input name="phone" required value="${h(m.phone)}"></div>
        <div><label>Email</label><input name="email" type="email" value="${h(m.email || '')}"></div>
        <div><label>Telegram Username</label><input name="telegram_handle" value="${h(m.telegram_handle || '')}"></div>
        <div><label>Academic Year</label><select name="year">${[1,2,3,4,5,6].map(y => `<option value="${y}"${String(m.year)===String(y)?' selected':''}>Year ${y}</option>`).join('')}</select></div>
        <div><label>Zone / Woreda</label><input name="zone_woreda" value="${h(m.zone_woreda || '')}"></div>
        <div><label>Update Photo</label><input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></div>
      </div>
      <button class="btn">💾 Update Profile</button>
    </form>
    <hr style="margin:22px 0; border:none; border-top:1.5px dashed var(--card-dash);">
    <h4 style="margin-bottom:8px;">🔐 Change Password</h4>
    <form method="POST" action="/portal/profile/password">
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px;">
        <div><label>Current Password</label><input name="old_pass" type="password" required></div>
        <div><label>New Password (Min 6)</label><input name="new_pass" type="password" minlength="6" required></div>
      </div>
      <p style="margin-top:12px;"><button class="btn secondary">🔑 Update Password</button></p>
    </form>
  </div>`));
});

app.post('/portal/profile', needMember, upload.single('photo'), async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]); if (!m) return res.redirect('/logout');
  let pid = m.photo_id;
  if (req.file && /^image\/(jpeg|png|webp)$/.test(req.file.mimetype)) pid = (await q(`INSERT INTO files (mime,data,name) VALUES ($1,$2,$3) RETURNING id`, [req.file.mimetype, req.file.buffer, 'profile-photo']))[0].id;
  const b = req.body;
  await q(`UPDATE members SET phone=$1, email=$2, telegram_handle=$3, year=$4, zone_woreda=$5, photo_id=$6 WHERE member_no=$7`, [String(b.phone || m.phone).slice(0, 30), String(b.email || '').slice(0, 80), String(b.telegram_handle || '').slice(0, 50), String(b.year || m.year), String(b.zone_woreda || '').slice(0, 100), pid, req.session.mid]);
  res.redirect('/portal/profile?saved=1');
});

app.post('/portal/profile/password', needMember, async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]);
  if (!m || !bcrypt.compareSync(String(req.body.old_pass || ''), m.password) || String(req.body.new_pass || '').length < 6) return res.redirect('/portal/profile?pwerr=1');
  await q(`UPDATE members SET password=$1 WHERE member_no=$2`, [bcrypt.hashSync(String(req.body.new_pass), 10), req.session.mid]);
  res.redirect('/portal/profile?saved=1');
});

app.get('/portal/polls', needMember, async (req, res) => {
  const electionActive = await isElectionOn();
  if (!electionActive) {
    return res.send(page(req, 'Elections & Polls', portalMenu('/portal/polls') + `
      <div class="glass-card" style="text-align:center; padding:46px 22px;">
        <div style="font-size:48px; margin-bottom:10px;">🔒</div>
        <h3 style="margin-bottom:6px;">Election Portal is Currently OFF</h3>
        <p style="color:var(--text-muted); font-size:13.5px;">የምርጫ ፖርታሉ በአሁኑ ሰዓት በአስተዳደሩ ተዘግቷል። ምርጫ ሲጀመር እዚህ ይከፈታል።</p>
      </div>
    `));
  }

  const polls = await q(`SELECT * FROM polls WHERE campus='all' OR campus=$1 ORDER BY (status='open') DESC, id DESC LIMIT 20`, [req.session.campus || 'robe']);
  const votes = await q(`SELECT poll_id, choice, COUNT(*)::int c FROM poll_votes GROUP BY poll_id, choice`);
  const myRows = await q(`SELECT poll_id, choice FROM poll_votes WHERE member_no=$1`, [req.session.mid]);
  const myVotesMap = {};
  myRows.forEach(r => { if (!myVotesMap[r.poll_id]) myVotesMap[r.poll_id] = []; myVotesMap[r.poll_id].push(r.choice); });

  // Load all candidate member details referenced across polls
  const allCandNos = [...new Set(polls.flatMap(p => String(p.candidate_nos || '').split(',').map(x => x.trim()).filter(Boolean)))];
  const candMembers = allCandNos.length ? await q(`SELECT member_no, name, campus, college, department, year, zone_woreda, photo_id FROM members WHERE member_no = ANY($1)`, [allCandNos]) : [];
  const candMap = Object.fromEntries(candMembers.map(m => [m.member_no, m]));

  res.send(page(req, 'Elections & Polls', portalMenu('/portal/polls') + `
    <div class="top-pill-banner">🗳️ Online Elections & Candidate Voting · የኦንላይን ምርጫ</div>
    ${polls.map(p => {
      const cNos = String(p.candidate_nos || '').split(',').map(x => x.trim()).filter(Boolean);
      const legacyOpts = String(p.options || '').split(/\r?\n|,/).map(x => x.trim()).filter(Boolean);
      const maxC = Math.max(1, parseInt(p.max_choices, 10) || 5);
      const pVotes = votes.filter(v => v.poll_id === p.id);
      const totalVotes = pVotes.reduce((s, v) => s + v.c, 0);
      const myChoices = myVotesMap[p.id] || [];
      const hasVoted = myChoices.length > 0;

      // Build unified candidate items (either registered member candidates or legacy text options)
      const candidates = cNos.length
        ? cNos.map(no => {
            const cm = candMap[no];
            return cm ? { key: no, member: cm, label: cm.name } : { key: no, member: null, label: no };
          })
        : legacyOpts.map(o => ({ key: o, member: null, label: o }));

      return `<div class="glass-card">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:6px;">
          <h3 style="font-size:1.15rem; font-weight:850;">${h(p.title)}</h3>
          <div style="display:flex; gap:6px; align-items:center;">
            <span class="badge registered">Max ${maxC} ${maxC === 1 ? 'Choice' : 'Choices'}</span>
            <span class="badge ${p.status === 'open' ? 'official' : 'rejected'}">${p.status === 'open' ? '🟢 Election Open' : '🔒 Election Closed'}</span>
          </div>
        </div>
        ${p.description ? `<p style="font-size:13.5px; color:var(--text-2); margin-bottom:14px;">${h(p.description)}</p>` : ''}

        ${(!hasVoted && p.status === 'open') ? `
          <div style="background:rgba(124,58,237,0.08); border:1.5px dashed var(--card-dash); padding:10px 14px; border-radius:14px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <span style="font-size:13px; font-weight:700; color:var(--primary);">👆 Select up to <b>${maxC}</b> candidates (እስከ ${maxC} ተወዳዳሪዎችን ይምረጡ)</span>
            <span id="cnt_badge_${p.id}" class="badge pending">Selected: 0 / ${maxC}</span>
          </div>

          <form method="POST" action="/portal/polls/${p.id}/vote" onsubmit="return checkPollSubmit(${p.id})">
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:12px;">
              ${candidates.map(c => {
                const cm = c.member;
                const photo = cm && cm.photo_id ? `/photo/${cm.photo_id}` : `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23ede9fe'/%3E%3Ctext x='50' y='62' font-size='44' text-anchor='middle'%3E👤%3C/text%3E%3C/svg%3E`;
                return `
                  <div class="cand-card" id="cc_${p.id}_${h(c.key)}" style="background:var(--surface-solid); border:2px solid var(--border); border-radius:18px; padding:14px; display:flex; flex-direction:column; justify-content:space-between; gap:10px; transition:0.2s;">
                    <div style="display:flex; gap:12px; align-items:center;">
                      <img src="${photo}" style="width:68px; height:82px; border-radius:12px; object-fit:cover; border:2px solid #c084fc; flex-shrink:0;" alt="">
                      <div style="font-size:12px; line-height:1.45;">
                        <b style="font-size:14.5px; color:var(--text); display:block; margin-bottom:2px;">${h(c.label)}</b>
                        ${cm ? `
                          <span style="color:var(--primary); font-weight:700;">🪪 ${h(cm.member_no)}</span><br>
                          <span>🏛️ ${h(campusName(req, cm.campus))}</span><br>
                          <span>🎓 ${h(cm.college || '')} · ${h(cm.department)} (Y${h(cm.year)})</span><br>
                          <span>📍 ${h(cm.zone_woreda || '-')}</span>
                        ` : `<span style="color:var(--text-muted);">Official Candidate</span>`}
                      </div>
                    </div>
                    <input type="checkbox" name="choices" value="${h(c.key)}" class="chk_${p.id}" style="display:none;">
                    <button type="button" onclick="toggleCand(this, ${p.id}, ${maxC})" class="btn secondary" style="width:100%; padding:9px 14px; font-size:13px;">
                      ⬜ Choose Candidate
                    </button>
                  </div>
                `;
              }).join('')}
            </div>
            <p style="margin-top:16px; text-align:center;">
              <button type="submit" class="btn g" style="padding:13px 28px; font-size:15px;">🗳️ Submit My Votes (ድምፄን አረጋግጥ)</button>
            </p>
          </form>
        ` : `
          <div style="margin-top:10px;">
            ${p.status === 'closed' ? `<div class="err" style="margin-bottom:12px;">🔒 Voting for this election has ended (ምርጫው ተጠናቋል).</div>` : `<div class="msgok" style="margin-bottom:12px;">✅ You have already cast your vote in this election!</div>`}
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px;">
              ${candidates.map(c => {
                const cm = c.member;
                const cnt = (pVotes.find(v => v.choice === c.key) || { c: 0 }).c;
                const pct = totalVotes ? Math.round((cnt / totalVotes) * 100) : 0;
                const isMine = myChoices.includes(c.key);
                const photo = cm && cm.photo_id ? `/photo/${cm.photo_id}` : `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23ede9fe'/%3E%3Ctext x='50' y='62' font-size='44' text-anchor='middle'%3E👤%3C/text%3E%3C/svg%3E`;
                return `
                  <div style="background:var(--surface-soft); border:${isMine ? '2px solid #10b981' : '1.5px solid var(--border)'}; border-radius:16px; padding:12px;">
                    <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px;">
                      <img src="${photo}" style="width:52px; height:62px; border-radius:10px; object-fit:cover; border:1.5px solid #c084fc;" alt="">
                      <div style="font-size:12px; flex:1;">
                        <b style="font-size:14px;">${h(c.label)}</b> ${isMine ? '<span class="badge official">✅ Your Choice</span>' : ''}<br>
                        ${cm ? `<small style="color:var(--text-muted)">${h(campusName(req, cm.campus))} · ${h(cm.department)} · Y${h(cm.year)}</small>` : ''}
                      </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:12.5px; font-weight:750;">
                      <span>Votes: ${cnt}</span><span>${pct}%</span>
                    </div>
                    <div class="poll-bar-bg"><div class="poll-bar-fill" style="width:${pct}%"></div></div>
                  </div>
                `;
              }).join('')}
            </div>
            <p style="margin-top:10px; font-size:12.5px; color:var(--text-muted); font-weight:700;">Total Votes Cast: ${totalVotes}</p>
          </div>
        `}
      </div>`;
    }).join('') || `<div class="glass-card" style="text-align:center; padding:40px;">No active elections yet.</div>`}
    <script>
      function toggleCand(btn, pollId, maxC){
        const card = btn.closest('.cand-card');
        const chk = card.querySelector('input[type="checkbox"]');
        const allChecked = document.querySelectorAll('.chk_' + pollId + ':checked').length;
        if (!chk.checked) {
          if (allChecked >= maxC) {
            alert('You can select a maximum of ' + maxC + ' candidates! (እስከ ' + maxC + ' ሰው ብቻ መምረጥ ይችላሉ)');
            return;
          }
          chk.checked = true;
          card.style.borderColor = '#10b981';
          card.style.background = 'rgba(16,185,129,0.08)';
          btn.className = 'btn g';
          btn.innerHTML = '✅ Chosen (ተመርጧል)';
        } else {
          chk.checked = false;
          card.style.borderColor = 'var(--border)';
          card.style.background = 'var(--surface-solid)';
          btn.className = 'btn secondary';
          btn.innerHTML = '⬜ Choose Candidate';
        }
        const nowCnt = document.querySelectorAll('.chk_' + pollId + ':checked').length;
        const badge = document.getElementById('cnt_badge_' + pollId);
        if (badge) badge.textContent = 'Selected: ' + nowCnt + ' / ' + maxC;
      }
      function checkPollSubmit(pollId){
        const cnt = document.querySelectorAll('.chk_' + pollId + ':checked').length;
        if (cnt < 1) { alert('Please choose at least 1 candidate first.'); return false; }
        return true;
      }
    </script>
  `));
});

app.post('/portal/polls/:id/vote', needMember, async (req, res) => {
  if (!(await isElectionOn())) return res.redirect('/portal/polls');
  const pid = parseInt(req.params.id, 10) || 0;
  const [p] = await q(`SELECT * FROM polls WHERE id=$1 AND status='open'`, [pid]);
  if (!p) return res.redirect('/portal/polls');

  const maxC = Math.max(1, parseInt(p.max_choices, 10) || 5);
  let rawChoices = req.body.choices || req.body.choice || [];
  if (!Array.isArray(rawChoices)) rawChoices = [rawChoices];
  const uniqueChoices = [...new Set(rawChoices.map(x => String(x || '').trim()).filter(Boolean))].slice(0, maxC);

  const already = await q(`SELECT 1 FROM poll_votes WHERE poll_id=$1 AND member_no=$2`, [pid, req.session.mid]);
  if (!already.length && uniqueChoices.length) {
    for (const ch of uniqueChoices) {
      try {
        await q(`INSERT INTO poll_votes (poll_id, member_no, choice) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [pid, req.session.mid, ch]);
      } catch (e) {}
    }
  }
  res.redirect('/portal/polls?voted=1');
});

app.get('/portal/certificates', needMember, async (req, res) => {
  const certs = await q(`SELECT * FROM certificates WHERE member_no=$1 ORDER BY id DESC`, [req.session.mid]);
  res.send(page(req, 'Certificates', portalMenu('/portal/certificates') + `<div class="top-pill-banner">🏅 My Official Digital Certificates</div>
    ${certs.map(c => {
      const verifyUrl = 'https://' + req.headers.host + '/verify-cert/' + encodeURIComponent(c.cert_code);
      return `<div id="cert_${c.id}" class="cert-box"><div style="font-size:36px;">🌳</div><p style="font-size:12px;font-weight:800;color:#7c3aed;letter-spacing:1.4px;">SIIKKOO-MANDOO STUDENTS ASSOCIATION · MWU</p><h2>${h(c.title)}</h2><p style="font-size:13.5px;color:#475569;margin-top:8px;">Presented to</p><div class="cert-name">${h(c.member_name)}</div><p style="font-size:14px;color:#334155;max-width:520px;margin:8px auto 16px;">${h(c.role_award)}</p><div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e2e8f0;padding-top:12px;"><div style="text-align:left;font-size:12px;"><b>Date:</b> ${h(c.issue_date)} (${toEthiopianDate(c.issue_date, L(req))})<br><b>Code:</b> <span style="color:#7c3aed;font-weight:700;">${h(c.cert_code)}</span></div><div id="cqr_${c.id}" data-url="${h(verifyUrl)}" style="background:#fff;padding:4px;border-radius:8px;border:1px solid #e2e8f0;"></div></div></div><div style="text-align:center;margin-bottom:20px;"><button onclick="dlCert('cert_${c.id}','${h(c.cert_code)}')" class="btn g">📥 Download Certificate (PNG)</button></div>`;
    }).join('') || `<div class="glass-card" style="text-align:center;padding:40px;">No certificates issued yet.</div>`}
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script><script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    <script>document.querySelectorAll('[id^="cqr_"]').forEach(el=>new QRCode(el,{text:el.getAttribute('data-url'),width:56,height:56}));function dlCert(id,code){html2canvas(document.getElementById(id),{scale:2,useCORS:true}).then(c=>{const a=document.createElement('a');a.download=code+'.png';a.href=c.toDataURL('image/png');a.click();});}</script>`));
});

app.get('/verify-cert/:code', async (req, res) => {
  const [c] = await q(`SELECT * FROM certificates WHERE UPPER(cert_code)=UPPER($1)`, [req.params.code]);
  res.send(page(req, 'Verify Certificate', c ? `<div class="glass-card" style="max-width:440px;margin:28px auto;text-align:center;"><h2 style="color:#10b981;">✔ Authentic Certificate</h2><h3 style="margin:10px 0 4px;">${h(c.member_name)}</h3><p style="color:var(--primary);font-weight:700;">${h(c.title)}</p><p style="font-size:13.5px;margin:8px 0;">${h(c.role_award)}</p><small>Code: ${h(c.cert_code)} · ${h(c.issue_date)}</small></div>` : `<div class="glass-card" style="max-width:380px;margin:28px auto;text-align:center;"><h2 style="color:#ef4444;">✘ Not Found</h2></div>`));
});

app.get('/portal/forum', needMember, async (req, res) => {
  const posts = await q(`SELECT * FROM forum_posts ORDER BY id DESC LIMIT 30`), replies = await q(`SELECT * FROM forum_replies ORDER BY id ASC`);
  res.send(page(req, 'Q&A Forum', portalMenu('/portal/forum') + `<div class="glass-card">
    <div class="hub-header">💡 <span>Student Q&A Forum · የተማሪዎች መወያያ</span></div>
    <form method="POST" action="/portal/forum"><div style="display:grid;grid-template-columns:2fr 1fr;gap:8px;"><input name="title" required placeholder="Ask a question..."><select name="category"><option value="academic">📚 Academic</option><option value="freshman">🎓 Freshman</option><option value="exams">📝 Exams</option><option value="campus">🏛️ Campus</option></select></div><textarea name="body" required placeholder="Details..." style="margin-top:8px;"></textarea><p style="margin-top:10px;"><button class="btn">Post Question</button></p></form>
  </div>${posts.map(p => {
    const pr = replies.filter(r => r.post_id === p.id);
    return `<div class="glass-card"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;"><span class="badge registered">${h(p.category)}</span><small style="color:var(--text-muted)">By <b>${h(p.author_name)}</b> · ${toEthiopianDate(p.created_at, L(req))}</small></div><h4 style="margin:8px 0 5px;">${h(p.title)}</h4><p style="font-size:13.5px;color:var(--text-2);">${h(p.body).replace(/\n/g, '<br>')}</p><div style="margin-top:12px;padding-left:12px;border-left:3px solid var(--card-dash);">${pr.map(r => `<div style="margin-bottom:7px;font-size:13px;"><b>${h(r.author_name)}:</b> ${h(r.body)}</div>`).join('')}<form method="POST" action="/portal/forum/${p.id}/reply" style="display:flex;gap:8px;margin-top:8px;"><input name="body" required placeholder="Reply..." style="padding:7px 12px;"><button class="btn secondary" style="padding:7px 14px;">Reply</button></form></div></div>`;
  }).join('') || '<div class="glass-card" style="text-align:center;">No discussions yet.</div>'}`));
});

app.post('/portal/forum', needMember, async (req, res) => {
  const [m] = await q(`SELECT name, campus FROM members WHERE member_no=$1`, [req.session.mid]);
  if (m && req.body.title && req.body.body) await q(`INSERT INTO forum_posts (member_no, author_name, campus, category, title, body) VALUES ($1,$2,$3,$4,$5,$6)`, [req.session.mid, m.name, m.campus, req.body.category || 'general', req.body.title.slice(0, 180), req.body.body.slice(0, 2000)]);
  res.redirect('/portal/forum?ok=1');
});
app.post('/portal/forum/:id/reply', needMember, async (req, res) => {
  const [m] = await q(`SELECT name FROM members WHERE member_no=$1`, [req.session.mid]);
  if (m && req.body.body) await q(`INSERT INTO forum_replies (post_id, member_no, author_name, body) VALUES ($1,$2,$3,$4)`, [parseInt(req.params.id, 10) || 0, req.session.mid, m.name, req.body.body.slice(0, 1000)]);
  res.redirect('/portal/forum?ok=1');
});

app.get('/portal/search', needMember, async (req, res) => {
  const term = String(req.query.q || '').trim().slice(0, 60); if (!term) return res.redirect('/student-dashboard');
  const like = '%' + term + '%';
  const posts = await q(`SELECT * FROM posts WHERE title_en ILIKE $1 OR title_om ILIKE $1 OR title_am ILIKE $1 OR body_en ILIKE $1 ORDER BY id DESC LIMIT 25`, [like]);
  const forum = await q(`SELECT * FROM forum_posts WHERE title ILIKE $1 OR body ILIKE $1 ORDER BY id DESC LIMIT 15`, [like]);
  res.send(page(req, 'Search', portalMenu('') + `<div class="glass-card"><h3>🔍 Results for "${h(term)}"</h3><p style="font-size:13px;color:var(--text-muted);">${posts.length} posts · ${forum.length} forum threads</p></div>${posts.map(p => postCard(req, p)).join('')}${forum.map(f => `<div class="glass-card"><h4>💡 ${h(f.title)}</h4><p style="font-size:13px;">${h(f.body).slice(0, 200)}</p><a href="/portal/forum">Open in Forum →</a></div>`).join('')}`));
});

// ---------- PORTAL CONTENT ROUTES ----------
TYPES.forEach(tp => {
  app.get('/portal/' + SLUG[tp], needMember, async (req, res) => {
    const cf = req.query.campus || '';
    const rows = await q(cf ? `SELECT * FROM posts WHERE type=$1 AND (campus=$2 OR campus='all') ORDER BY is_emergency DESC, id DESC LIMIT 60` : `SELECT * FROM posts WHERE type=$1 ORDER BY is_emergency DESC, id DESC LIMIT 60`, cf ? [tp, cf] : [tp]);
    let rsvpCounts = {}, myRsvps = new Set();
    if (tp === 'event' && rows.length) {
      (await q(`SELECT post_id, COUNT(*)::int c FROM event_rsvps GROUP BY post_id`)).forEach(r => rsvpCounts[r.post_id] = r.c);
      (await q(`SELECT post_id FROM event_rsvps WHERE member_no=$1`, [req.session.mid])).forEach(r => myRsvps.add(r.post_id));
    }
    let content = '';
    if (tp === 'gallery') content = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">${rows.map(p => `<div class="glass-card" style="padding:10px;margin:0"><img style="width:100%;height:185px;object-fit:cover;border-radius:12px;margin-bottom:7px" src="/photo/${p.image_id}"><p style="font-weight:700;font-size:13.5px">${h(postT(req, p, 'title'))}</p></div>`).join('')}</div>`;
    else if (tp === 'event') {
      content = rows.map(p => {
        const joined = myRsvps.has(p.id), cnt = rsvpCounts[p.id] || 0;
        return postCard(req, p, `<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;"><span class="badge registered" data-countdown="${h(p.event_date || '')}">📅 ${h(p.event_date || 'Upcoming')}</span><form method="POST" action="/portal/events/${p.id}/rsvp"><button class="btn ${joined ? 'g' : 'secondary'}" style="padding:6px 14px;font-size:12px;">${joined ? '✔ Going' : '✋ I will attend'} (${cnt})</button></form></div>`);
      }).join('') + `<script>document.querySelectorAll('[data-countdown]').forEach(el=>{const d=new Date(el.getAttribute('data-countdown'));if(isNaN(d.getTime()))return;const diff=Math.ceil((d-new Date())/86400000);if(diff>0)el.textContent='⏳ '+diff+' days left ('+el.getAttribute('data-countdown')+')';else if(diff===0)el.textContent='🔥 Happening Today!';});</script>`;
    } else content = rows.map(p => postCard(req, p)).join('');
    res.send(page(req, tr(req, tp), portalMenu('/portal/' + SLUG[tp]) + (rows.length ? content : `<div class="glass-card" style="text-align:center;padding:42px">${h(tr(req, 'none'))}</div>`)));
  });
});

app.post('/portal/events/:id/rsvp', needMember, async (req, res) => {
  try { await q(`INSERT INTO event_rsvps (post_id, member_no) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [parseInt(req.params.id, 10) || 0, req.session.mid]); } catch (e) {}
  res.redirect((req.get('referer') || '/portal/events').split('?')[0] + '?rsvp=1');
});

app.get('/portal/meetings', needMember, async (req, res) => {
  const meets = await q(`SELECT * FROM meetings ORDER BY id DESC LIMIT 30`);
  res.send(page(req, tr(req, 'meetings'), portalMenu('/portal/meetings') + `<div class="glass-card"><div class="hub-header">🤝 <span>Meetings & Minutes</span></div>${meets.map(m => `<div class="form-section"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;"><h4>${h(m.title)}</h4><span class="badge registered">${h(m.meeting_date)} (${toEthiopianDate(m.meeting_date, L(req))})</span></div>${m.agenda ? `<p style="font-size:13px;margin-top:6px"><b>Agenda:</b> ${h(m.agenda)}</p>` : ''}${m.minutes ? `<p style="font-size:13px;margin-top:6px"><b>Minutes:</b> ${h(m.minutes).replace(/\n/g, '<br>')}</p>` : ''}${m.resolutions ? `<p style="font-size:13px;margin-top:6px;color:#10b981"><b>Resolutions:</b> ${h(m.resolutions)}</p>` : ''}${m.file_id ? `<p style="margin-top:8px"><a href="/photo/${m.file_id}?dl=1" class="btn secondary" style="padding:5px 12px;font-size:12px">📥 Download</a></p>` : ''}</div>`).join('') || '<p>No meetings yet.</p>'}</div>`));
});

app.get('/portal/leadership', needMember, async (req, res) => {
  const ls = await q(`SELECT * FROM leaders ORDER BY (level='central') DESC, ord, id`);
  const grp = (t, list) => list.length ? `<div class="glass-card"><div class="hub-header">👥 <span>${h(t)}</span></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">${list.map(x => `<div class="form-section" style="text-align:center;margin:0"><img style="width:82px;height:82px;border-radius:50%;object-fit:cover;border:3px solid #c084fc;" src="${x.photo_id ? '/photo/' + x.photo_id : ''}"><h4 style="margin:8px 0 2px">${h(x.name)}</h4><p style="color:var(--primary);font-size:12px;font-weight:700">${h(x.position_en || x.position_om)}</p><small>${h(x.term)}</small></div>`).join('')}</div></div>` : '';
  res.send(page(req, tr(req, 'leadership'), portalMenu('/portal/leadership') + grp('Central Executive', ls.filter(x => x.level === 'central')) + Object.keys(CAMPUS).map(k => grp(campusName(req, k), ls.filter(x => x.level !== 'central' && x.campus === k))).join('')));
});

app.get('/portal/finance', needMember, async (req, res) => {
  const rs = await q(`SELECT * FROM finance_reports WHERE approved=1 ORDER BY period DESC, id DESC LIMIT 36`);
  res.send(page(req, tr(req, 'finance'), portalMenu('/portal/finance') + (rs.map(r => `<div class="glass-card"><h4 style="margin-bottom:12px">${h(r.period)} · ${h(r.campus === 'all' ? 'All Campuses' : campusName(req, r.campus))}</h4><div class="stat-row"><div class="stat-chip"><b>${Number(r.starting_balance || 0).toLocaleString()}</b><span>Starting</span></div><div class="stat-chip"><b style="color:#10b981">${Number(r.income).toLocaleString()}</b><span>Income</span></div><div class="stat-chip"><b style="color:#ef4444">${Number(r.expense).toLocaleString()}</b><span>Expense</span></div><div class="stat-chip"><b>${(Number(r.starting_balance || 0) + Number(r.income) - Number(r.expense)).toLocaleString()}</b><span>Net ETB</span></div></div></div>`).join('') || `<div class="glass-card" style="text-align:center;padding:42px">${h(tr(req, 'none'))}</div>`)));
});

app.get('/portal/support', needMember, async (req, res) => {
  const reqs = await q(`SELECT * FROM support_requests WHERE member_no=$1 ORDER BY id DESC LIMIT 20`, [req.session.mid]);
  res.send(page(req, tr(req, 'support'), portalMenu('/portal/support') + `<div class="glass-card"><div class="hub-header">💬 <span>Support Desk</span></div><form method="POST" action="/portal/support"><label>Subject</label><input name="subject" required><label>Message</label><textarea name="message" required></textarea><p style="margin-top:12px"><button class="btn">Send Request</button></p></form></div><div class="glass-card"><h4>Your Inquiries</h4>${reqs.map(r => `<div class="form-section"><b>${h(r.subject)}</b> <span class="badge ${r.status === 'closed' ? 'official' : 'pending'}">${h(r.status)}</span><p style="font-size:13px;margin-top:4px">${h(r.message)}</p>${r.reply ? `<div class="msgok"><b>Reply:</b> ${h(r.reply)}</div>` : ''}</div>`).join('') || '<p>No inquiries yet.</p>'}</div>`));
});
app.post('/portal/support', needMember, async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]);
  if (m && req.body.subject && req.body.message) await q(`INSERT INTO support_requests (member_no, name, campus, subject, message) VALUES ($1,$2,$3,$4,$5)`, [m.member_no, m.name, m.campus, req.body.subject.slice(0, 150), req.body.message.slice(0, 3000)]);
  res.redirect('/portal/support?ok=1');
});

// ---------- PHOTO, VERIFY, LEGAL ----------

/* ==========================================================
   FEATURE ROUTES (3, 4, 5, 6, 9, 13, 14, 15)
   ========================================================== */

-- Feature 3: Payment & Receipt Upload
app.get('/portal/payments', needMember, async (req, res) => {
  const payments = await q(`SELECT * FROM member_payments WHERE member_no=$1 ORDER BY id DESC`, [req.session.mid]);
  res.send(page(req, 'Payment & Receipt', portalMenu('/portal/payments') + `
    <div class="top-pill-banner">💳 Membership Contribution & Payment Portal</div>
    <div class="glass-card">
      <h3>Submit Contribution Payment</h3>
      <p style="font-size:13px; color:var(--text-muted);">Transfer via Telebirr (*127#) or CBE Birr and upload your receipt screenshot/reference below.</p>
      <div style="background:var(--surface-soft); padding:14px; border-radius:14px; margin:10px 0; font-size:13.5px;">
        <b>🏦 CBE Account:</b> 1000000000000 (Siikkoo-Mandoo MWU)<br>
        <b>📱 Telebirr Merchant/Num:</b> 0900000000
      </div>
      <form method="POST" action="/portal/payments" enctype="multipart/form-data">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px;">
          <div><label>Amount (ETB)</label><input name="amount" type="number" step="0.01" required placeholder="50"></div>
          <div><label>Payment Method</label><select name="payment_method"><option value="telebirr">Telebirr</option><option value="cbe_birr">CBE Birr</option><option value="bank_transfer">Bank Transfer</option></select></div>
          <div><label>Transaction Reference / ID</label><input name="transaction_ref" required placeholder="e.g. TBR12345678"></div>
          <div><label>Receipt Screenshot / PDF</label><input name="receipt" type="file" accept="image/*,application/pdf" required></div>
        </div>
        <p style="margin-top:14px;"><button class="btn g">📤 Submit Payment for Verification</button></p>
      </form>
    </div>
    <div class="glass-card">
      <h4>My Payment History</h4>
      <div class="tw" style="margin-top:10px;"><table>
        <tr><th>Ref / ID</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th></tr>
        ${payments.map(p => `<tr>
          <td><b>${h(p.transaction_ref)}</b></td>
          <td>${Number(p.amount).toLocaleString()} ETB</td>
          <td>${h(p.payment_method)}</td>
          <td><span class="badge ${p.status === 'approved' ? 'official' : (p.status === 'rejected' ? 'rejected' : 'pending')}">${h(p.status)}</span></td>
          <td>${new Date(p.created_at).toLocaleDateString()}</td>
        </tr>`).join('')}
      </table></div>
    </div>
  `));
});

app.post('/portal/payments', needMember, upload.single('receipt'), async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]);
  const b = req.body, amt = parseFloat(b.amount);
  let rId = null;
  if (req.file) rId = await saveFile(req.file);
  if (m && amt > 0 && b.transaction_ref) {
    try {
      await q(`INSERT INTO member_payments (member_no, name, campus, amount, payment_method, transaction_ref, receipt_file_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [m.member_no, m.name, m.campus, amt, b.payment_method || 'telebirr', b.transaction_ref.trim(), rId]);
    } catch(e) {}
  }
  res.redirect('/portal/payments?ok=1');
});

-- Feature 4: Lost & Found Board
app.get('/portal/lost-found', needMember, async (req, res) => {
  const items = await q(`SELECT * FROM lost_found ORDER BY id DESC LIMIT 40`);
  res.send(page(req, 'Lost & Found', portalMenu('/portal/lost-found') + `
    <div class="top-pill-banner">🔍 Lost & Found Campus Board · የጠፉ እና የተገኙ ዕቃዎች</div>
    <div class="glass-card">
      <h3>Post Lost or Found Item</h3>
      <form method="POST" action="/portal/lost-found" enctype="multipart/form-data">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px;">
          <div><label>Type</label><select name="category"><option value="lost">🔴 Lost (የጠፋ)</option><option value="found">🟢 Found (የተገኘ)</option></select></div>
          <div><label>Item Title</label><input name="title" required placeholder="e.g. Student ID, National ID, Phone"></div>
          <div><label>Contact Phone</label><input name="phone" required placeholder="09..."></div>
          <div><label>Photo (Optional)</label><input name="image" type="file" accept="image/*"></div>
        </div>
        <label>Detailed Description & Location</label>
        <textarea name="description" required placeholder="Where was it lost/found? Any distinguishing features..."></textarea>
        <p style="margin-top:12px;"><button class="btn">Post to Board</button></p>
      </form>
    </div>
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px;">
      ${items.map(i => `<div class="glass-card" style="margin:0; border-left:4px solid ${i.category === 'lost' ? '#ef4444' : '#10b981'}">
        <span class="badge ${i.category === 'lost' ? 'rejected' : 'official'}">${i.category === 'lost' ? '🔴 LOST' : '🟢 FOUND'}</span>
        <h4 style="margin:6px 0 4px;">${h(i.title)}</h4>
        <small style="color:var(--text-muted)">By ${h(i.author_name)} · 📞 ${h(i.phone)}</small>
        ${i.image_id ? `<img style="width:100%; height:160px; object-fit:cover; border-radius:10px; margin:8px 0;" src="/photo/${i.image_id}">` : ''}
        <p style="font-size:13px; color:var(--text-2); margin-top:6px;">${h(i.description)}</p>
      </div>`).join('') || '<div class="glass-card" style="text-align:center;">No lost or found items reported.</div>'}
    </div>
  `));
});

app.post('/portal/lost-found', needMember, upload.single('image'), async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]);
  const b = req.body;
  let imgId = null;
  if (req.file) imgId = await saveFile(req.file);
  if (m && b.title && b.description) {
    await q(`INSERT INTO lost_found (member_no, author_name, campus, category, title, description, phone, image_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [m.member_no, m.name, m.campus, b.category || 'lost', b.title.slice(0,120), b.description.slice(0,1000), b.phone || m.phone, imgId]);
  }
  res.redirect('/portal/lost-found?ok=1');
});

-- Feature 5: Freshman Guide & Mentor Match
app.get('/portal/freshman-guide', needMember, async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]);
  const [existingMentor] = await q(`SELECT * FROM mentor_requests WHERE freshman_no=$1`, [req.session.mid]);
  res.send(page(req, 'Freshman Guide', portalMenu('/portal/freshman-guide') + `
    <div class="top-pill-banner">🎓 Freshman Survival Guide & Senior Mentor Match</div>
    <div class="glass-card">
      <h3>🏛️ Campus Life & Academic Guide for First-Year Students</h3>
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; margin-top:14px;">
        <div class="form-section" style="margin:0">
          <h4>📌 Registration & Dormitory</h4>
          <p style="font-size:13px; color:var(--text-2)">Bring your clearance, admission letter, 4 passport photos, and bedding items. Report to your assigned block proctor upon arrival.</p>
        </div>
        <div class="form-section" style="margin:0">
          <h4>🍽️ Cafeteria & ID Cards</h4>
          <p style="font-size:13px; color:var(--text-2)">Cafeteria service requires your official University ID card and biometric/paper meal ticket. Maintain discipline during rush hours.</p>
        </div>
        <div class="form-section" style="margin:0">
          <h4>📚 Library & Tutorials</h4>
          <p style="font-size:13px; color:var(--text-2)">MWU main and campus libraries are open daily. Siikkoo-Mandoo organizes peer tutorials and mentorship for difficult freshman courses.</p>
        </div>
      </div>
    </div>
    <div class="glass-card">
      <h3>🤝 Request a Senior Student Mentor</h3>
      ${existingMentor ? `
        <div class="msgok">✔ Your mentor request is submitted! Status: <b>${h(existingMentor.status)}</b>. Senior mentors will reach out to you soon.</div>
      ` : `
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:12px;">Get paired with an upperclassman in your department to guide you through exams, assignments, and campus adaptation.</p>
        <form method="POST" action="/portal/mentor-request">
          <button class="btn">🤝 Request Senior Mentor Match</button>
        </form>
      `}
    </div>
  `));
});

app.post('/portal/mentor-request', needMember, async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]);
  if (m) {
    try {
      await q(`INSERT INTO mentor_requests (freshman_no, freshman_name, campus, department) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [m.member_no, m.name, m.campus, m.department]);
    } catch(e) {}
  }
  res.redirect('/portal/freshman-guide?ok=1');
});

-- Feature 6: QR Attendance Scanner
app.get('/portal/attendance', needMember, async (req, res) => {
  const sessions = await q(`SELECT * FROM attendance_sessions WHERE campus='all' OR campus=$1 ORDER BY id DESC LIMIT 20`, [req.session.campus || 'robe']);
  const myLogs = await q(`SELECT session_id FROM attendance_logs WHERE member_no=$1`, [req.session.mid]);
  const loggedSet = new Set(myLogs.map(l => l.session_id));

  res.send(page(req, 'QR Attendance', portalMenu('/portal/attendance') + `
    <div class="top-pill-banner">📱 QR Code Event & Meeting Attendance</div>
    <div class="glass-card" style="text-align:center; padding:28px;">
      <div style="font-size:42px; margin-bottom:8px;">📷</div>
      <h3>Scan Attendance Code</h3>
      <p style="font-size:13px; color:var(--text-muted); margin-bottom:14px;">Enter the meeting/event attendance code provided by your campus coordinator.</p>
      <form method="POST" action="/portal/attendance/scan" style="max-width:380px; margin:0 auto; display:flex; gap:8px;">
        <input name="code" required placeholder="Enter attendance code (e.g. SM-ATT-26)" style="text-transform:uppercase;">
        <button class="btn">Check-in</button>
      </form>
    </div>
    <div class="glass-card">
      <h4>Active Attendance Sessions</h4>
      ${sessions.map(s => {
        const checkedIn = loggedSet.has(s.id);
        return `<div class="form-section" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div>
            <h4>${h(s.title)}</h4>
            <small style="color:var(--text-muted)">Date: ${h(s.event_date || 'Today')} · Code: <b>${h(s.code)}</b></small>
          </div>
          <div>
            ${checkedIn ? '<span class="badge official">✔ Attendance Recorded</span>' : `<form method="POST" action="/portal/attendance/scan"><input type="hidden" name="code" value="${h(s.code)}"><button class="btn g" style="padding:6px 14px; font-size:12px;">Check-in Now</button></form>`}
          </div>
        </div>`;
      }).join('') || '<p>No active attendance sessions.</p>'}
    </div>
  `));
});

app.post('/portal/attendance/scan', needMember, async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]);
  const [s] = await q(`SELECT * FROM attendance_sessions WHERE UPPER(code)=UPPER($1)`, [code]);
  if (m && s) {
    try {
      await q(`INSERT INTO attendance_logs (session_id, member_no, member_name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [s.id, m.member_no, m.name]);
    } catch(e) {}
  }
  res.redirect('/portal/attendance?ok=1');
});

-- Feature 9: Alumni Network Directory
app.get('/portal/alumni', needMember, async (req, res) => {
  const alumni = await q(`SELECT * FROM alumni ORDER BY id DESC LIMIT 50`);
  res.send(page(req, 'Alumni Network', portalMenu('/portal/alumni') + `
    <div class="top-pill-banner">🌟 Alumni Network & Graduated Members Directory</div>
    <div class="glass-card">
      <h3>Register as Graduated Alumni</h3>
      <form method="POST" action="/portal/alumni">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px;">
          <div><label>Full Name</label><input name="full_name" required placeholder="Name"></div>
          <div><label>Batch / Graduation Year</label><input name="batch_year" required placeholder="e.g. 2024"></div>
          <div><label>Department</label><input name="department" required placeholder="e.g. Statistics"></div>
          <div><label>Current Job / Role</label><input name="current_role" placeholder="e.g. Data Analyst"></div>
          <div><label>Employer / Company</label><input name="employer" placeholder="Company"></div>
          <div><label>Phone / Contact</label><input name="phone" placeholder="Phone"></div>
          <div><label>Email</label><input name="email" type="email" placeholder="Email"></div>
          <div><label>LinkedIn Profile URL</label><input name="linkedin" placeholder="LinkedIn"></div>
        </div>
        <p style="margin-top:12px;"><button class="btn">🌟 Join Alumni Directory</button></p>
      </form>
    </div>
    <div class="glass-card">
      <h3>Graduated Alumni Directory</h3>
      <div class="tw" style="margin-top:10px;"><table>
        <tr><th>Name</th><th>Batch</th><th>Department</th><th>Current Role & Employer</th><th>Contact</th></tr>
        ${alumni.map(a => `<tr>
          <td><b>${h(a.full_name)}</b></td>
          <td>${h(a.batch_year)}</td>
          <td>${h(a.department)}</td>
          <td>${h(a.current_role || '-')} @ ${h(a.employer || '-')}</td>
          <td><small>${h(a.phone || '')} ${a.linkedin ? '· <a href="' + h(a.linkedin) + '" target="_blank">LinkedIn</a>' : ''}</small></td>
        </tr>`).join('')}
      </table></div>
    </div>
  `));
});

app.post('/portal/alumni', needMember, async (req, res) => {
  const b = req.body;
  if (b.full_name && b.department) {
    try {
      await q(`INSERT INTO alumni (full_name, batch_year, department, current_role, employer, phone, email, linkedin) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [b.full_name.slice(0,80), b.batch_year||'2025', b.department.slice(0,80), b.current_role||'', b.employer||'', b.phone||'', b.email||'', b.linkedin||'']);
    } catch(e) {}
  }
  res.redirect('/portal/alumni?ok=1');
});

-- Feature 13: Anonymous Suggestion Box
app.get('/portal/suggestions', needMember, async (req, res) => {
  const suggestions = await q(`SELECT * FROM anonymous_suggestions ORDER BY id DESC LIMIT 25`);
  res.send(page(req, 'Suggestion Box', portalMenu('/portal/suggestions') + `
    <div class="top-pill-banner">📮 Anonymous Suggestion & Grievance Box · ሚስጥራዊ የአስተያየት ሳጥን</div>
    <div class="glass-card">
      <h3>Submit Anonymous Feedback</h3>
      <p style="font-size:13px; color:var(--text-muted); margin-bottom:10px;">Your identity is 100% confidential and hidden. Share your constructive suggestions, academic concerns, or union feedback.</p>
      <form method="POST" action="/portal/suggestions">
        <div style="display:grid; grid-template-columns:1fr 2fr; gap:10px;">
          <div><label>Campus</label>${sel('campus', campusOpts(null, true))}</div>
          <div><label>Category</label><select name="category"><option value="academic">Academic Quality</option><option value="cafeteria">Cafeteria & Dormitory</option><option value="union">Student Union Services</option><option value="general">General Feedback</option></select></div>
        </div>
        <label>Your Message / Suggestion</label>
        <textarea name="message" required placeholder="Write your honest suggestions here..."></textarea>
        <p style="margin-top:12px;"><button class="btn">🔒 Send Anonymously</button></p>
      </form>
    </div>
    <div class="glass-card">
      <h4>Recent Feedback & Administration Replies</h4>
      ${suggestions.map(s => `
        <div class="form-section">
          <div style="display:flex; justify-content:space-between; flex-wrap:wrap;">
            <span class="badge registered">${h(s.category)} · ${h(s.campus)}</span>
            <small style="color:var(--text-muted)">${new Date(s.created_at).toLocaleDateString()}</small>
          </div>
          <p style="font-size:13.5px; margin-top:8px;">${h(s.message)}</p>
          ${s.reply ? `<div class="msgok" style="margin-top:8px;"><b>Union Reply:</b> ${h(s.reply)}</div>` : ''}
        </div>
      `).join('') || '<p>No feedback submitted yet.</p>'}
    </div>
  `));
});

app.post('/portal/suggestions', needMember, async (req, res) => {
  const b = req.body;
  if (b.message) {
    try {
      await q(`INSERT INTO anonymous_suggestions (campus, category, message) VALUES ($1,$2,$3)`,
        [b.campus || 'all', b.category || 'general', b.message.slice(0, 2000)]);
    } catch(e) {}
  }
  res.redirect('/portal/suggestions?ok=1');
});

-- Feature 14: Heritage & YouTube Media Hub
app.get('/portal/media-hub', needMember, async (req, res) => {
  const media = await q(`SELECT * FROM media_hub ORDER BY id DESC LIMIT 30`);
  res.send(page(req, 'Heritage Media', portalMenu('/portal/media-hub') + `
    <div class="top-pill-banner">📺 Oromo Heritage & YouTube Media Hub</div>
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:16px;">
      ${media.map(m => {
        let embed = '';
        const ytMatch = m.youtube_url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
        if (ytMatch && ytMatch[1]) {
          embed = `<iframe style="width:100%; height:200px; border-radius:12px; border:none;" src="https://www.youtube.com/embed/${ytMatch[1]}" allowfullscreen></iframe>`;
        }
        return `<div class="glass-card" style="margin:0">
          <h4 style="margin-bottom:8px;">${h(m.title)}</h4>
          ${embed ? embed : `<a href="${h(m.youtube_url)}" target="_blank">🔗 Watch Video Link</a>`}
          <p style="font-size:13px; color:var(--text-2); margin-top:8px;">${h(m.description)}</p>
        </div>`;
      }).join('') || '<div class="glass-card" style="text-align:center; grid-column:1/-1;">No media videos uploaded yet.</div>'}
    </div>
  `));
});

-- Feature 15: Targeted Broadcasts & Admin Tools
app.get('/admin/broadcast', guard('content'), async (req, res) => {
  const broadcasts = await q(`SELECT * FROM targeted_broadcasts ORDER BY id DESC LIMIT 30`);
  res.send(A(req, 'Targeted Broadcast', `
    <div class="glass-card">
      <h3>📢 Send Targeted Broadcast Alert</h3>
      <form method="POST" action="/admin/broadcast">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px;">
          <div><label>Target Campus</label>${sel('campus', campusOpts(scopeOf(req), true))}</div>
          <div><label>Target Year Group</label><select name="target_year"><option value="all">All Years</option><option value="1">Year 1</option><option value="2">Year 2</option><option value="3">Year 3</option><option value="4">Year 4</option><option value="5">Year 5</option></select></div>
        </div>
        <label>Broadcast Title</label><input name="title" required placeholder="Important Notice...">
        <label>Message Content</label><textarea name="message" required placeholder="Write alert message..."></textarea>
        <p style="margin-top:12px;"><button class="btn">🚀 Broadcast Alert</button></p>
      </form>
    </div>
    <div class="glass-card">
      <h4>Broadcast History</h4>
      ${broadcasts.map(b => `<div class="form-section">
        <b>${h(b.title)}</b> · <span class="badge registered">Campus: ${h(b.target_campus)} · Year: ${h(b.target_year)}</span>
        <p style="font-size:13px; margin-top:6px;">${h(b.message)}</p>
        <small style="color:var(--text-muted)">Sent by ${h(b.created_by)} on ${new Date(b.created_at).toLocaleString()}</small>
      </div>`).join('') || '<p>No broadcasts sent yet.</p>'}
    </div>
  `));
});

app.post('/admin/broadcast', guard('content'), async (req, res) => {
  const b = req.body;
  if (b.title && b.message) {
    try {
      await q(`INSERT INTO targeted_broadcasts (title, target_campus, target_year, message, created_by) VALUES ($1,$2,$3,$4,$5)`,
        [b.title.slice(0,150), b.target_campus||'all', b.target_year||'all', b.message.slice(0,2000), req.session.sname||'Admin']);
    } catch(e) {}
  }
  res.redirect('/admin/broadcast?ok=1');
});


app.get('/photo/:id', async (req, res) => {
  const [f] = await q(`SELECT mime, data, name FROM files WHERE id=$1`, [parseInt(req.params.id, 10) || 0]); if (!f) return res.status(404).end();
  res.set('Content-Type', f.mime).set('Cache-Control', 'public,max-age=604800');
  if (req.query.dl) res.set('Content-Disposition', `attachment; filename="${String(f.name || 'file').replace(/[^\w.\-]/g, '_')}"`);
  res.send(f.data);
});
app.get('/verify/:no', async (req, res) => {
  const [m] = await q(`SELECT name,member_no,campus,department,status,photo_id FROM members WHERE UPPER(member_no)=UPPER($1)`, [req.params.no]);
  res.send(page(req, tr(req, 'verify'), m ? `<div class="glass-card" style="max-width:380px;margin:28px auto;text-align:center;"><h2 style="color:#10b981;margin-bottom:12px;">${h(tr(req, 'valid'))}</h2><img style="width:96px;height:120px;border-radius:12px;object-fit:cover;" src="${m.photo_id ? '/photo/' + m.photo_id : ''}"><h3 style="margin:10px 0 3px;">${h(m.name)}</h3><p style="color:var(--primary);font-weight:700;">${h(m.member_no)}</p><p style="font-size:12.5px;color:var(--text-muted);margin-bottom:10px;">${h(campusName(req, m.campus))} · ${h(m.department)}</p><span class="badge ${m.status}">${h(tr(req, m.status))}</span></div>` : `<div class="glass-card" style="max-width:360px;margin:28px auto;text-align:center;"><h2 style="color:#ef4444">${h(tr(req, 'invalid'))}</h2></div>`));
});
app.get('/privacy', (req, res) => res.send(page(req, tr(req, 'privacy'), `<div class="glass-card"><h2>🔒 Privacy Policy</h2><p style="margin-top:8px;">Student data is strictly used for Siikkoo-Mandoo MWU membership services.</p></div>`)));
app.get('/terms', (req, res) => res.send(page(req, tr(req, 'terms'), `<div class="glass-card"><h2>📜 Terms & Conditions</h2><p style="margin-top:8px;">Members agree to follow MWU and association bylaws.</p></div>`)));

// ---------- ADMIN PORTAL (Also Styled with Vibrant Hub Tiles & Dashed Cards!) ----------
const A = (req, title, body) => {
  const links = [
    ['/admin', '📊', 'Overview', 'ማጠቃለያ', null, 'purple'],
    ['/admin/members', '👥', 'Members', 'አባላት', 'members', 'pink'],
    ['/admin/polls', '🗳️', 'Elections', 'ምርጫ', 'polls', 'orange'],
    ['/admin/certificates', '🏅', 'Certificates', 'ሰርተፍኬት', 'certificates', 'yellow'],
    ['/admin/content/announcement', '📢', 'Announce', 'ማስታወቂያ', 'content', 'sky'],
    ['/admin/content/news', '📰', 'News', 'ዜና', 'content', 'blue'],
    ['/admin/content/event', '📅', 'Events', 'ፕሮግራም', 'content', 'green'],
    ['/admin/meetings', '🤝', 'Meetings', 'ስብሰባ', 'meetings', 'teal'],
    ['/admin/content/education', '📚', 'Education', 'ትምህርት', 'content', 'indigo'],
    ['/admin/content/gallery', '🖼️', 'Gallery', 'ፎቶዎች', 'content', 'pink'],
    ['/admin/leaders', '🎖️', 'Leaders', 'አመራሮች', 'leaders', 'orange'],
    ['/admin/finance', '💰', 'Finance', 'ፋይናንስ', 'finance', 'green'],
    ['/admin/support', '💬', 'Support', 'እገዛ', 'support', 'purple'],
    ['/admin/staff', '🔑', 'Staff', 'ሰራተኞች', 'staff', 'gray'],
    ['/admin/audit-logs', '📜', 'Audit Logs', 'ታሪክ', 'audit', 'blue'],
    ['/admin/payments', '💳', 'Payments', 'ክፍያዎች', 'finance', 'green'],
    ['/admin/suggestions', '📮', 'Suggestions', 'ምስጢር ሳጥን', 'support', 'teal'],
    ['/admin/attendance', '📱', 'Attendance', 'የስብሰባ ቅኝት', 'meetings', 'purple'],
    ['/admin/broadcast', '📢', 'Broadcast', 'መልዕክት', 'content', 'orange'],
    ['/admin/backup', '💾', 'Backup', 'ባክአፕ', 'backup', 'teal']
  ].filter(x => !x[4] || can(req, x[4]));

  const isOverview = req.path === '/admin' || req.path === '/admin/';
  return page(req, title, `
    ${staffRoleBanner(req)}
    ${isOverview ? `<div class="glass-card"><div class="hub-header">🛡️ <span>Admin Control Hub · የአስተዳደር ማዕከል</span></div><div class="hub-grid">${links.map(x => `<a href="${x[0]}" class="hub-tile ${x[5]}"><div class="hub-ico-circle">${x[1]}</div><div class="t-main">${x[2]}</div><div class="t-sub">${x[3]}</div></a>`).join('')}</div></div>`
    : `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
         <a href="/admin" class="btn secondary" style="padding:8px 16px; font-size:13px;">← Back to Admin Hub · ወደ ዋናው ሜኑ</a>
         <span class="badge registered" style="font-size:12px; padding:6px 13px;">🛡️ ${h(title)}</span>
       </div>`}
    ${body}
  `);
};

const OKMIME = /^(image\/(jpeg|png|webp)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.[\w.]+|vnd\.ms-[\w.]+))$/;
const up6 = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });
const files6 = fields => (req, res, next) => up6.fields(fields)(req, res, err => (err ? res.status(400).send('File exceeds 6 MB') : next()));
async function saveFile(f) { if (!f || !OKMIME.test(f.mimetype)) return null; return (await q(`INSERT INTO files (mime,data,name) VALUES ($1,$2,$3) RETURNING id`, [f.mimetype, f.buffer, String(f.originalname || 'file').slice(0, 100)]))[0].id; }
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const sel = (name, opts, cur) => `<select name="${name}">${opts.map(o => `<option value="${o[0]}"${cur === o[0] ? ' selected' : ''}>${h(o[1])}</option>`).join('')}</select>`;
const campusOpts = (sc, all) => (sc ? [[sc, CAMPUS[sc].n]] : (all ? [['all', 'All campuses']] : []).concat(Object.keys(CAMPUS).map(k => [k, CAMPUS[k].n])));

app.get('/admin', needStaff, async (req, res) => {
  const sc = scopeOf(req), w = sc ? ' WHERE campus=$1' : '', pr = sc ? [sc] : [];
  const [m] = await q(`SELECT COUNT(*)::int n, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END)::int p, SUM(CASE WHEN status='official' THEN 1 ELSE 0 END)::int o, SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END)::int r, SUM(CASE WHEN campus='robe' THEN 1 ELSE 0 END)::int robe, SUM(CASE WHEN campus='goba' THEN 1 ELSE 0 END)::int goba, SUM(CASE WHEN campus='shashamane' THEN 1 ELSE 0 END)::int sha FROM members${w}`, pr);
  res.send(A(req, 'Admin Dashboard', `
    <div class="stat-grid">
      <div class="stat-card"><div class="num" style="color:#7c3aed">${m.n || 0}</div><div class="label">Total</div></div>
      <div class="stat-card"><div class="num" style="color:#10b981">${m.o || 0}</div><div class="label">Official</div></div>
      <div class="stat-card"><div class="num" style="color:#f59e0b">${m.p || 0}</div><div class="label">Pending</div></div>
      <div class="stat-card"><div class="num" style="color:#ef4444">${m.r || 0}</div><div class="label">Rejected</div></div>
    </div>
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(290px, 1fr)); gap:14px;">
      <div class="glass-card"><h4>📊 Members by Campus</h4><canvas id="campusChart" height="190"></canvas></div>
      <div class="glass-card"><h4>📈 Status Breakdown</h4><canvas id="statusChart" height="190"></canvas></div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
      new Chart(document.getElementById('campusChart'), { type:'bar', data:{ labels:['Robe','Goba','Shashamane'], datasets:[{ data:[${m.robe||0},${m.goba||0},${m.sha||0}], backgroundColor:['#7c3aed','#10b981','#f59e0b'], borderRadius:10 }] }, options:{ plugins:{ legend:{ display:false } } } });
      new Chart(document.getElementById('statusChart'), { type:'doughnut', data:{ labels:['Official','Pending','Registered','Rejected'], datasets:[{ data:[${m.o||0},${m.p||0},${(m.n||0)-(m.o||0)-(m.p||0)-(m.r||0)},${m.r||0}], backgroundColor:['#10b981','#f59e0b','#7c3aed','#ef4444'] }] } });
    </script>
  `));
});

app.get('/admin/polls', guard('polls'), async (req, res) => {
  const sc = scopeOf(req);
  const polls = await q(`SELECT * FROM polls ORDER BY id DESC LIMIT 30`);
  const members = await q(`SELECT member_no, name, student_id, campus, college, department, year, zone_woreda, status, photo_id FROM members ${sc ? 'WHERE campus=$1' : ''} ORDER BY name ASC LIMIT 500`, sc ? [sc] : []);
  const electionActive = await isElectionOn();
  const voteCounts = await q(`SELECT poll_id, choice, COUNT(*)::int c FROM poll_votes GROUP BY poll_id, choice`);
  const mByNo = Object.fromEntries(members.map(m => [m.member_no, m]));

  res.send(A(req, 'Elections & Polls', `
    <!-- Master Election Portal ON / OFF Switch -->
    <div class="glass-card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; border-left:5px solid ${electionActive ? '#10b981' : '#ef4444'};">
      <div>
        <h3 style="font-size:1.1rem; font-weight:850;">🌐 Student Election Portal Visibility (የምርጫ ፖርታል መቆጣጠሪያ)</h3>
        <p style="font-size:13px; color:var(--text-muted);">Turn ON when election day starts so students can vote, and turn OFF anytime after election ends.</p>
      </div>
      <form method="POST" action="/admin/polls/portal-switch">
        <button class="btn ${electionActive ? 'g' : 'danger'}" style="padding:11px 20px; font-size:13.5px;">
          ${electionActive ? '🟢 Election Portal: ON (Click to Turn OFF)' : '🔴 Election Portal: OFF (Click to Turn ON)'}
        </button>
      </form>
    </div>

    <!-- Create Election by Selecting Registered Members as Candidates -->
    <div class="glass-card">
      <div class="hub-header">🗳️ <span>Create Election & Select Candidates · ከተመዘገቡ አባላት ተወዳዳሪዎችን ይምረጡ</span></div>
      <form method="POST" action="/admin/polls" onsubmit="return validateAdminPoll()">
        <div style="display:grid; grid-template-columns:2fr 1fr 1fr; gap:10px;">
          <div><label>Election Title *</label><input name="title" required placeholder="e.g. 2026 Executive Committee Election"></div>
          <div><label>Campus</label>${sel('campus', campusOpts(sc, true))}</div>
          <div><label>Max Votes Per Student</label><input name="max_choices" type="number" min="1" max="20" value="5" required></div>
        </div>
        <label>Description / Instructions</label>
        <input name="description" placeholder="Select up to 5 candidates for the executive committee...">

        <label style="margin-top:14px;">Select Candidates from Registered Members (ተወዳዳሪዎችን ይምረጡ):</label>
        <input type="text" id="candSearchBox" onkeyup="filterAdminCands()" placeholder="🔍 Search member by name, ID, campus, or department..." style="margin-bottom:10px;">

        <div id="adminCandList" style="max-height:360px; overflow-y:auto; display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:10px; padding:6px; background:var(--surface-soft); border-radius:16px; border:1.5px dashed var(--card-dash);">
          ${members.map(m => {
            const photo = m.photo_id ? `/photo/${m.photo_id}` : `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23ede9fe'/%3E%3Ctext x='50' y='62' font-size='44' text-anchor='middle'%3E👤%3C/text%3E%3C/svg%3E`;
            return `
              <label class="admin-cand-item" data-search="${h((m.name + ' ' + m.member_no + ' ' + m.student_id + ' ' + m.campus + ' ' + m.department).toLowerCase())}" style="display:flex; gap:10px; align-items:center; background:var(--surface-solid); padding:10px; border-radius:14px; border:1.5px solid var(--border); cursor:pointer; margin:0;">
                <input type="checkbox" name="candidate_nos" value="${h(m.member_no)}" style="width:19px; height:19px; flex-shrink:0; accent-color:#7c3aed;">
                <img src="${photo}" style="width:46px; height:56px; border-radius:9px; object-fit:cover; border:1.5px solid #c084fc; flex-shrink:0;" alt="">
                <div style="font-size:11.5px; line-height:1.35;">
                  <b style="font-size:13px; color:var(--text);">${h(m.name)}</b><br>
                  <span style="color:var(--primary); font-weight:700;">${h(m.member_no)}</span><br>
                  <span style="color:var(--text-muted);">${h(campusName(req, m.campus))} · ${h(m.department)} (Y${h(m.year)})</span>
                </div>
              </label>
            `;
          }).join('') || '<p style="padding:14px;">No registered members found yet.</p>'}
        </div>

        <p style="margin-top:14px;"><button class="btn">🚀 Launch Election</button></p>
      </form>
    </div>

    <!-- Active & Closed Elections List with Live Results -->
    <div class="glass-card">
      <div class="hub-header">📊 <span>Elections & Live Results · የምርጫ ውጤቶች</span></div>
      ${polls.map(p => {
        const cNos = String(p.candidate_nos || '').split(',').map(x => x.trim()).filter(Boolean);
        const pVotes = voteCounts.filter(v => v.poll_id === p.id);
        const total = pVotes.reduce((s, v) => s + v.c, 0);
        return `
          <div class="form-section">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
              <div>
                <b style="font-size:1.05rem;">${h(p.title)}</b>
                <span class="badge ${p.status === 'open' ? 'official' : 'rejected'}" style="margin-left:6px;">${p.status === 'open' ? '🟢 Open' : '🔒 Closed'}</span>
                <span class="badge registered" style="margin-left:4px;">Max ${p.max_choices || 5} choices · ${total} total votes</span>
              </div>
              <div style="display:flex; gap:6px;">
                <form method="POST" action="/admin/polls/${p.id}/toggle">
                  <button class="btn ${p.status === 'open' ? 'secondary' : 'g'}" style="padding:5px 12px; font-size:12px;">
                    ${p.status === 'open' ? '🔒 Close Election (ምርጫውን ዝጋ)' : '🟢 Reopen Election'}
                  </button>
                </form>
                <form method="POST" action="/admin/polls/${p.id}/delete">
                  <button class="btn danger" style="padding:5px 11px; font-size:12px;">Delete</button>
                </form>
              </div>
            </div>
            ${cNos.length ? `
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:8px; margin-top:10px;">
                ${cNos.map(no => {
                  const cm = mByNo[no];
                  const cnt = (pVotes.find(v => v.choice === no) || { c: 0 }).c;
                  const pct = total ? Math.round((cnt / total) * 100) : 0;
                  return `<div style="background:var(--surface-solid); padding:8px 10px; border-radius:11px; border:1px solid var(--border); font-size:12px;">
                    <b>${h(cm ? cm.name : no)}</b> (${cnt} votes · ${pct}%)
                    <div class="poll-bar-bg"><div class="poll-bar-fill" style="width:${pct}%"></div></div>
                  </div>`;
                }).join('')}
              </div>
            ` : ''}
          </div>
        `;
      }).join('') || '<p>No elections created yet.</p>'}
    </div>

    <script>
      function filterAdminCands(){
        const q = document.getElementById('candSearchBox').value.toLowerCase().trim();
        document.querySelectorAll('.admin-cand-item').forEach(el => {
          el.style.display = el.getAttribute('data-search').includes(q) ? 'flex' : 'none';
        });
      }
      function validateAdminPoll(){
        const checked = document.querySelectorAll('input[name="candidate_nos"]:checked').length;
        if (checked < 2) { alert('Please select at least 2 candidates from registered members.'); return false; }
        return true;
      }
    </script>
  `));
});

app.post('/admin/polls/portal-switch', guard('polls'), async (req, res) => {
  const cur = await isElectionOn();
  await q(`INSERT INTO site_settings (key, val) VALUES ('election_portal_on', $1) ON CONFLICT (key) DO UPDATE SET val = $1`, [cur ? '0' : '1']);
  await logAudit(req, 'ELECTION_PORTAL_SWITCH', 'election_portal_on', cur ? 'Turned OFF' : 'Turned ON');
  res.redirect('/admin/polls?ok=1');
});

app.post('/admin/polls', guard('polls'), async (req, res) => {
  const b = req.body;
  let cNos = b.candidate_nos || [];
  if (!Array.isArray(cNos)) cNos = [cNos];
  const cleanNos = [...new Set(cNos.map(x => String(x || '').trim()).filter(Boolean))];
  const maxC = Math.min(20, Math.max(1, parseInt(b.max_choices, 10) || 5));

  if (b.title && cleanNos.length >= 2) {
    await q(`INSERT INTO polls (title, description, options, candidate_nos, max_choices, campus) VALUES ($1,$2,$3,$4,$5,$6)`,
      [b.title.slice(0, 200), (b.description || '').slice(0, 500), cleanNos.join(','), cleanNos.join(','), maxC, b.campus || 'all']);
    await logAudit(req, 'ELECTION_CREATE', b.title, `Candidates: ${cleanNos.length}, MaxChoices: ${maxC}`);
  }
  res.redirect('/admin/polls?ok=1');
});

app.post('/admin/polls/:id/toggle', guard('polls'), async (req, res) => {
  await q(`UPDATE polls SET status=CASE WHEN status='open' THEN 'closed' ELSE 'open' END WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  res.redirect('/admin/polls?ok=1');
});

app.post('/admin/polls/:id/delete', guard('polls'), async (req, res) => {
  await q(`DELETE FROM polls WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  res.redirect('/admin/polls?ok=1');
});

app.get('/admin/certificates', guard('certificates'), async (req, res) => {
  const certs = await q(`SELECT * FROM certificates ORDER BY id DESC LIMIT 40`);
  res.send(A(req, 'Certificates', `<div class="glass-card"><h3>🏅 Issue Certificate</h3><form method="POST" action="/admin/certificates"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;"><div><label>Member No.</label><input name="member_no" required placeholder="SM-ROB-2026-0001"></div><div><label>Title</label><input name="title" required value="Certificate of Appreciation"></div><div><label>Date</label><input name="issue_date" type="date" required value="${new Date().toISOString().slice(0,10)}"></div></div><label>Award Citation</label><textarea name="role_award" required></textarea><p style="margin-top:12px;"><button class="btn g">🏅 Issue Certificate</button></p></form></div><div class="glass-card"><div class="tw"><table><tr><th>Code</th><th>Member</th><th>Title</th><th>Date</th><th>Action</th></tr>${certs.map(c => `<tr><td><b>${h(c.cert_code)}</b></td><td>${h(c.member_name)} (${h(c.member_no)})</td><td>${h(c.title)}</td><td>${h(c.issue_date)}</td><td><form method="POST" action="/admin/certificates/${c.id}/delete"><button class="btn danger" style="padding:4px 9px;font-size:11px">Delete</button></form></td></tr>`).join('')}</table></div></div>`));
});
app.post('/admin/certificates', guard('certificates'), async (req, res) => {
  const [m] = await q(`SELECT member_no, name FROM members WHERE UPPER(member_no)=UPPER($1)`, [String(req.body.member_no||'').trim()]);
  if (m && req.body.title && req.body.role_award) {
    const code = 'CERT-' + new Date().getFullYear() + '-' + Math.random().toString(36).slice(2,7).toUpperCase();
    await q(`INSERT INTO certificates (cert_code, member_no, member_name, title, role_award, issue_date) VALUES ($1,$2,$3,$4,$5,$6)`, [code, m.member_no, m.name, req.body.title.slice(0,140), req.body.role_award.slice(0,600), req.body.issue_date||new Date().toISOString().slice(0,10)]);
  }
  res.redirect('/admin/certificates?ok=1');
});
app.post('/admin/certificates/:id/delete', guard('certificates'), async (req, res) => { await q(`DELETE FROM certificates WHERE id=$1`, [parseInt(req.params.id,10)||0]); res.redirect('/admin/certificates?ok=1'); });

app.get('/admin/members', guard('members'), async (req, res) => {
  const sc = scopeOf(req), cf = sc || (CAMPUS[req.query.campus] ? req.query.campus : ''), sf = req.query.status || '', qs = String(req.query.q || '').trim().slice(0, 50), pr = [], c = [];
  if (cf) { pr.push(cf); c.push(`campus=$${pr.length}`); }
  if (sf) { pr.push(sf); c.push(`status=$${pr.length}`); }
  if (qs) { pr.push('%' + qs + '%'); c.push(`(name ILIKE $${pr.length} OR member_no ILIKE $${pr.length} OR student_id ILIKE $${pr.length} OR phone ILIKE $${pr.length})`); }
  const ms = await q(`SELECT * FROM members ${c.length ? 'WHERE ' + c.join(' AND ') : ''} ORDER BY id DESC LIMIT 400`, pr);
  const act = (id, a, t, cls) => `<form method="POST" action="/admin/members/${id}/${a}" style="display:inline"><button class="btn ${cls || ''}" style="padding:4px 9px;font-size:11px;box-shadow:none">${t}</button></form>`;
  const exportQs = new URLSearchParams({ q: qs, campus: cf, status: sf }).toString();
  res.send(A(req, 'Members', `<div class="glass-card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px"><h3>👥 Members (${ms.length})</h3><a class="btn excel" href="/admin/members/export?${exportQs}">⬇ Excel (CSV)</a></div><form style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px" method="GET" action="/admin/members"><input name="q" value="${h(qs)}" placeholder="Search..." style="flex:1;min-width:160px">${sc ? '' : sel('campus', [['', 'All Campuses']].concat(campusOpts(null)), cf)}${sel('status', [['', 'All Status'], ['official', 'Official'], ['pending', 'Pending'], ['registered', 'Registered'], ['rejected', 'Rejected']], sf)}<button class="btn">Filter</button></form><div class="tw"><table><tr><th>No</th><th>Name</th><th>Campus</th><th>Dept</th><th>Phone</th><th>Status</th><th>Actions</th></tr>${ms.map(m => `<tr><td><b>${h(m.member_no)}</b></td><td>${h(m.name)}<br><small>${h(m.student_id)}</small></td><td>${h(campusName(req, m.campus))}</td><td>${h(m.department)} Y${h(m.year)}</td><td>${h(m.phone)}</td><td><span class="badge ${m.status}">${h(m.status)}</span></td><td style="white-space:nowrap"><a class="btn edit-btn" href="/admin/members/${m.id}/edit" style="padding:4px 9px;font-size:11px">✏️</a> ${m.status !== 'official' ? act(m.id, 'approve', 'Approve', 'g') : ''} ${m.status === 'pending' ? act(m.id, 'reject', 'Reject', 'danger') : ''}</td></tr>`).join('')}</table></div></div>`));
});

app.get('/admin/members/export', guard('members'), async (req, res) => {
  const sc = scopeOf(req), cf = sc || (CAMPUS[req.query.campus] ? req.query.campus : ''), sf = req.query.status || '', qs = String(req.query.q || '').trim().slice(0, 50), pr = [], c = [];
  if (cf) { pr.push(cf); c.push(`campus=$${pr.length}`); } if (sf) { pr.push(sf); c.push(`status=$${pr.length}`); }
  if (qs) { pr.push('%' + qs + '%'); c.push(`(name ILIKE $${pr.length} OR member_no ILIKE $${pr.length})`); }
  const rows = await q(`SELECT * FROM members ${c.length ? 'WHERE ' + c.join(' AND ') : ''} ORDER BY id DESC LIMIT 5000`, pr);
  const headers = ['member_no','name','gender','student_id','campus','college','department','year','zone_woreda','phone','email','status','created_at'];
  const lines = [headers.join(',')].concat(rows.map(r => headers.map(k => csvEsc(r[k])).join(',')));
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="sikkoo-members.csv"').send('\uFEFF' + lines.join('\n'));
});

app.get('/admin/members/:id/edit', guard('members'), async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE id=$1`, [parseInt(req.params.id, 10) || 0]); if (!m) return res.redirect('/admin/members');
  const s = (k, opts) => opts.map(x => `<option value="${h(x[0])}"${String(m[k]) === String(x[0]) ? ' selected' : ''}>${h(x[1])}</option>`).join('');
  res.send(A(req, 'Edit Member', `<div class="glass-card" style="max-width:780px;margin:0 auto"><h3>✏️ Edit ${h(m.name)}</h3><form method="POST" action="/admin/members/${m.id}/edit" enctype="multipart/form-data"><div class="form-section" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px 12px"><div><label>Name</label><input name="name" required value="${h(m.name)}"></div><div><label>Student ID</label><input name="student_id" required value="${h(m.student_id)}"></div><div><label>Phone</label><input name="phone" required value="${h(m.phone)}"></div><div><label>Campus</label><select name="campus">${s('campus', Object.keys(CAMPUS).map(k => [k, CAMPUS[k].n]))}</select></div><div><label>Department</label><input name="department" value="${h(m.department || '')}"></div><div><label>Year</label><select name="year">${s('year', [1,2,3,4,5,6].map(x => [String(x), 'Year '+x]))}</select></div><div><label>Status</label><select name="status">${s('status', [['registered','Registered'],['pending','Pending'],['official','Official'],['rejected','Rejected']])}</select></div><div><label>New Password</label><input name="password" type="password" minlength="6"></div></div><button class="btn">💾 Save</button> <a class="btn secondary" href="/admin/members">Back</a></form></div>`));
});
app.post('/admin/members/:id/edit', guard('members'), files6([{ name: 'photo', maxCount: 1 }]), async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0, b = req.body;
  await q(`UPDATE members SET name=$1, student_id=$2, phone=$3, campus=$4, department=$5, year=$6, status=$7 WHERE id=$8`, [b.name, b.student_id, b.phone, b.campus, b.department, b.year, b.status, id]);
  if (b.password && String(b.password).length >= 6) await q(`UPDATE members SET password=$1 WHERE id=$2`, [bcrypt.hashSync(String(b.password), 10), id]);
  res.redirect('/admin/members/' + id + '/edit?saved=1');
});
[['approve', 'official'], ['reject', 'rejected'], ['revoke', 'registered']].forEach(([a, st]) => { app.post('/admin/members/:id/' + a, guard('members'), async (req, res) => { await q(`UPDATE members SET status=$1 WHERE id=$2`, [st, parseInt(req.params.id, 10) || 0]); res.redirect('/admin/members?ok=1'); }); });

app.get('/admin/content/:type', guard('content'), async (req, res) => {
  const tp = req.params.type; if (!TYPES.includes(tp)) return res.redirect('/admin');
  const sc = scopeOf(req), ps = await q(`SELECT * FROM posts WHERE type=$1 ${sc ? 'AND campus=$2' : ''} ORDER BY id DESC LIMIT 60`, sc ? [tp, sc] : [tp]);
  res.send(A(req, tp, `<div class="glass-card"><h3>Publish ${h(tp.toUpperCase())}</h3><form method="POST" action="/admin/content/${tp}" enctype="multipart/form-data"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px"><div><label>Campus</label>${sel('campus', campusOpts(sc, true))}</div>${tp === 'announcement' ? `<div><label>Priority</label><select name="is_emergency"><option value="0">Normal</option><option value="1">🚨 Emergency</option></select></div>` : ''}<div><label>Date</label><input name="event_date" type="${tp === 'event' ? 'date' : 'text'}"></div></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px"><div><label>Title (OM)</label><input name="title_om"></div><div><label>Title (AM)</label><input name="title_am"></div><div><label>Title (EN)</label><input name="title_en"></div></div>${tp === 'gallery' ? '' : `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px"><div><label>Body (OM)</label><textarea name="body_om"></textarea></div><div><label>Body (AM)</label><textarea name="body_am"></textarea></div><div><label>Body (EN)</label><textarea name="body_en"></textarea></div></div>`}<label>Image</label><input name="image" type="file" accept="image/*"><label>Document PDF (Optional)</label><input name="file" type="file"><p style="margin-top:14px"><button class="btn">Publish</button></p></form></div><div class="glass-card">${ps.map(p => `<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border)"><span><b>${h(p.title_en || p.title_om || p.title_am)}</b></span><form method="POST" action="/admin/content/${tp}/${p.id}/delete"><button class="btn danger" style="padding:4px 9px;font-size:11px">Delete</button></form></div>`).join('')}</div>`));
});
app.post('/admin/content/:type', guard('content'), files6([{ name: 'image', maxCount: 1 }, { name: 'file', maxCount: 1 }]), async (req, res) => {
  const tp = req.params.type, b = req.body, sc = scopeOf(req), s = (k, n) => String(b[k] || '').trim().slice(0, n);
  const img = await saveFile(((req.files || {}).image || [])[0]), fl = await saveFile(((req.files || {}).file || [])[0]);
  const tEn = s('title_en', 200), tOm = s('title_om', 200), tAm = s('title_am', 200), isEm = parseInt(b.is_emergency, 10) || 0;
  if (tOm || tEn || tAm) {
    await q(`INSERT INTO posts (type, campus, title_om, title_en, title_am, body_om, body_en, body_am, event_date, is_emergency, image_id, file_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [tp, sc || (CAMPUS[b.campus] ? b.campus : 'all'), tOm, tEn, tAm, s('body_om', 4000), s('body_en', 4000), s('body_am', 4000), b.event_date || '', isEm, img, fl]);
    if (['announcement', 'news', 'event'].includes(tp)) postToTelegram(tEn || tOm || tAm, s('body_en', 800) || s('body_om', 800) || s('body_am', 800), tp, isEm);
  }
  res.redirect('/admin/content/' + tp + '?ok=1');
});
app.post('/admin/content/:type/:id/delete', guard('content'), async (req, res) => { await q(`DELETE FROM posts WHERE id=$1`, [parseInt(req.params.id, 10) || 0]); res.redirect('/admin/content/' + req.params.type + '?ok=1'); });

app.get('/admin/meetings', guard('meetings'), async (req, res) => {
  const meets = await q(`SELECT * FROM meetings ORDER BY id DESC LIMIT 40`);
  res.send(A(req, 'Meetings', `<div class="glass-card"><h3>Record Meeting</h3><form method="POST" action="/admin/meetings" enctype="multipart/form-data"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px"><div><label>Title</label><input name="title" required></div><div><label>Date</label><input name="meeting_date" type="date" required></div><div><label>Campus</label>${sel('campus', campusOpts(scopeOf(req), true))}</div></div><label>Agenda</label><textarea name="agenda"></textarea><label>Minutes</label><textarea name="minutes"></textarea><label>Resolutions</label><textarea name="resolutions"></textarea><label>File</label><input name="file" type="file"><p style="margin-top:12px"><button class="btn">Save</button></p></form></div><div class="glass-card">${meets.map(m => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)"><span><b>${h(m.title)}</b> (${h(m.meeting_date)})</span><form method="POST" action="/admin/meetings/${m.id}/delete"><button class="btn danger" style="padding:4px 9px;font-size:11px">Delete</button></form></div>`).join('')}</div>`));
});
app.post('/admin/meetings', guard('meetings'), files6([{ name: 'file', maxCount: 1 }]), async (req, res) => { const b = req.body, fl = await saveFile(((req.files || {}).file || [])[0]); if (b.title) await q(`INSERT INTO meetings (campus, title, meeting_date, agenda, minutes, resolutions, file_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [b.campus || 'all', b.title, b.meeting_date, b.agenda, b.minutes, b.resolutions, fl]); res.redirect('/admin/meetings?ok=1'); });
app.post('/admin/meetings/:id/delete', guard('meetings'), async (req, res) => { await q(`DELETE FROM meetings WHERE id=$1`, [parseInt(req.params.id, 10) || 0]); res.redirect('/admin/meetings?ok=1'); });

app.get('/admin/leaders', guard('leaders'), async (req, res) => {
  const sc = scopeOf(req), ls = await q(`SELECT * FROM leaders ${sc ? 'WHERE campus=$1' : ''} ORDER BY id DESC`, sc ? [sc] : []);
  res.send(A(req, 'Leaders', `<div class="glass-card"><h3>Add Leader</h3><form method="POST" action="/admin/leaders" enctype="multipart/form-data"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px"><div><label>Name</label><input name="name" required></div><div><label>Term</label><input name="term" value="2025-2026"></div><div><label>Level</label>${sel('level', sc ? [['campus','Campus']] : [['central','Central'],['campus','Campus']])}</div><div><label>Campus</label>${sel('campus', campusOpts(sc, false))}</div></div><label>Position</label><input name="position_en" required><label>Photo</label><input name="photo" type="file" accept="image/*"><p style="margin-top:12px"><button class="btn">Save</button></p></form></div><div class="glass-card">${ls.map(x => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)"><span><b>${h(x.name)}</b> · ${h(x.position_en)}</span><form method="POST" action="/admin/leaders/${x.id}/delete"><button class="btn danger" style="padding:4px 9px;font-size:11px">Delete</button></form></div>`).join('')}</div>`));
});
app.post('/admin/leaders', guard('leaders'), files6([{ name: 'photo', maxCount: 1 }]), async (req, res) => { const b = req.body, sc = scopeOf(req), pid = await saveFile(((req.files || {}).photo || [])[0]); if (b.name) await q(`INSERT INTO leaders (name, position_en, term, level, campus, photo_id) VALUES ($1,$2,$3,$4,$5,$6)`, [b.name, b.position_en || '', b.term || '2025-2026', sc ? 'campus' : b.level, sc || b.campus || 'all', pid]); res.redirect('/admin/leaders?ok=1'); });
app.post('/admin/leaders/:id/delete', guard('leaders'), async (req, res) => { await q(`DELETE FROM leaders WHERE id=$1`, [parseInt(req.params.id, 10) || 0]); res.redirect('/admin/leaders?ok=1'); });

const KINDS = [['contribution', 'Contribution'], ['donation', 'Donation'], ['fundraising', 'Fundraising'], ['income', 'Other Income'], ['expense', 'Expense']];
app.get('/admin/finance', guard('finance'), async (req, res) => {
  const sc = scopeOf(req), rp = await q(`SELECT * FROM finance_reports ${sc ? 'WHERE campus=$1' : ''} ORDER BY id DESC LIMIT 20`, sc ? [sc] : []);
  res.send(A(req, 'Finance', `<div class="glass-card"><h3>Record Transaction</h3><form method="POST" action="/admin/finance/tx"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px"><div><label>Type</label>${sel('kind', KINDS)}</div><div><label>Amount (ETB)</label><input name="amount" type="number" required></div><div><label>Date</label><input name="tdate" type="date" required></div><div><label>Campus</label>${sel('campus', campusOpts(sc, true))}</div></div><label>Note</label><input name="note"><p style="margin-top:12px"><button class="btn">Record</button></p></form></div><div class="glass-card"><h3>Generate Report</h3><form method="POST" action="/admin/finance/report" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end"><div><label>Period (YYYY-MM)</label><input name="period" placeholder="2026-11" required></div><div><label>Start Balance</label><input name="starting_balance" type="number" value="0"></div><div><label>Campus</label>${sel('campus', campusOpts(sc, true))}</div><button class="btn secondary">Generate</button></form><div class="tw" style="margin-top:12px"><table><tr><th>Period</th><th>Income</th><th>Expense</th><th>Status</th><th>Action</th></tr>${rp.map(r => `<tr><td>${h(r.period)}</td><td style="color:#10b981">${Number(r.income).toLocaleString()}</td><td style="color:#ef4444">${Number(r.expense).toLocaleString()}</td><td>${r.approved ? 'Published' : 'Draft'}</td><td>${can(req, 'approve') ? `<form method="POST" action="/admin/finance/report/${r.id}/${r.approved ? 'hide' : 'approve'}"><button class="btn g" style="padding:4px 9px;font-size:11px">${r.approved ? 'Hide' : 'Publish'}</button></form>` : ''}</td></tr>`).join('')}</table></div></div>`));
});
app.post('/admin/finance/tx', guard('finance'), async (req, res) => { const b = req.body; if (num(b.amount) > 0 && b.tdate) await q(`INSERT INTO transactions (kind,amount,tdate,note,campus,created_by) VALUES ($1,$2,$3,$4,$5,$6)`, [b.kind, num(b.amount), b.tdate, b.note || '', scopeOf(req) || b.campus || 'all', req.session.sname || '']); res.redirect('/admin/finance?ok=1'); });
app.post('/admin/finance/report', guard('finance'), async (req, res) => {
  const per = String(req.body.period || '').trim(), cmp = scopeOf(req) || req.body.campus || 'all';
  const rows = await q(`SELECT kind, SUM(amount) a FROM transactions WHERE tdate LIKE $1 ${cmp === 'all' ? '' : 'AND campus=$2'} GROUP BY kind`, cmp === 'all' ? [per + '%'] : [per + '%', cmp]);
  let inc = 0, exp = 0, d = {}; rows.forEach(r => { d[r.kind] = Number(r.a); if (r.kind === 'expense') exp += Number(r.a); else inc += Number(r.a); });
  await q(`INSERT INTO finance_reports (period,campus,income,expense,starting_balance,detail) VALUES ($1,$2,$3,$4,$5,$6)`, [per, cmp, inc, exp, num(req.body.starting_balance), JSON.stringify(d)]);
  res.redirect('/admin/finance?ok=1');
});
app.post('/admin/finance/report/:id/:a', guard('approve'), async (req, res) => { await q(`UPDATE finance_reports SET approved=$1 WHERE id=$2`, [req.params.a === 'approve' ? 1 : 0, parseInt(req.params.id, 10) || 0]); res.redirect('/admin/finance?ok=1'); });

app.get('/admin/support', guard('support'), async (req, res) => {
  const rs = await q(`SELECT * FROM support_requests ORDER BY (status='open') DESC, id DESC LIMIT 80`);
  res.send(A(req, 'Support', rs.map(r => `<div class="glass-card"><small>${h(r.member_no)} · ${h(r.name)}</small><h4>${h(r.subject)} <span class="badge ${r.status==='closed'?'official':'pending'}">${h(r.status)}</span></h4><p style="font-size:13px">${h(r.message)}</p><form method="POST" action="/admin/support/${r.id}/reply" style="margin-top:8px"><textarea name="reply" rows="2">${h(r.reply || '')}</textarea><p style="margin-top:6px"><button class="btn">Reply & Close</button></p></form></div>`).join('') || '<div class="glass-card">No tickets.</div>'));
});
app.post('/admin/support/:id/reply', guard('support'), async (req, res) => { await q(`UPDATE support_requests SET reply=$1, status='closed' WHERE id=$2`, [String(req.body.reply || '').slice(0, 2000), parseInt(req.params.id, 10) || 0]); res.redirect('/admin/support?ok=1'); });

app.get('/admin/staff', guard('staff'), async (req, res) => {
  const st = await q(`SELECT id,username,name,role,campus,active FROM staff ORDER BY id`);
  res.send(A(req, 'Staff', `<div class="glass-card"><h3>Create Staff</h3><form method="POST" action="/admin/staff"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px"><div><label>Name</label><input name="name" required></div><div><label>Username</label><input name="username" required></div><div><label>Role</label>${sel('role', ROLES.map(r => [r, r]))}</div><div><label>Campus</label>${sel('campus', campusOpts(null))}</div></div><label>Password (Min 8)</label><input name="password" type="password" minlength="8" required><p style="margin-top:12px"><button class="btn">Create</button></p></form></div><div class="glass-card"><div class="tw"><table><tr><th>Name</th><th>User</th><th>Role</th><th>Status</th><th>Action</th></tr>${st.map(x => `<tr><td>${h(x.name)}</td><td>${h(x.username)}</td><td>${h(x.role)}</td><td>${x.active ? 'Active' : 'Disabled'}</td><td><form method="POST" action="/admin/staff/${x.id}/toggle"><button class="btn secondary" style="padding:4px 9px;font-size:11px">Toggle</button></form></td></tr>`).join('')}</table></div></div>`));
});
app.post('/admin/staff', guard('staff'), async (req, res) => { const b = req.body; if (ROLES.includes(b.role) && b.name && b.username && String(b.password || '').length >= 8) { try { await q(`INSERT INTO staff (username,name,role,campus,password) VALUES ($1,$2,$3,$4,$5)`, [b.username.trim().toLowerCase(), b.name, b.role, CAMPUS[b.campus] ? b.campus : null, bcrypt.hashSync(String(b.password), 10)]); } catch (e) {} } res.redirect('/admin/staff?ok=1'); });
app.post('/admin/staff/:id/toggle', guard('staff'), async (req, res) => { await q(`UPDATE staff SET active=1-active WHERE id=$1`, [parseInt(req.params.id, 10) || 0]); res.redirect('/admin/staff?ok=1'); });

app.get('/admin/audit-logs', guard('audit'), async (req, res) => {
  const logs = await q(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 120`);
  res.send(A(req, 'Audit Logs', `<div class="glass-card"><div class="tw"><table><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr>${logs.map(l => `<tr><td>${new Date(l.created_at).toLocaleString()}</td><td><b>${h(l.actor)}</b></td><td>${h(l.action)}</td><td>${h(l.target || '-')}</td><td>${h(l.details || '-')}</td></tr>`).join('')}</table></div></div>`));
});


/* Admin Management Routes for Features 3, 6, 13 */
app.get('/admin/payments', guard('finance'), async (req, res) => {
  const payments = await q(`SELECT * FROM member_payments ORDER BY id DESC LIMIT 100`);
  res.send(A(req, 'Payment Approvals', `
    <div class="glass-card"><div class="tw"><table>
      <tr><th>Ref / ID</th><th>Member</th><th>Campus</th><th>Amount</th><th>Status</th><th>Action</th></tr>
      ${payments.map(p => `<tr>
        <td><b>${h(p.transaction_ref)}</b></td>
        <td>${h(p.name)} (${h(p.member_no)})</td>
        <td>${h(p.campus)}</td>
        <td>${Number(p.amount).toLocaleString()} ETB</td>
        <td><span class="badge ${p.status === 'approved' ? 'official' : (p.status === 'rejected' ? 'rejected' : 'pending')}">${h(p.status)}</span></td>
        <td style="white-space:nowrap">
          ${p.receipt_file_id ? `<a href="/photo/${p.receipt_file_id}" target="_blank" class="btn secondary" style="padding:4px 8px; font-size:11px;">Receipt</a>` : ''}
          ${p.status !== 'approved' ? `<form method="POST" action="/admin/payments/${p.id}/approve" style="display:inline"><button class="btn g" style="padding:4px 9px; font-size:11px;">Approve</button></form>` : ''}
          ${p.status === 'pending' ? `<form method="POST" action="/admin/payments/${p.id}/reject" style="display:inline"><button class="btn danger" style="padding:4px 9px; font-size:11px;">Reject</button></form>` : ''}
        </td>
      </tr>`).join('')}
    </table></div></div>
  `));
});

app.post('/admin/payments/:id/:action', guard('finance'), async (req, res) => {
  const st = req.params.action === 'approve' ? 'approved' : 'rejected';
  await q(`UPDATE member_payments SET status=$1 WHERE id=$2`, [st, parseInt(req.params.id, 10) || 0]);
  res.redirect('/admin/payments?ok=1');
});

app.get('/admin/suggestions', guard('support'), async (req, res) => {
  const suggestions = await q(`SELECT * FROM anonymous_suggestions ORDER BY id DESC LIMIT 100`);
  res.send(A(req, 'Anonymous Suggestions', suggestions.map(s => `
    <div class="glass-card">
      <span class="badge registered">${h(s.category)} · ${h(s.campus)}</span> · <small>${new Date(s.created_at).toLocaleString()}</small>
      <p style="font-size:14px; margin:10px 0;">${h(s.message)}</p>
      <form method="POST" action="/admin/suggestions/${s.id}/reply">
        <textarea name="reply" rows="2" placeholder="Write administration response...">${h(s.reply || '')}</textarea>
        <p style="margin-top:8px;"><button class="btn">Publish Reply</button></p>
      </form>
    </div>
  `).join('') || '<div class="glass-card">No suggestions.</div>'));
});

app.post('/admin/suggestions/:id/reply', guard('support'), async (req, res) => {
  await q(`UPDATE anonymous_suggestions SET reply=$1 WHERE id=$2`, [String(req.body.reply || '').slice(0, 2000), parseInt(req.params.id, 10) || 0]);
  res.redirect('/admin/suggestions?ok=1');
});

app.get('/admin/attendance', guard('meetings'), async (req, res) => {
  const sessions = await q(`SELECT * FROM attendance_sessions ORDER BY id DESC LIMIT 30`);
  res.send(A(req, 'QR Attendance', `
    <div class="glass-card">
      <h3>Create Attendance Session</h3>
      <form method="POST" action="/admin/attendance">
        <div style="display:grid; grid-template-columns:2fr 1fr; gap:10px;">
          <div><label>Session Title</label><input name="title" required placeholder="e.g. General Assembly"></div>
          <div><label>Campus</label>${sel('campus', campusOpts(scopeOf(req), true))}</div>
        </div>
        <label>Attendance Code (e.g. SM-ROB-01)</label><input name="code" required placeholder="SM-ATT-26">
        <p style="margin-top:12px;"><button class="btn">Create Session</button></p>
      </form>
    </div>
    <div class="glass-card">
      <h4>Active Sessions</h4>
      ${sessions.map(s => `<div class="form-section">
        <b>${h(s.title)}</b> · Code: <b>${h(s.code)}</b> (${h(s.campus)})
      </div>`).join('') || '<p>No sessions.</p>'}
    </div>
  `));
});

app.post('/admin/attendance', guard('meetings'), async (req, res) => {
  const b = req.body;
  if (b.title && b.code) {
    try {
      await q(`INSERT INTO attendance_sessions (title, campus, code) VALUES ($1,$2,$3)`,
        [b.title.slice(0,150), b.campus||'all', b.code.trim().toUpperCase()]);
    } catch(e) {}
  }
  res.redirect('/admin/attendance?ok=1');
});


app.get('/admin/backup', guard('backup'), async (req, res) => {
  if (!req.query.go) return res.send(A(req, 'Backup', `<div class="glass-card" style="text-align:center;padding:40px"><h3>💾 Database Backup</h3><p style="margin:12px 0">Download full JSON snapshot.</p><a class="btn" href="/admin/backup?go=1">⬇ Download Backup</a></div>`));
  const out = { exported_at: new Date().toISOString(), platform: 'Siikkoo-Mandoo MWU' };
  for (const t of ['members','posts','polls','poll_votes','certificates','forum_posts','forum_replies','leaders','meetings','support_requests','transactions','finance_reports','staff','audit_logs']) out[t] = await q(`SELECT * FROM ${t}`);
  res.set('Content-Type', 'application/json').set('Content-Disposition', `attachment; filename="sikkoo-mandoo-backup-${new Date().toISOString().slice(0,10)}.json"`).send(JSON.stringify(out, null, 2));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Siikkoo-Mandoo MWU Platform v6.0 running on port ${PORT}`));
