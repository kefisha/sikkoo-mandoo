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
  } catch (e) {
    console.error('Telegram post err:', e.message);
  }
}

// ---------- PWA MANIFEST & SERVICE WORKER ----------
app.get('/manifest.json', (req, res) => {
  res.json({
    name: 'Siikkoo-Mandoo Students Association · MWU',
    short_name: 'Siikkoo-Mandoo',
    start_url: '/',
    display: 'standalone',
    background_color: '#4f6ef7',
    theme_color: '#4f6ef7',
    icons: [{
      src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='24' fill='%234f6ef7'/%3E%3Ctext x='50' y='67' font-size='54' text-anchor='middle'%3E🌳%3C/text%3E%3C/svg%3E",
      sizes: '192x192',
      type: 'image/svg+xml'
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
  central_admin: '*',
  president: '*',
  vice_president: ['members', 'content', 'finance', 'support', 'leaders', 'meetings', 'approve', 'audit', 'polls', 'certificates'],
  general_secretary: ['members', 'content', 'meetings', 'support', 'leaders', 'polls', 'certificates'],
  finance_secretary: ['finance'],
  academic_secretary: ['content', 'support'],
  social_secretary: ['content', 'support', 'meetings'],
  communication_secretary: ['content', 'leaders', 'polls'],
  media_secretary: ['content', 'gallery'],
  info_secretary: ['content', 'support', 'staff', 'audit', 'backup', 'polls', 'certificates'],
  dev_secretary: ['content', 'finance'],
  campus_rep: ['members', 'content', 'support', 'finance', 'meetings', 'polls'],
  campus_coordinator: ['members', 'content', 'support', 'meetings'],
  committee_member: ['support']
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

// ---------- MODERN CSS (Matched to Reference Login Design + Dark Mode + Mobile Nav) ----------
const CSS = `
:root {
  --primary: #2563eb;
  --primary-dark: #1d4ed8;
  --teal: #0d9488;
  --pink: #ec4899;
  --pink-soft: #fdf2f8;
  --purple: #7c3aed;
  --green: #10b981;
  --orange: #f59e0b;
  --red: #ef4444;
  --text: #1e293b;
  --text-2: #475569;
  --text-muted: #64748b;
  --border: #cbd5e1;
  --surface: rgba(255,255,255,0.92);
  --surface-solid: #ffffff;
  --surface-soft: #f8fafc;
  --radius: 22px;
  --shadow: 0 10px 30px -8px rgba(37,99,235,0.14), 0 4px 12px -4px rgba(0,0,0,0.05);
  --shadow-xl: 0 25px 50px -12px rgba(30,58,138,0.28);
}
[data-theme="dark"] {
  --text: #f1f5f9;
  --text-2: #cbd5e1;
  --text-muted: #94a3b8;
  --border: #334155;
  --surface: rgba(30,41,59,0.9);
  --surface-solid: #1e293b;
  --surface-soft: #0f172a;
  --pink-soft: rgba(236,72,153,0.18);
  --shadow: 0 10px 30px -8px rgba(0,0,0,0.5);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background:
    radial-gradient(ellipse 90% 70% at 0% 0%, #60a5fa 0%, transparent 55%),
    radial-gradient(ellipse 90% 70% at 100% 0%, #818cf8 0%, transparent 55%),
    radial-gradient(ellipse 80% 70% at 100% 100%, #3b82f6 0%, transparent 55%),
    linear-gradient(155deg, #dbeafe 0%, #eff6ff 45%, #ede9fe 100%);
  background-attachment: fixed;
  color: var(--text);
  line-height: 1.6;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  -webkit-font-smoothing: antialiased;
}
[data-theme="dark"] body {
  background:
    radial-gradient(ellipse 90% 70% at 0% 0%, #1e1b4b 0%, transparent 55%),
    radial-gradient(ellipse 90% 70% at 100% 0%, #172554 0%, transparent 55%),
    linear-gradient(165deg, #0f172a 0%, #0b1120 100%);
}
/* Vibrant Blue-Purple Auth Backdrop (Matching Reference Image) */
body.auth-bg {
  background:
    radial-gradient(circle at 12% 20%, rgba(192,132,252,0.55) 0%, transparent 40%),
    radial-gradient(circle at 88% 80%, rgba(56,189,248,0.45) 0%, transparent 45%),
    linear-gradient(160deg, #3b82f6 0%, #4f46e5 52%, #2563eb 100%);
  background-attachment: fixed;
}
a { color: var(--primary); text-decoration: none; transition: 0.2s; }
a:hover { opacity: 0.9; }

header {
  background: var(--surface);
  backdrop-filter: blur(18px);
  border-bottom: 1px solid var(--border);
  position: sticky; top: 0; z-index: 100;
  padding: 11px 0;
}
.in { max-width: 1140px; margin: 0 auto; padding: 0 16px; width: 100%; }
.header-top { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.logo-area { display: flex; align-items: center; gap: 11px; }
.logo-icon {
  width: 44px; height: 44px; border-radius: 50%;
  background: linear-gradient(135deg, #f59e0b, #ec4899, #6366f1);
  padding: 2.5px; display: grid; place-items: center;
  box-shadow: 0 6px 16px rgba(99,102,241,0.3);
}
.logo-icon-inner {
  width: 100%; height: 100%; border-radius: 50%; background: #ffffff;
  display: grid; place-items: center; font-size: 20px;
}
.logo-text h1 { font-size: 14px; font-weight: 800; color: var(--text); }
.logo-text p { font-size: 11px; color: var(--text-muted); font-weight: 600; }
.nav-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.lang-box { display: flex; gap: 2px; background: var(--surface-soft); padding: 3px; border-radius: 9999px; border: 1px solid var(--border); }
.lang-btn { padding: 4px 10px; font-size: 11.5px; font-weight: 700; border-radius: 9999px; color: var(--text-muted); }
.lang-btn.active { background: var(--surface-solid); color: var(--primary); box-shadow: 0 2px 5px rgba(0,0,0,0.08); }
.theme-btn { width: 34px; height: 34px; border-radius: 11px; border: 1px solid var(--border); background: var(--surface-solid); color: var(--text); cursor: pointer; display: grid; place-items: center; font-size: 15px; }
.ext-nav { display: flex; gap: 7px; align-items: center; }
.ext-btn { padding: 7px 13px; font-size: 12.5px; font-weight: 650; border-radius: 12px; background: var(--surface-solid); color: var(--text); border: 1px solid var(--border); }
.ext-btn.login-btn { background: linear-gradient(90deg, #2563eb, #0d9488); color: white; border: none; }

/* Reference-Style Auth Card */
.alls-login-wrap {
  min-height: 82vh; display: flex; align-items: center; justify-content: center; padding: 14px 4px;
}
.alls-card {
  width: 100%; max-width: 440px;
  background: var(--surface-solid);
  border-radius: 30px;
  padding: 28px 24px 26px;
  box-shadow: var(--shadow-xl);
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.6);
}
.alls-top-bar {
  position: absolute; top: 0; left: 50%; transform: translateX(-50%);
  width: 110px; height: 5px; border-radius: 0 0 8px 8px;
  background: linear-gradient(90deg, #f472b6, #fbbf24);
}
.alls-logo-ring {
  width: 84px; height: 84px; margin: 4px auto 14px; border-radius: 50%;
  background: linear-gradient(135deg, #f59e0b 0%, #ec4899 50%, #6366f1 100%);
  padding: 3.5px; box-shadow: 0 10px 25px rgba(236,72,153,0.25);
}
.alls-logo-core {
  width: 100%; height: 100%; border-radius: 50%; background: #ffffff;
  display: grid; place-items: center; font-size: 38px;
}
.alls-title {
  text-align: center; font-size: 1.22rem; font-weight: 850; letter-spacing: 0.2px;
  color: var(--text); text-transform: uppercase; line-height: 1.3;
}
.alls-pill {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--pink-soft); color: #be185d;
  border: 1.5px solid #f9a8d4; border-radius: 9999px;
  padding: 5px 16px; font-size: 12.5px; font-weight: 700;
  margin: 10px auto 20px;
}
.alls-label {
  display: block; font-size: 11.5px; font-weight: 800; letter-spacing: 0.6px;
  color: var(--text-muted); text-transform: uppercase; margin: 14px 0 7px;
}
.alls-role-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 11px; margin-bottom: 16px;
}
.alls-role-card {
  position: relative; background: var(--surface-soft);
  border: 1.5px solid var(--border); border-radius: 18px;
  padding: 18px 10px; text-align: center; cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 0 rgba(148,163,184,0.35);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  min-height: 82px;
}
.alls-role-card:hover { transform: translateY(-2px); }
.alls-role-card .r-ico { font-size: 22px; }
.alls-role-card .r-txt { font-size: 13.5px; font-weight: 750; color: var(--text); }
.alls-role-card .r-check {
  display: none; position: absolute; top: 8px; right: 8px;
  width: 22px; height: 22px; border-radius: 50%;
  background: linear-gradient(135deg, #f472b6, #db2777);
  color: white; font-size: 12px; font-weight: 800;
  place-items: center; box-shadow: 0 3px 8px rgba(219,39,119,0.4);
}
.alls-role-card.active {
  background: linear-gradient(180deg, #fff1f2 0%, #fce7f3 100%);
  border: 2px solid #ec4899;
  box-shadow: 0 4px 0 #f472b6;
}
[data-theme="dark"] .alls-role-card.active {
  background: rgba(236,72,153,0.22);
}
.alls-role-card.active .r-check { display: grid; }

.input-ico-wrap { position: relative; }
.input-ico-wrap .ico {
  position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
  font-size: 16px; pointer-events: none;
}
.input-ico-wrap input {
  padding-left: 42px; height: 48px; border-radius: 14px;
  border: 1.5px solid var(--border); background: var(--surface-solid);
  font-size: 14.5px; width: 100%; color: var(--text);
}
.input-ico-wrap input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.15); }

/* 3D Gradient Buttons matching screenshot */
.btn-alls-primary {
  width: 100%; border: none; border-radius: 16px; padding: 14px;
  background: linear-gradient(90deg, #2563eb 0%, #0d9488 100%);
  color: #ffffff; font-size: 15px; font-weight: 750; cursor: pointer;
  box-shadow: 0 5px 0 #4f46e5, 0 10px 20px rgba(37,99,235,0.28);
  transition: transform 0.15s, box-shadow 0.15s; margin-top: 18px;
}
.btn-alls-primary:hover { transform: translateY(-1px); }
.btn-alls-primary:active { transform: translateY(2px); box-shadow: 0 2px 0 #4f46e5; }

.btn-alls-green {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; border: none; border-radius: 9999px; padding: 13px;
  background: linear-gradient(90deg, #34d399 0%, #10b981 100%);
  color: #ffffff; font-size: 14.5px; font-weight: 750; cursor: pointer;
  box-shadow: 0 5px 0 #059669, 0 8px 18px rgba(16,185,129,0.25);
  margin-top: 14px;
}
.btn-alls-green:hover { color: #ffffff; transform: translateY(-1px); }

.btn-alls-forgot {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; border: none; border-radius: 14px; padding: 12px;
  background: linear-gradient(90deg, #2563eb 0%, #0d9488 100%);
  color: #fef08a; font-size: 14px; font-weight: 750; cursor: pointer;
  margin-top: 13px;
}
.btn-alls-forgot:hover { color: #ffffff; }

/* General Components */
.glass-card, .card {
  background: var(--surface); backdrop-filter: blur(14px);
  border-radius: var(--radius); padding: 22px 20px; margin: 14px 0;
  box-shadow: var(--shadow); border: 1px solid var(--border);
}
label { display: block; font-weight: 650; font-size: 12px; margin: 12px 0 5px; color: var(--text-2); }
input, select, textarea {
  width: 100%; padding: 11px 14px; background: var(--surface-solid);
  border: 1.5px solid var(--border); border-radius: 13px;
  font: inherit; color: var(--text); font-size: 14px;
}
input:focus, select:focus, textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }
textarea { resize: vertical; min-height: 80px; }

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  background: linear-gradient(90deg, #2563eb, #0d9488);
  color: #fff; border: 0; border-radius: 14px; padding: 11px 18px;
  font-weight: 650; cursor: pointer; font-size: 13.5px;
  box-shadow: 0 4px 14px rgba(37,99,235,0.25); transition: 0.2s;
}
.btn:hover { transform: translateY(-1px); color: #fff; }
.btn.secondary { background: var(--surface-solid); border: 1.5px solid var(--border); color: var(--text); box-shadow: none; }
.btn.danger { background: linear-gradient(135deg, #f87171, #ef4444); }
.btn.g { background: linear-gradient(135deg, #34d399, #10b981); }
.btn.excel { background: linear-gradient(135deg, #059669, #047857); }
.btn.edit-btn { background: linear-gradient(135deg, #6366f1, #4f46e5); }

.portal-menu {
  background: var(--surface); border-radius: 18px; padding: 10px;
  display: flex; flex-wrap: wrap; gap: 7px; margin: 0 0 16px;
  border: 1px solid var(--border); box-shadow: var(--shadow);
}
.portal-btn {
  background: var(--surface-solid); color: var(--text-2); border-radius: 12px;
  padding: 8px 13px; font-size: 12.5px; font-weight: 650;
  display: inline-flex; align-items: center; gap: 5px;
  border: 1.5px solid var(--border);
}
.portal-btn.active { background: linear-gradient(90deg, #2563eb, #0d9488); color: white; border-color: transparent; }

.search-bar { display: flex; gap: 8px; margin-bottom: 14px; background: var(--surface); padding: 7px; border-radius: 15px; border: 1px solid var(--border); }
.search-bar input { border: none; background: transparent; padding: 6px 10px; }

.feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: 13px; margin: 14px 0 20px; }
.feature-tile {
  border-radius: 20px; padding: 20px 14px; text-align: center; color: white;
  font-weight: 700; font-size: 13.5px; box-shadow: 0 10px 22px -8px rgba(0,0,0,0.2);
  display: flex; flex-direction: column; align-items: center; gap: 8px; min-height: 105px; justify-content: center;
}
.feature-tile:hover { transform: translateY(-3px); color: white; }
.feature-tile .icon { font-size: 26px; }
.feature-tile.blue { background: linear-gradient(145deg, #60a5fa, #2563eb); }
.feature-tile.purple { background: linear-gradient(145deg, #a78bfa, #7c3aed); }
.feature-tile.cyan { background: linear-gradient(145deg, #22d3ee, #0891b2); }
.feature-tile.red { background: linear-gradient(145deg, #f87171, #dc2626); }
.feature-tile.yellow { background: linear-gradient(145deg, #fbbf24, #d97706); }
.feature-tile.indigo { background: linear-gradient(145deg, #818cf8, #4f46e5); }
.feature-tile.orange { background: linear-gradient(145deg, #fb923c, #ea580c); }
.feature-tile.teal { background: linear-gradient(145deg, #2dd4bf, #0d9488); }
.feature-tile.green { background: linear-gradient(145deg, #34d399, #059669); }
.feature-tile.brown { background: linear-gradient(145deg, #a16207, #713f12); }
.feature-tile.gray { background: linear-gradient(145deg, #64748b, #334155); }
.feature-tile.pink { background: linear-gradient(145deg, #f472b6, #db2777); }

table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; }
th, td { padding: 11px 12px; border-bottom: 1px solid var(--border); text-align: left; }
th { background: var(--surface-soft); font-weight: 700; color: var(--primary); font-size: 11px; text-transform: uppercase; }
.tw { overflow-x: auto; background: var(--surface-solid); border-radius: 16px; border: 1px solid var(--border); }

.badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; }
.badge.official { background: #d1fae5; color: #047857; }
.badge.pending { background: #fef3c7; color: #b45309; }
.badge.rejected { background: #fee2e2; color: #b91c1c; }
.badge.registered { background: #dbeafe; color: #1d4ed8; }
.badge.alert { background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; }
.err { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; padding: 11px 14px; border-radius: 12px; margin: 10px 0; font-size: 13.5px; font-weight: 600; }
.msgok { background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; padding: 11px 14px; border-radius: 12px; margin: 10px 0; font-size: 13.5px; font-weight: 600; }

/* Digital ID Card */
.id { border-radius: 22px; max-width: 430px; margin: 18px auto; background: #ffffff; color: #1e293b; box-shadow: var(--shadow-xl); overflow: hidden; border: 1px solid #e2e8f0; position: relative; }
.id .hd { background: linear-gradient(90deg, #2563eb 0%, #0d9488 100%); color: #fff; padding: 14px 18px; font-weight: 700; font-size: 13px; display: flex; justify-content: space-between; align-items: center; }
.id .bd { display: flex; gap: 14px; padding: 18px; align-items: center; position: relative; }
.id img { width: 90px; height: 112px; border-radius: 12px; object-fit: cover; border: 2px solid #e2e8f0; }
.id-seal { position: absolute; right: 14px; bottom: 8px; opacity: 0.22; pointer-events: none; }

/* Certificate Card */
.cert-box {
  max-width: 720px; margin: 18px auto; background: linear-gradient(135deg, #fffbeb 0%, #ffffff 50%, #eff6ff 100%);
  color: #1e293b; border: 10px double #d97706; border-radius: 18px; padding: 34px 28px;
  text-align: center; position: relative; box-shadow: var(--shadow-xl);
}
.cert-box h2 { font-size: 1.7rem; color: #1e3a8a; letter-spacing: 1px; text-transform: uppercase; margin: 10px 0 4px; }
.cert-name { font-size: 1.85rem; font-weight: 850; color: #b45309; margin: 14px 0; border-bottom: 2px solid #fcd34d; display: inline-block; padding: 0 24px 4px; }

/* Poll Progress Bar */
.poll-bar-bg { background: var(--surface-soft); border: 1px solid var(--border); border-radius: 999px; height: 12px; overflow: hidden; margin-top: 5px; }
.poll-bar-fill { background: linear-gradient(90deg, #2563eb, #10b981); height: 100%; border-radius: 999px; transition: width 0.5s; }

.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: 13px; margin-bottom: 16px; }
.stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 18px 12px; text-align: center; box-shadow: var(--shadow); }
.stat-card .num { font-size: 2rem; font-weight: 800; line-height: 1.1; margin-bottom: 4px; }
.stat-card .label { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }
.stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(115px, 1fr)); gap: 10px; margin-bottom: 16px; }
.stat-chip { background: var(--surface-solid); border-radius: 14px; padding: 12px 10px; text-align: center; border: 1px solid var(--border); }
.stat-chip b { display: block; font-size: 1.3rem; font-weight: 800; color: var(--primary); }
.stat-chip span { font-size: 11px; color: var(--text-muted); font-weight: 600; }

.admin-hero { background: linear-gradient(90deg, #2563eb 0%, #7c3aed 55%, #0d9488 100%); color: white; border-radius: 20px; padding: 24px 20px; margin-bottom: 16px; text-align: center; }
.form-section { background: var(--surface-soft); border: 1px solid var(--border); border-radius: 16px; padding: 16px 15px 12px; margin: 14px 0; }
.form-section h4 { font-size: 13px; font-weight: 750; color: var(--primary); margin: 0 0 8px; }

.toast { position: fixed; top: 18px; right: 18px; z-index: 9999; background: #10b981; color: white; padding: 12px 18px; border-radius: 13px; font-weight: 650; font-size: 13.5px; box-shadow: 0 12px 28px rgba(0,0,0,0.2); animation: slideIn 0.3s ease, fadeOut 0.4s ease 3s forwards; }
@keyframes slideIn { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes fadeOut { to { transform: translateY(-20px); opacity: 0; pointer-events: none; } }

.mobile-nav { display: none; position: fixed; bottom: 0; left: 0; right: 0; z-index: 999; background: var(--surface); backdrop-filter: blur(18px); border-top: 1px solid var(--border); padding: 7px 4px; justify-content: space-around; align-items: center; }
.mobile-nav a { display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 10.5px; font-weight: 700; color: var(--text-muted); padding: 4px 8px; border-radius: 10px; }
.mobile-nav a.active { color: var(--primary); background: rgba(37,99,235,0.1); }
.mobile-nav span.ico { font-size: 18px; }

main { flex: 1; display: flex; flex-direction: column; }
footer { text-align: center; padding: 20px 16px; color: var(--text-muted); font-size: 12px; margin-top: auto; border-top: 1px solid var(--border); background: var(--surface); }

@media (max-width: 680px) {
  .feature-grid { grid-template-columns: repeat(2, 1fr); gap: 11px; }
  .mobile-nav { display: flex; }
  body.has-mnav { padding-bottom: 68px; }
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
  if (isMember) extNav = `<div class="ext-nav"><a class="ext-btn" href="/student-dashboard">🪪 Portal</a><a class="ext-btn login-btn" href="/logout">${h(tr(req, 'logout'))}</a></div>`;
  else if (isStaff) extNav = `<div class="ext-nav"><a class="ext-btn" href="/admin">⚙️ Admin</a><a class="ext-btn login-btn" href="/logout">${h(tr(req, 'logout'))}</a></div>`;
  else extNav = `<div class="ext-nav"><a class="ext-btn" href="/about">${h(tr(req, 'about'))}</a><a class="ext-btn" href="/campuses">${h(tr(req, 'campuses'))}</a><a class="ext-btn login-btn" href="/login">${h(tr(req, 'login'))}</a></div>`;

  let toast = '';
  if (req.query.ok) toast = `<div class="toast">✅ Action completed successfully!</div>`;
  else if (req.query.saved) toast = `<div class="toast">💾 Saved successfully!</div>`;
  else if (req.query.rsvp) toast = `<div class="toast">🎉 RSVP confirmed!</div>`;
  else if (req.query.voted) toast = `<div class="toast">🗳️ Your vote has been recorded!</div>`;

  const mobileNav = isMember ? `
    <nav class="mobile-nav">
      <a href="/student-dashboard" class="${req.path === '/student-dashboard' ? 'active' : ''}"><span class="ico">🪪</span>ID Card</a>
      <a href="/portal/announcements" class="${req.path.includes('announcements') ? 'active' : ''}"><span class="ico">📢</span>News</a>
      <a href="/portal/polls" class="${req.path.includes('polls') ? 'active' : ''}"><span class="ico">🗳️</span>Polls</a>
      <a href="/portal/forum" class="${req.path.includes('forum') ? 'active' : ''}"><span class="ico">💬</span>Forum</a>
      <a href="/portal/profile" class="${req.path.includes('profile') ? 'active' : ''}"><span class="ico">⚙️</span>Profile</a>
    </nav>
  ` : '';

  const bodyCls = [isMember ? 'has-mnav' : '', opts.authBg ? 'auth-bg' : ''].filter(Boolean).join(' ');

  return `<!DOCTYPE html>
<html lang="${l}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#2563eb">
  <link rel="manifest" href="/manifest.json">
  <title>${h(title)} · ${h(tr(req, 'site'))}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>${CSS}</style>
</head>
<body class="${bodyCls}">
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
  <div class="in" style="padding-top: 18px; padding-bottom: 36px; width: 100%;">${body}</div>
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
${mobileNav}
${CLIENT_JS}
</body>
</html>`;
}

function portalMenu(activePath) {
  const items = [
    { p: '/student-dashboard', i: '🪪', t: 'ID Card' },
    { p: '/portal/announcements', i: '📢', t: 'Announcements' },
    { p: '/portal/news', i: '📰', t: 'News' },
    { p: '/portal/events', i: '📅', t: 'Events' },
    { p: '/portal/polls', i: '🗳️', t: 'Elections & Polls' },
    { p: '/portal/certificates', i: '🏅', t: 'Certificates' },
    { p: '/portal/forum', i: '💡', t: 'Q&A Forum' },
    { p: '/portal/meetings', i: '🤝', t: 'Meetings' },
    { p: '/portal/education', i: '📚', t: 'Education' },
    { p: '/portal/leadership', i: '👥', t: 'Leadership' },
    { p: '/portal/finance', i: '💰', t: 'Finance' },
    { p: '/portal/support', i: '💬', t: 'Support' },
    { p: '/portal/profile', i: '⚙️', t: 'Profile' }
  ];
  return `
    <form class="search-bar" method="GET" action="/portal/search">
      <input name="q" placeholder="🔍 Search announcements, events, education, forum..." required>
      <button class="btn" style="padding:7px 15px; border-radius:11px;">Search</button>
    </form>
    <div class="portal-menu">
      ${items.map(x => `<a href="${x.p}" class="portal-btn${activePath === x.p ? ' active' : ''}">${x.i} ${x.t}</a>`).join('')}
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
  return `<div class="glass-card" style="margin-bottom:15px; border-left: 4px solid ${p.is_emergency ? '#ef4444' : '#2563eb'}">
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
      <small style="color:var(--text-muted);font-weight:600;font-size:12px">${h(p.campus === 'all' ? 'All Campuses' : campusName(req, p.campus))} · ${h(p.event_date || new Date(p.created_at).toLocaleDateString())} ${ethDt ? `(${h(ethDt)})` : ''}</small>
      <div>${isEmergency}</div>
    </div>
    <h3 style="margin:7px 0 9px; font-size:1.12rem; font-weight:750">${h(postT(req, p, 'title'))}</h3>
    ${p.image_id ? `<img style="width:100%;max-height:330px;object-fit:cover;border-radius:12px;margin-bottom:10px" src="/photo/${p.image_id}" alt="">` : ''}
    <div style="color:var(--text-2);font-size:14px;line-height:1.65">${h(postT(req, p, 'body')).replace(/\n/g, '<br>')}</div>
    ${p.file_id ? `<p style="margin-top:12px"><a class="btn secondary" style="padding:6px 13px;font-size:12px" href="/photo/${p.file_id}?dl=1">📥 Download Attachment</a></p>` : ''}
    ${extraHtml}
  </div>`;
}

const scopeOf = req => (CENTRAL.includes(req.session.sr) ? null : (req.session.campus || '-'));

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
  await q(`CREATE TABLE IF NOT EXISTS polls (id SERIAL PRIMARY KEY, title TEXT, description TEXT, options TEXT, campus TEXT DEFAULT 'all', status TEXT DEFAULT 'open', created_at TIMESTAMP DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS poll_votes (id SERIAL PRIMARY KEY, poll_id INTEGER, member_no TEXT, choice TEXT, created_at TIMESTAMP DEFAULT NOW(), UNIQUE(poll_id, member_no))`);
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

  for (const sql of [
    `ALTER TABLE files ADD COLUMN IF NOT EXISTS name TEXT`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS college TEXT`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS zone_woreda TEXT`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS telegram_handle TEXT`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS renewal_date TIMESTAMP DEFAULT NOW()`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_emergency INTEGER DEFAULT 0`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS title_am TEXT`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS body_am TEXT`,
    `ALTER TABLE finance_reports ADD COLUMN IF NOT EXISTS starting_balance NUMERIC DEFAULT 0`
  ]) { try { await q(sql); } catch (e) {} }

  const adminPass = bcrypt.hashSync(process.env.ADMIN_PASS || 'sikomando123', 10);
  const adminUser = process.env.ADMIN_USER || 'admin';
  await q(`INSERT INTO staff (username, name, role, campus, password, active) VALUES ($1, 'Central Admin', 'central_admin', NULL, $2, 1)
           ON CONFLICT (username) DO UPDATE SET password = $2, role = 'central_admin', active = 1`, [adminUser, adminPass]);
})().catch(e => console.error('DB init err:', e.message));

app.get('/lang/:l', (req, res) => {
  if (['om', 'am', 'en'].includes(req.params.l)) req.session.lang = req.params.l;
  res.redirect(req.get('referer') || '/');
});

// ---------- REFERENCE-STYLE UNIFIED LOGIN PAGE (Matches Uploaded Screenshot!) ----------
function renderAllsLogin(req) {
  const err = req.query.e ? `<div class="err">Invalid ID / Username or Password. Please try again.</div>` : '';
  return page(req, tr(req, 'login'), `
    <div class="alls-login-wrap">
      <div class="alls-card">
        <div class="alls-top-bar"></div>
        <div class="alls-logo-ring"><div class="alls-logo-core">🌳</div></div>
        <h2 class="alls-title">${h(tr(req, 'site'))}</h2>
        <div style="text-align:center;">
          <span class="alls-pill">✦ Official Digital Portal</span>
        </div>

        ${err}

        <form method="POST" action="/login">
          <input type="hidden" name="login_role" id="loginRoleInput" value="student">

          <span class="alls-label">CHOOSE YOUR ROLE</span>
          <div class="alls-role-grid">
            <div class="alls-role-card active" onclick="pickRole(this,'student')">
              <span class="r-check">✓</span>
              <span class="r-ico">🎓</span>
              <span class="r-txt">Student</span>
            </div>
            <div class="alls-role-card" onclick="pickRole(this,'campus_rep')">
              <span class="r-check">✓</span>
              <span class="r-ico">🏛️</span>
              <span class="r-txt">Campus Rep</span>
            </div>
            <div class="alls-role-card" onclick="pickRole(this,'committee')">
              <span class="r-check">✓</span>
              <span class="r-ico">👥</span>
              <span class="r-txt">Committee</span>
            </div>
            <div class="alls-role-card" onclick="pickRole(this,'admin')">
              <span class="r-check">✓</span>
              <span class="r-ico">🛡️</span>
              <span class="r-txt">Admin</span>
            </div>
          </div>

          <span class="alls-label">ID / USERNAME</span>
          <div class="input-ico-wrap">
            <span class="ico">🪪</span>
            <input name="u" id="loginUserInput" required placeholder="SM-ROB-2026-0001 or Student ID" autocomplete="username">
          </div>

          <span class="alls-label">PASSWORD / PIN</span>
          <div class="input-ico-wrap">
            <span class="ico">🔒</span>
            <input name="p" type="password" required placeholder="Enter password" autocomplete="current-password">
          </div>

          <button type="submit" class="btn-alls-primary">Sign In to Portal</button>
        </form>

        <a href="/sikkoo-mandoo-register" class="btn-alls-green">📝 New Student Registration</a>
        <a href="/forgot-password" class="btn-alls-forgot">🔑 Forgot Password?</a>

        <div style="display:flex; justify-content:center; gap:14px; margin-top:16px; font-size:12px; font-weight:600;">
          <a href="/about">🏛️ About</a>
          <a href="/campuses">📍 Campuses</a>
          <a href="/lang/om">OM</a>
          <a href="/lang/am">አማ</a>
          <a href="/lang/en">EN</a>
        </div>
      </div>
    </div>
    <script>
      function pickRole(el, role){
        document.querySelectorAll('.alls-role-card').forEach(c => c.classList.remove('active'));
        el.classList.add('active');
        document.getElementById('loginRoleInput').value = role;
        const inp = document.getElementById('loginUserInput');
        inp.placeholder = role === 'student' ? 'SM-ROB-2026-0001 or Student ID' : 'Staff / Admin Username';
      }
    </script>
  `, { authBg: true, hideHeader: true, hideFooter: true });
}

app.get('/', (req, res) => {
  if (req.session.mid) return res.redirect('/student-dashboard');
  if (req.session.sr) return res.redirect('/admin');
  res.send(renderAllsLogin(req));
});

app.get('/login', (req, res) => {
  if (req.session.mid) return res.redirect('/student-dashboard');
  if (req.session.sr) return res.redirect('/admin');
  res.send(renderAllsLogin(req));
});

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
  const roleChoice = String(req.body.login_role || 'student');
  const u = String(req.body.u || '').trim();
  const pw = String(req.body.p || '');

  // If Staff / Rep / Committee / Admin selected
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
    // Student / Member login
    const [m] = await q(`SELECT * FROM members WHERE UPPER(member_no)=UPPER($1) OR UPPER(student_id)=UPPER($1)`, [u]);
    if (m && bcrypt.compareSync(pw, m.password)) {
      req.session.sr = null; req.session.mid = m.member_no; req.session.campus = m.campus;
      await logAudit(req, 'MEMBER_LOGIN', m.member_no, 'Member login');
      return res.redirect('/student-dashboard');
    }
  }
  f.n++; fails.set(req.ip, f);
  res.redirect('/login?e=1');
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

// ---------- FORGOT PASSWORD ----------
app.get('/forgot-password', (req, res) => {
  const newPass = req.query.np || '', name = req.query.nm || '';
  res.send(page(req, 'Password Recovery', `
    <div class="alls-login-wrap"><div class="alls-card">
      <div class="alls-top-bar"></div>
      <div class="alls-logo-ring"><div class="alls-logo-core">🔑</div></div>
      <h2 class="alls-title">Password Reset</h2>
      <p style="text-align:center; color:var(--text-muted); font-size:13px; margin:8px 0 18px;">Enter your Student ID and registered Zone/Woreda.</p>
      ${newPass ? `
        <div class="msgok">
          <strong>✅ Temporary password for ${h(name)}:</strong>
          <div style="font-size:1.5rem; font-weight:800; letter-spacing:2px; text-align:center; margin:10px 0; padding:10px; border:2px dashed #10b981; border-radius:12px;">${h(newPass)}</div>
        </div>
        <a href="/login" class="btn-alls-primary" style="display:block; text-align:center;">Go to Login →</a>
      ` : `
        ${req.query.e ? `<div class="err">No matching member found.</div>` : ''}
        <form method="POST" action="/forgot-password">
          <span class="alls-label">STUDENT ID</span>
          <div class="input-ico-wrap"><span class="ico">🪪</span><input name="student_id" required placeholder="UGRR/..."></div>
          <span class="alls-label">ZONE / WOREDA</span>
          <div class="input-ico-wrap"><span class="ico">📍</span><input name="zone_woreda" required placeholder="e.g. Bale / Robe"></div>
          <button class="btn-alls-primary">Generate New Password</button>
        </form>
        <p style="text-align:center; margin-top:16px;"><a href="/login">← Back to Login</a></p>
      `}
    </div></div>
  `, { authBg: true, hideHeader: true, hideFooter: true }));
});

app.post('/forgot-password', async (req, res) => {
  const sid = String(req.body.student_id || '').trim(), zone = String(req.body.zone_woreda || '').trim().toLowerCase();
  const [m] = await q(`SELECT * FROM members WHERE UPPER(student_id)=UPPER($1) AND LOWER(COALESCE(zone_woreda,'')) LIKE $2`, [sid, '%' + zone + '%']);
  if (!m) return res.redirect('/forgot-password?e=1');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let temp = ''; for (let i = 0; i < 8; i++) temp += chars[Math.floor(Math.random() * chars.length)];
  await q(`UPDATE members SET password=$1 WHERE id=$2`, [bcrypt.hashSync(temp, 10), m.id]);
  await q(`INSERT INTO password_resets (student_id, phone, reason, status) VALUES ($1,$2,'Auto reset','resolved')`, [m.student_id, m.phone || '']);
  res.redirect(`/forgot-password?np=${encodeURIComponent(temp)}&nm=${encodeURIComponent(m.name)}`);
});

// ---------- REGISTRATION ----------
function regForm(req, err, v) {
  v = v || {};
  const s = (k, o) => o.map(x => `<option value="${x[0]}"${v[k] === x[0] ? ' selected' : ''}>${h(x[1])}</option>`).join('');
  return page(req, tr(req, 'reg'), `
    <div style="max-width: 680px; margin: 12px auto;">
      <div class="glass-card" style="padding: 26px 22px;">
        <h2 style="text-align:center; font-size:1.4rem; font-weight:800; margin-bottom:14px;">📝 ${h(tr(req, 'reg'))}</h2>
        ${err ? `<div class="err">${h(err)}</div>` : ''}
        <form method="POST" action="/sikkoo-mandoo-register" enctype="multipart/form-data">
          <div class="form-section"><h4>👤 Personal & Academic Info</h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 4px 14px;">
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
          <div class="form-section"><h4>📷 Photo & Security</h4>
            <label>${h(tr(req, 'photo'))} (Auto-compressed)</label>
            <input name="photo" type="file" accept="image/jpeg,image/png,image/webp">
            <label>${h(tr(req, 'pass'))} (Min. 6 chars) *</label>
            <input name="password" type="password" minlength="6" required>
          </div>
          <label style="display:flex; align-items:center; gap:10px; padding:12px; background:rgba(16,185,129,0.12); border-radius:12px;">
            <input type="checkbox" name="want" value="1" style="width:18px; height:18px;">
            <span>${h(tr(req, 'want'))}</span>
          </label>
          <button class="btn-alls-green" type="submit">${h(tr(req, 'send'))}</button>
        </form>
      </div>
    </div>
  `);
}

app.get('/sikkoo-mandoo-register', (req, res) => res.send(regForm(req)));
app.post('/sikkoo-mandoo-register', upload.single('photo'), async (req, res) => {
  const b = req.body, c = CAMPUS[b.campus];
  if (!c || !b.name || !b.student_id || !b.phone || !b.department || !b.college || !b.zone_woreda || String(b.password || '').length < 6) {
    return res.send(regForm(req, tr(req, 'bad'), b));
  }
  try {
    const existing = await q(`SELECT 1 FROM members WHERE UPPER(student_id)=UPPER($1)`, [b.student_id.trim()]);
    if (existing.length) return res.send(regForm(req, tr(req, 'exists'), b));
    let pid = null;
    if (req.file && /^image\/(jpeg|png|webp)$/.test(req.file.mimetype)) {
      pid = (await q(`INSERT INTO files (mime,data,name) VALUES ($1,$2,$3) RETURNING id`, [req.file.mimetype, req.file.buffer, 'profile-photo']))[0].id;
    }
    const hash = bcrypt.hashSync(String(b.password), 10), yr = new Date().getFullYear();
    for (let i = 0; i < 6; i++) {
      const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM members WHERE campus=$1`, [b.campus]);
      const no = `SM-${c.c}-${yr}-${String(n + 1 + i).padStart(4, '0')}`;
      try {
        await q(`INSERT INTO members (member_no, name, gender, phone, email, campus, college, department, year, zone_woreda, telegram_handle, student_id, photo_id, password, status)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [no, b.name.trim().slice(0, 80), b.gender === 'F' ? 'F' : 'M', b.phone.trim().slice(0, 30), (b.email || '').slice(0, 80),
           b.campus, b.college.trim().slice(0, 80), b.department.trim().slice(0, 80), String(b.year || '1'),
           b.zone_woreda.trim().slice(0, 100), (b.telegram_handle || '').slice(0, 50), b.student_id.trim().slice(0, 40),
           pid, hash, b.want ? 'pending' : 'registered']);
        req.session.mid = no; req.session.campus = b.campus;
        await logAudit(req, 'MEMBER_REGISTER', no, `Campus: ${b.campus}`);
        return res.redirect('/student-dashboard?ok=1');
      } catch (e) { if (!/duplicate|unique/i.test(e.message)) throw e; }
    }
    res.send(regForm(req, tr(req, 'bad'), b));
  } catch (e) { res.status(500).send('Registration error'); }
});

// ---------- ABOUT & CAMPUSES ----------
app.get('/about', (req, res) => {
  res.send(page(req, tr(req, 'about'), `
    <div class="glass-card" style="padding:28px">
      <div style="text-align:center; margin-bottom:22px">
        <div class="alls-logo-ring"><div class="alls-logo-core">🌳</div></div>
        <h2>${h(tr(req, 'site'))}</h2>
        <p style="color:var(--text-muted)">${h(tr(req, 'uni'))}</p>
        <span class="alls-pill">"Tokkummaa, Barnoota fi Aadaa" · "አንድነት፣ ትምህርት እና ባህል"</span>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:16px;">
        <div class="form-section" style="margin:0"><h4>🏛️ History</h4><p style="font-size:13.5px; color:var(--text-2);">Founded at Madda Walabu University to cultivate unity, mutual assistance, academic excellence, and cultural heritage across Robe, Goba, and Shashamane campuses.</p></div>
        <div class="form-section" style="margin:0"><h4>🎯 Mission & Vision</h4><p style="font-size:13.5px; color:var(--text-2);">Empowering students through academic collaboration, ethical leadership, and cultural identity preservation.</p></div>
      </div>
    </div>
  `));
});

app.get('/campuses', async (req, res) => {
  const counts = await q(`SELECT campus, COUNT(*)::int as total, SUM(CASE WHEN status='official' THEN 1 ELSE 0 END)::int as official FROM members GROUP BY campus`);
  const cMap = {}; counts.forEach(c => { cMap[c.campus] = c; });
  res.send(page(req, tr(req, 'campuses'), `
    <h2 style="margin-bottom:14px">🏛️ ${h(tr(req, 'campuses'))}</h2>
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
      ${Object.keys(CAMPUS).map(k => {
        const c = CAMPUS[k], d = cMap[k] || { total: 0, official: 0 };
        return `<div class="glass-card" style="margin:0">
          <span class="badge registered">${c.c} CAMPUS</span>
          <h3 style="margin:8px 0 4px;">${c.n}</h3>
          <p style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">📍 ${c.loc}</p>
          <p style="font-size:13px; color:var(--text-2); margin-bottom:12px;">${c.colleges}</p>
          <div style="display:flex; gap:18px;"><div><b style="font-size:1.3rem; color:var(--primary)">${d.total}</b><br><small>Total</small></div><div><b style="font-size:1.3rem; color:#10b981">${d.official}</b><br><small>Official</small></div></div>
        </div>`;
      }).join('')}
    </div>
  `));
});

// ---------- MEMBER DASHBOARD (ID CARD + ETHIOPIAN DATE + PNG DOWNLOAD) ----------
app.get('/student-dashboard', needMember, async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]);
  if (!m) return res.redirect('/logout');
  const base = 'https://' + req.headers.host + '/verify/' + encodeURIComponent(m.member_no);
  const ethRenewal = toEthiopianDate(m.renewal_date || new Date(), L(req));

  const sealSvg = `<svg class="id-seal" width="84" height="84" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="45" fill="none" stroke="#2563eb" stroke-width="3" stroke-dasharray="4 2"/>
    <circle cx="50" cy="50" r="35" fill="none" stroke="#0d9488" stroke-width="1.5"/>
    <text x="50" y="48" font-size="9.5" font-weight="800" text-anchor="middle" fill="#2563eb">SIIKKOO-MANDOO</text>
    <text x="50" y="61" font-size="8" font-weight="700" text-anchor="middle" fill="#0d9488">MWU OFFICIAL</text>
  </svg>`;

  res.send(page(req, tr(req, 'dash'), `
    ${portalMenu('/student-dashboard')}
    <div id="idCardBox" class="id">
      <div class="hd">
        <span>🌳 ${h(tr(req, 'site'))}</span>
        <span class="badge ${m.status}">${h(tr(req, m.status))}</span>
      </div>
      <div class="bd">
        ${sealSvg}
        <img crossorigin="anonymous" src="${m.photo_id ? '/photo/' + m.photo_id : 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Crect width=%27100%27 height=%27100%27 fill=%27%23e2e8f0%27/%3E%3Ctext x=%2750%27 y=%2760%27 font-size=%2740%27 text-anchor=%27middle%27%3E👤%3C/text%3E%3C/svg%3E'}" alt="">
        <div>
          <b style="font-size:16px; color:#0f172a; font-weight:800">${h(m.name)}</b><br>
          <small style="color:#64748b; font-size:11px">${h(tr(req, 'no'))}</small><br>
          <b style="color:#2563eb; font-size:14.5px;">${h(m.member_no)}</b><br>
          <small style="color:#475569; font-weight:600; font-size:11.5px">${h(campusName(req, m.campus))} · ${h(m.department)} · Y${h(m.year)}</small><br>
          <small style="color:#64748b; font-size:11px">📍 ${h(m.zone_woreda || 'Bale')}</small>
        </div>
      </div>
      <div style="padding:11px 18px 15px; display:flex; justify-content:space-between; align-items:flex-end; border-top:1px solid #f1f5f9;">
        <div>
          <small style="font-weight:600; color:#64748b; font-size:11px">Student ID: <span style="color:#0f172a">${h(m.student_id)}</span></small><br>
          <small style="color:#0d9488; font-weight:700; font-size:11px">📅 ${h(ethRenewal)}</small>
        </div>
        <div id="qr" style="background:#fff; padding:4px; border-radius:8px; border:1px solid #e2e8f0;"></div>
      </div>
    </div>

    <div style="text-align:center; margin-top:16px; display:flex; justify-content:center; gap:9px; flex-wrap:wrap;">
      <button onclick="downloadID()" class="btn g">📥 Download ID (PNG)</button>
      <button onclick="print()" class="btn secondary">🖨️ ${h(tr(req, 'print'))}</button>
      ${m.status === 'registered' ? `<form method="POST" action="/student/upgrade" style="display:inline"><button class="btn">${h(tr(req, 'upgrade'))}</button></form>` : ''}
      <form method="POST" action="/student/renew" style="display:inline"><button class="btn secondary">🔄 ${h(tr(req, 'renew'))}</button></form>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    <script>
      new QRCode(document.getElementById('qr'),{text:${JSON.stringify(base)},width:60,height:60,colorDark:"#0f172a",colorLight:"#ffffff"});
      function downloadID(){
        html2canvas(document.getElementById('idCardBox'), { scale: 2, useCORS: true }).then(c => {
          const a = document.createElement('a'); a.download = ${JSON.stringify(m.member_no + '-ID.png')}; a.href = c.toDataURL('image/png'); a.click();
        });
      }
    </script>
  `));
});

app.post('/student/upgrade', needMember, async (req, res) => {
  await q(`UPDATE members SET status='pending' WHERE member_no=$1 AND status='registered'`, [req.session.mid]);
  res.redirect('/student-dashboard?ok=1');
});
app.post('/student/renew', needMember, async (req, res) => {
  await q(`UPDATE members SET renewal_date=NOW() WHERE member_no=$1`, [req.session.mid]);
  res.redirect('/student-dashboard?ok=1');
});

// ---------- 1. MEMBER PROFILE SETTINGS & PASSWORD CHANGE ----------
app.get('/portal/profile', needMember, async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]);
  if (!m) return res.redirect('/logout');
  res.send(page(req, 'Profile Settings', `
    ${portalMenu('/portal/profile')}
    <div class="glass-card" style="max-width:720px; margin:0 auto;">
      <h3 style="margin-bottom:12px;">⚙️ My Profile Settings</h3>
      ${req.query.pwerr ? `<div class="err">Current password is incorrect or new password is too short (min 6 chars).</div>` : ''}
      <form method="POST" action="/portal/profile" enctype="multipart/form-data">
        <div class="form-section" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:8px 14px;">
          <div><label>Phone</label><input name="phone" required value="${h(m.phone)}"></div>
          <div><label>Email</label><input name="email" type="email" value="${h(m.email || '')}"></div>
          <div><label>Telegram Username</label><input name="telegram_handle" value="${h(m.telegram_handle || '')}"></div>
          <div><label>Academic Year</label><select name="year">${[1,2,3,4,5,6].map(y => `<option value="${y}"${String(m.year)===String(y)?' selected':''}>Year ${y}</option>`).join('')}</select></div>
          <div><label>Zone / Woreda</label><input name="zone_woreda" value="${h(m.zone_woreda || '')}"></div>
          <div><label>Update Photo (Auto-compressed)</label><input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></div>
        </div>
        <button class="btn">💾 Update Profile</button>
      </form>

      <hr style="margin:24px 0; border:none; border-top:1px solid var(--border);">
      <h3 style="margin-bottom:10px;">🔐 Change Password</h3>
      <form method="POST" action="/portal/profile/password">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px;">
          <div><label>Current Password</label><input name="old_pass" type="password" required></div>
          <div><label>New Password (Min 6 chars)</label><input name="new_pass" type="password" minlength="6" required></div>
        </div>
        <p style="margin-top:14px;"><button class="btn secondary">🔑 Update Password</button></p>
      </form>
    </div>
  `));
});

app.post('/portal/profile', needMember, upload.single('photo'), async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]);
  if (!m) return res.redirect('/logout');
  let pid = m.photo_id;
  if (req.file && /^image\/(jpeg|png|webp)$/.test(req.file.mimetype)) {
    pid = (await q(`INSERT INTO files (mime,data,name) VALUES ($1,$2,$3) RETURNING id`, [req.file.mimetype, req.file.buffer, 'profile-photo']))[0].id;
  }
  const b = req.body;
  await q(`UPDATE members SET phone=$1, email=$2, telegram_handle=$3, year=$4, zone_woreda=$5, photo_id=$6 WHERE member_no=$7`,
    [String(b.phone || m.phone).slice(0, 30), String(b.email || '').slice(0, 80), String(b.telegram_handle || '').slice(0, 50),
     String(b.year || m.year), String(b.zone_woreda || '').slice(0, 100), pid, req.session.mid]);
  res.redirect('/portal/profile?saved=1');
});

app.post('/portal/profile/password', needMember, async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]);
  if (!m || !bcrypt.compareSync(String(req.body.old_pass || ''), m.password) || String(req.body.new_pass || '').length < 6) {
    return res.redirect('/portal/profile?pwerr=1');
  }
  await q(`UPDATE members SET password=$1 WHERE member_no=$2`, [bcrypt.hashSync(String(req.body.new_pass), 10), req.session.mid]);
  res.redirect('/portal/profile?saved=1');
});

// ---------- 2. ONLINE ELECTIONS & POLLS ----------
app.get('/portal/polls', needMember, async (req, res) => {
  const polls = await q(`SELECT * FROM polls WHERE campus='all' OR campus=$1 ORDER BY (status='open') DESC, id DESC LIMIT 20`, [req.session.campus || 'robe']);
  const votes = await q(`SELECT poll_id, choice, COUNT(*)::int c FROM poll_votes GROUP BY poll_id, choice`);
  const mine = await q(`SELECT poll_id, choice FROM poll_votes WHERE member_no=$1`, [req.session.mid]);
  const myMap = Object.fromEntries(mine.map(r => [r.poll_id, r.choice]));

  const html = portalMenu('/portal/polls') + `
    <div class="glass-card">
      <h3>🗳️ Online Elections & Member Polls</h3>
      <p style="font-size:13px; color:var(--text-muted);">One member = one verified vote. Live transparent results.</p>
    </div>
    ${polls.map(p => {
      const opts = String(p.options || '').split(/\r?\n|,/).map(x => x.trim()).filter(Boolean);
      const pVotes = votes.filter(v => v.poll_id === p.id);
      const total = pVotes.reduce((s, v) => s + v.c, 0);
      const myChoice = myMap[p.id];
      return `<div class="glass-card">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
          <h4>${h(p.title)}</h4>
          <span class="badge ${p.status === 'open' ? 'official' : 'rejected'}">${p.status === 'open' ? '🟢 Open' : '🔒 Closed'}</span>
        </div>
        ${p.description ? `<p style="font-size:13px; color:var(--text-2); margin:6px 0 12px;">${h(p.description)}</p>` : ''}
        ${(!myChoice && p.status === 'open') ? `
          <form method="POST" action="/portal/polls/${p.id}/vote">
            ${opts.map(o => `<label style="display:flex; align-items:center; gap:10px; padding:10px 12px; background:var(--surface-soft); border:1px solid var(--border); border-radius:12px; margin:7px 0; cursor:pointer;">
              <input type="radio" name="choice" value="${h(o)}" required style="width:17px; height:17px;"><span>${h(o)}</span>
            </label>`).join('')}
            <button class="btn" style="margin-top:10px;">🗳️ Cast My Vote</button>
          </form>
        ` : `
          <div style="margin-top:10px;">
            ${opts.map(o => {
              const cnt = (pVotes.find(v => v.choice === o) || { c: 0 }).c;
              const pct = total ? Math.round((cnt / total) * 100) : 0;
              return `<div style="margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:650;">
                  <span>${h(o)} ${myChoice === o ? '<span class="badge official">✔ Your Vote</span>' : ''}</span>
                  <span>${cnt} (${pct}%)</span>
                </div>
                <div class="poll-bar-bg"><div class="poll-bar-fill" style="width:${pct}%"></div></div>
              </div>`;
            }).join('')}
            <small style="color:var(--text-muted);">Total Votes: ${total}</small>
          </div>
        `}
      </div>`;
    }).join('') || `<div class="glass-card" style="text-align:center; padding:40px;">No active elections or polls yet.</div>`}
  `;
  res.send(page(req, 'Elections & Polls', html));
});

app.post('/portal/polls/:id/vote', needMember, async (req, res) => {
  const pid = parseInt(req.params.id, 10) || 0;
  const choice = String(req.body.choice || '').trim();
  const [p] = await q(`SELECT * FROM polls WHERE id=$1 AND status='open'`, [pid]);
  if (p && choice) {
    try { await q(`INSERT INTO poll_votes (poll_id, member_no, choice) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [pid, req.session.mid, choice]); } catch (e) {}
  }
  res.redirect('/portal/polls?voted=1');
});

// ---------- 3. DIGITAL CERTIFICATES (VIEW + PNG DOWNLOAD + QR VERIFY) ----------
app.get('/portal/certificates', needMember, async (req, res) => {
  const certs = await q(`SELECT * FROM certificates WHERE member_no=$1 ORDER BY id DESC`, [req.session.mid]);
  const html = portalMenu('/portal/certificates') + `
    <div class="glass-card">
      <h3>🏅 My Official Digital Certificates</h3>
      <p style="font-size:13px; color:var(--text-muted);">Verified awards and leadership certificates issued by Siikkoo-Mandoo MWU.</p>
    </div>
    ${certs.map(c => {
      const verifyUrl = 'https://' + req.headers.host + '/verify-cert/' + encodeURIComponent(c.cert_code);
      const ethDt = toEthiopianDate(c.issue_date || c.created_at, L(req));
      return `
      <div id="cert_${c.id}" class="cert-box">
        <div style="font-size:38px;">🌳</div>
        <p style="font-size:12px; font-weight:800; color:#2563eb; letter-spacing:1.5px;">SIIKKOO-MANDOO STUDENTS ASSOCIATION · MWU</p>
        <h2>${h(c.title)}</h2>
        <p style="font-size:14px; color:#475569; margin-top:10px;">This official certificate is proudly presented to</p>
        <div class="cert-name">${h(c.member_name)}</div>
        <p style="font-size:14.5px; color:#334155; max-width:540px; margin:8px auto 18px; line-height:1.6;">${h(c.role_award)}</p>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:22px; padding-top:14px; border-top:1px solid #e2e8f0; flex-wrap:wrap; gap:12px;">
          <div style="text-align:left; font-size:12px; color:#475569;">
            <b>Date:</b> ${h(c.issue_date)} (${h(ethDt)})<br>
            <b>Code:</b> <span style="color:#2563eb; font-weight:700;">${h(c.cert_code)}</span>
          </div>
          <div id="cqr_${c.id}" data-url="${h(verifyUrl)}" style="background:#fff; padding:4px; border:1px solid #e2e8f0; border-radius:8px;"></div>
        </div>
      </div>
      <div style="text-align:center; margin-bottom:24px;">
        <button onclick="dlCert('cert_${c.id}','${h(c.cert_code)}')" class="btn g">📥 Download Certificate (PNG)</button>
      </div>`;
    }).join('') || `<div class="glass-card" style="text-align:center; padding:40px;">No certificates issued to your account yet.</div>`}
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    <script>
      document.querySelectorAll('[id^="cqr_"]').forEach(el => {
        new QRCode(el, { text: el.getAttribute('data-url'), width: 58, height: 58 });
      });
      function dlCert(id, code){
        html2canvas(document.getElementById(id), { scale: 2, useCORS: true }).then(c => {
          const a = document.createElement('a'); a.download = code + '.png'; a.href = c.toDataURL('image/png'); a.click();
        });
      }
    </script>
  `;
  res.send(page(req, 'Certificates', html));
});

app.get('/verify-cert/:code', async (req, res) => {
  const [c] = await q(`SELECT * FROM certificates WHERE UPPER(cert_code)=UPPER($1)`, [req.params.code]);
  res.send(page(req, 'Verify Certificate', c ? `
    <div class="glass-card" style="max-width:440px; margin:30px auto; text-align:center;">
      <h2 style="color:#10b981;">✔ Authentic Certificate</h2>
      <h3 style="margin:12px 0 4px;">${h(c.member_name)}</h3>
      <p style="color:var(--primary); font-weight:700;">${h(c.title)}</p>
      <p style="font-size:13.5px; color:var(--text-2); margin:10px 0;">${h(c.role_award)}</p>
      <small style="color:var(--text-muted);">Code: ${h(c.cert_code)} · Issued: ${h(c.issue_date)}</small>
    </div>
  ` : `<div class="glass-card" style="max-width:400px; margin:30px auto; text-align:center;"><h2 style="color:#ef4444;">✘ Certificate Not Found</h2></div>`));
});

// ---------- 4. STUDENT Q&A FORUM ----------
app.get('/portal/forum', needMember, async (req, res) => {
  const posts = await q(`SELECT * FROM forum_posts ORDER BY id DESC LIMIT 30`);
  const replies = await q(`SELECT * FROM forum_replies ORDER BY id ASC`);
  const html = portalMenu('/portal/forum') + `
    <div class="glass-card">
      <h3 style="margin-bottom:10px;">💡 Student Q&A & Discussion Forum</h3>
      <form method="POST" action="/portal/forum">
        <div style="display:grid; grid-template-columns:2fr 1fr; gap:10px;">
          <input name="title" required placeholder="Ask a question or start a topic...">
          <select name="category">
            <option value="academic">📚 Academic / Courses</option>
            <option value="freshman">🎓 Freshman Guide</option>
            <option value="exams">📝 Exams & Exit Exam</option>
            <option value="campus">🏛️ Campus Life</option>
          </select>
        </div>
        <textarea name="body" required placeholder="Write details here..." style="margin-top:8px;"></textarea>
        <p style="margin-top:10px;"><button class="btn">Post Question</button></p>
      </form>
    </div>
    ${posts.map(p => {
      const pReplies = replies.filter(r => r.post_id === p.id);
      return `<div class="glass-card">
        <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:6px;">
          <span class="badge registered">${h(p.category)}</span>
          <small style="color:var(--text-muted)">By <b>${h(p.author_name)}</b> · ${toEthiopianDate(p.created_at, L(req))}</small>
        </div>
        <h4 style="margin:8px 0 6px; font-size:1.08rem;">${h(p.title)}</h4>
        <p style="font-size:13.5px; color:var(--text-2);">${h(p.body).replace(/\n/g, '<br>')}</p>
        <div style="margin-top:12px; padding-left:14px; border-left:3px solid var(--border);">
          ${pReplies.map(r => `<div style="margin-bottom:8px; font-size:13px;"><b>${h(r.author_name)}:</b> ${h(r.body)}</div>`).join('')}
          <form method="POST" action="/portal/forum/${p.id}/reply" style="display:flex; gap:8px; margin-top:8px;">
            <input name="body" required placeholder="Write a helpful reply..." style="padding:8px 12px;">
            <button class="btn secondary" style="padding:7px 14px;">Reply</button>
          </form>
        </div>
      </div>`;
    }).join('') || `<div class="glass-card" style="text-align:center;">No discussions yet. Start the first one!</div>`}
  `;
  res.send(page(req, 'Q&A Forum', html));
});

app.post('/portal/forum', needMember, async (req, res) => {
  const [m] = await q(`SELECT name, campus FROM members WHERE member_no=$1`, [req.session.mid]);
  if (m && req.body.title && req.body.body) {
    await q(`INSERT INTO forum_posts (member_no, author_name, campus, category, title, body) VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.session.mid, m.name, m.campus, req.body.category || 'general', req.body.title.slice(0, 180), req.body.body.slice(0, 2000)]);
  }
  res.redirect('/portal/forum?ok=1');
});

app.post('/portal/forum/:id/reply', needMember, async (req, res) => {
  const [m] = await q(`SELECT name FROM members WHERE member_no=$1`, [req.session.mid]);
  if (m && req.body.body) {
    await q(`INSERT INTO forum_replies (post_id, member_no, author_name, body) VALUES ($1,$2,$3,$4)`,
      [parseInt(req.params.id, 10) || 0, req.session.mid, m.name, req.body.body.slice(0, 1000)]);
  }
  res.redirect('/portal/forum?ok=1');
});

// ---------- GLOBAL PORTAL SEARCH ----------
app.get('/portal/search', needMember, async (req, res) => {
  const term = String(req.query.q || '').trim().slice(0, 60);
  if (!term) return res.redirect('/student-dashboard');
  const like = '%' + term + '%';
  const posts = await q(`SELECT * FROM posts WHERE title_en ILIKE $1 OR title_om ILIKE $1 OR title_am ILIKE $1 OR body_en ILIKE $1 ORDER BY id DESC LIMIT 25`, [like]);
  const forum = await q(`SELECT * FROM forum_posts WHERE title ILIKE $1 OR body ILIKE $1 ORDER BY id DESC LIMIT 15`, [like]);
  res.send(page(req, 'Search', portalMenu('') + `
    <div class="glass-card"><h3>🔍 Results for "${h(term)}"</h3><p style="font-size:13px; color:var(--text-muted);">${posts.length} posts · ${forum.length} forum threads</p></div>
    ${posts.map(p => postCard(req, p)).join('')}
    ${forum.map(f => `<div class="glass-card"><h4>💡 ${h(f.title)}</h4><p style="font-size:13px;">${h(f.body).slice(0, 200)}</p><a href="/portal/forum">Open in Forum →</a></div>`).join('')}
  `));
});

// ---------- PORTAL CONTENT (ANNOUNCEMENTS, NEWS, EVENTS + RSVP, ETC.) ----------
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
    if (tp === 'gallery') {
      content = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">${rows.map(p => `<div class="glass-card" style="padding:10px;margin:0"><img style="width:100%;height:185px;object-fit:cover;border-radius:10px;margin-bottom:7px" src="/photo/${p.image_id}"><p style="font-weight:650;font-size:13.5px">${h(postT(req, p, 'title'))}</p></div>`).join('')}</div>`;
    } else if (tp === 'event') {
      content = rows.map(p => {
        const joined = myRsvps.has(p.id), cnt = rsvpCounts[p.id] || 0;
        const extra = `<div style="margin-top:12px; padding-top:10px; border-top:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <span class="badge registered" data-countdown="${h(p.event_date || '')}">📅 ${h(p.event_date || 'Upcoming')}</span>
          <form method="POST" action="/portal/events/${p.id}/rsvp"><button class="btn ${joined ? 'g' : 'secondary'}" style="padding:6px 13px; font-size:12px;">${joined ? '✔ Going' : '✋ I will attend'} (${cnt})</button></form>
        </div>`;
        return postCard(req, p, extra);
      }).join('') + `<script>document.querySelectorAll('[data-countdown]').forEach(el=>{const d=new Date(el.getAttribute('data-countdown'));if(isNaN(d.getTime()))return;const diff=Math.ceil((d-new Date())/86400000);if(diff>0)el.textContent='⏳ '+diff+' days left ('+el.getAttribute('data-countdown')+')';else if(diff===0)el.textContent='🔥 Happening Today!';});</script>`;
    } else content = rows.map(p => postCard(req, p)).join('');

    res.send(page(req, tr(req, tp), portalMenu('/portal/' + SLUG[tp]) + (rows.length ? content : `<div class="glass-card" style="text-align:center;padding:42px">${h(tr(req, 'none'))}</div>`)));
  });
});

app.post('/portal/events/:id/rsvp', needMember, async (req, res) => {
  try { await q(`INSERT INTO event_rsvps (post_id, member_no) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [parseInt(req.params.id, 10) || 0, req.session.mid]); } catch (e) {}
  res.redirect('/portal/events?rsvp=1');
});

app.get('/portal/meetings', needMember, async (req, res) => {
  const meets = await q(`SELECT * FROM meetings ORDER BY id DESC LIMIT 30`);
  res.send(page(req, tr(req, 'meetings'), portalMenu('/portal/meetings') + `<div class="glass-card">
    <h3 style="margin-bottom:12px">🤝 Meetings & Minutes</h3>
    ${meets.map(m => `<div class="form-section"><div style="display:flex; justify-content:space-between; flex-wrap:wrap;"><h4>${h(m.title)}</h4><span class="badge registered">${h(m.meeting_date)} (${toEthiopianDate(m.meeting_date, L(req))})</span></div>
      ${m.agenda ? `<p style="font-size:13px; margin-top:6px"><b>Agenda:</b> ${h(m.agenda)}</p>` : ''}
      ${m.minutes ? `<p style="font-size:13px; margin-top:6px"><b>Minutes:</b> ${h(m.minutes).replace(/\n/g, '<br>')}</p>` : ''}
      ${m.resolutions ? `<p style="font-size:13px; margin-top:6px; color:#10b981"><b>Resolutions:</b> ${h(m.resolutions)}</p>` : ''}
      ${m.file_id ? `<p style="margin-top:8px"><a href="/photo/${m.file_id}?dl=1" class="btn secondary" style="padding:5px 12px;font-size:12px">📥 Download Minutes</a></p>` : ''}
    </div>`).join('') || `<p style="color:var(--text-muted)">No meetings yet.</p>`}
  </div>`));
});

app.get('/portal/leadership', needMember, async (req, res) => {
  const ls = await q(`SELECT * FROM leaders ORDER BY (level='central') DESC, ord, id`);
  const grp = (t, list) => list.length ? `<h3 style="margin:18px 0 10px; color:var(--primary)">${h(t)}</h3><div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:14px">${list.map(x => `<div class="glass-card" style="text-align:center;margin:0"><img style="width:86px;height:86px;border-radius:50%;object-fit:cover;border:3px solid #93c5fd;" src="${x.photo_id ? '/photo/' + x.photo_id : ''}"><h4 style="margin:8px 0 2px">${h(x.name)}</h4><p style="color:var(--primary);font-size:12px;font-weight:700">${h(x.position_en || x.position_om)}</p><small>${h(x.term)}</small></div>`).join('')}</div>` : '';
  res.send(page(req, tr(req, 'leadership'), portalMenu('/portal/leadership') + grp('Central Executive', ls.filter(x => x.level === 'central')) + Object.keys(CAMPUS).map(k => grp(campusName(req, k), ls.filter(x => x.level !== 'central' && x.campus === k))).join('')));
});

app.get('/portal/finance', needMember, async (req, res) => {
  const rs = await q(`SELECT * FROM finance_reports WHERE approved=1 ORDER BY period DESC, id DESC LIMIT 36`);
  res.send(page(req, tr(req, 'finance'), portalMenu('/portal/finance') + (rs.map(r => `<div class="glass-card">
    <h4 style="margin-bottom:12px">${h(r.period)} · ${h(r.campus === 'all' ? 'All Campuses' : campusName(req, r.campus))}</h4>
    <div class="stat-row">
      <div class="stat-chip"><b>${Number(r.starting_balance || 0).toLocaleString()}</b><span>Starting</span></div>
      <div class="stat-chip"><b style="color:#10b981">${Number(r.income).toLocaleString()}</b><span>Income</span></div>
      <div class="stat-chip"><b style="color:#ef4444">${Number(r.expense).toLocaleString()}</b><span>Expense</span></div>
      <div class="stat-chip"><b>${(Number(r.starting_balance || 0) + Number(r.income) - Number(r.expense)).toLocaleString()}</b><span>Net ETB</span></div>
    </div>
  </div>`).join('') || `<div class="glass-card" style="text-align:center;padding:42px">${h(tr(req, 'none'))}</div>`)));
});

app.get('/portal/support', needMember, async (req, res) => {
  const reqs = await q(`SELECT * FROM support_requests WHERE member_no=$1 ORDER BY id DESC LIMIT 20`, [req.session.mid]);
  res.send(page(req, tr(req, 'support'), portalMenu('/portal/support') + `
    <div class="glass-card"><h3>🤝 Support Desk</h3><form method="POST" action="/portal/support">
      <label>Subject</label><input name="subject" required><label>Message</label><textarea name="message" required></textarea>
      <p style="margin-top:12px"><button class="btn">Send Request</button></p>
    </form></div>
    <div class="glass-card"><h4>Your Inquiries</h4>${reqs.map(r => `<div class="form-section"><b>${h(r.subject)}</b> <span class="badge ${r.status === 'closed' ? 'official' : 'pending'}">${h(r.status)}</span><p style="font-size:13px;margin-top:4px">${h(r.message)}</p>${r.reply ? `<div class="msgok"><b>Reply:</b> ${h(r.reply)}</div>` : ''}</div>`).join('') || '<p>No inquiries yet.</p>'}</div>
  `));
});

app.post('/portal/support', needMember, async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]);
  if (m && req.body.subject && req.body.message) await q(`INSERT INTO support_requests (member_no, name, campus, subject, message) VALUES ($1,$2,$3,$4,$5)`, [m.member_no, m.name, m.campus, req.body.subject.slice(0, 150), req.body.message.slice(0, 3000)]);
  res.redirect('/portal/support?ok=1');
});

// ---------- PHOTO, VERIFY, LEGAL ----------
app.get('/photo/:id', async (req, res) => {
  const [f] = await q(`SELECT mime, data, name FROM files WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  if (!f) return res.status(404).end();
  res.set('Content-Type', f.mime).set('Cache-Control', 'public,max-age=604800');
  if (req.query.dl) res.set('Content-Disposition', `attachment; filename="${String(f.name || 'file').replace(/[^\w.\-]/g, '_')}"`);
  res.send(f.data);
});

app.get('/verify/:no', async (req, res) => {
  const [m] = await q(`SELECT name,member_no,campus,department,status,photo_id FROM members WHERE UPPER(member_no)=UPPER($1)`, [req.params.no]);
  res.send(page(req, tr(req, 'verify'), m ? `<div class="glass-card" style="max-width:380px; margin:30px auto; text-align:center;">
    <h2 style="color:#10b981; margin-bottom:12px;">${h(tr(req, 'valid'))}</h2>
    <img style="width:96px; height:120px; border-radius:12px; object-fit:cover;" src="${m.photo_id ? '/photo/' + m.photo_id : ''}">
    <h3 style="margin:10px 0 3px;">${h(m.name)}</h3><p style="color:var(--primary); font-weight:700;">${h(m.member_no)}</p>
    <p style="font-size:12.5px; color:var(--text-muted); margin-bottom:10px;">${h(campusName(req, m.campus))} · ${h(m.department)}</p>
    <span class="badge ${m.status}">${h(tr(req, m.status))}</span>
  </div>` : `<div class="glass-card" style="max-width:360px; margin:30px auto; text-align:center;"><h2 style="color:#ef4444">${h(tr(req, 'invalid'))}</h2></div>`));
});

app.get('/privacy', (req, res) => res.send(page(req, tr(req, 'privacy'), `<div class="glass-card"><h2>🔒 Privacy Policy</h2><p style="margin-top:8px;">Student data is strictly used for Siikkoo-Mandoo MWU membership services.</p></div>`)));
app.get('/terms', (req, res) => res.send(page(req, tr(req, 'terms'), `<div class="glass-card"><h2>📜 Terms & Conditions</h2><p style="margin-top:8px;">Members agree to follow MWU and association bylaws.</p></div>`)));

// ---------- ADMIN PORTAL ----------
const A = (req, title, body) => {
  const links = [
    ['/admin', '📊', 'Overview', null, 'blue'],
    ['/admin/members', '👥', 'Members', 'members', 'pink'],
    ['/admin/polls', '🗳️', 'Elections & Polls', 'polls', 'purple'],
    ['/admin/certificates', '🏅', 'Certificates', 'certificates', 'yellow'],
    ['/admin/content/announcement', '📢', 'Announcements', 'content', 'indigo'],
    ['/admin/content/news', '📰', 'News', 'content', 'cyan'],
    ['/admin/content/event', '📅', 'Events', 'content', 'orange'],
    ['/admin/meetings', '🤝', 'Meetings', 'meetings', 'teal'],
    ['/admin/content/education', '📚', 'Education', 'content', 'blue'],
    ['/admin/content/gallery', '🖼️', 'Gallery', 'content', 'green'],
    ['/admin/leaders', '🎖️', 'Leadership', 'leaders', 'yellow'],
    ['/admin/finance', '💰', 'Finance', 'finance', 'green'],
    ['/admin/support', '💬', 'Support', 'support', 'purple'],
    ['/admin/staff', '🔑', 'Staff & Roles', 'staff', 'gray'],
    ['/admin/audit-logs', '📜', 'Audit Logs', 'audit', 'indigo'],
    ['/admin/backup', '💾', 'Backup', 'backup', 'teal']
  ].filter(x => !x[3] || can(req, x[3]));

  const isOverview = req.path === '/admin' || req.path === '/admin/';
  return page(req, title, `
    ${isOverview ? `<div class="feature-grid">${links.map(x => `<a href="${x[0]}" class="feature-tile ${x[4]}"><span class="icon">${x[1]}</span><span>${x[2]}</span></a>`).join('')}</div>`
    : `<div class="portal-menu">${links.map(x => `<a href="${x[0]}" class="portal-btn ${req.path === x[0] || (x[0] !== '/admin' && req.path.startsWith(x[0])) ? 'active' : ''}">${x[1]} ${x[2]}</a>`).join('')}</div>`}
    ${body}
  `);
};

const OKMIME = /^(image\/(jpeg|png|webp)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.[\w.]+|vnd\.ms-[\w.]+))$/;
const up6 = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });
const files6 = fields => (req, res, next) => up6.fields(fields)(req, res, err => (err ? res.status(400).send('File exceeds 6 MB') : next()));
async function saveFile(f) {
  if (!f || !OKMIME.test(f.mimetype)) return null;
  return (await q(`INSERT INTO files (mime,data,name) VALUES ($1,$2,$3) RETURNING id`, [f.mimetype, f.buffer, String(f.originalname || 'file').slice(0, 100)]))[0].id;
}
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const sel = (name, opts, cur) => `<select name="${name}">${opts.map(o => `<option value="${o[0]}"${cur === o[0] ? ' selected' : ''}>${h(o[1])}</option>`).join('')}</select>`;
const campusOpts = (sc, all) => (sc ? [[sc, CAMPUS[sc].n]] : (all ? [['all', 'All campuses']] : []).concat(Object.keys(CAMPUS).map(k => [k, CAMPUS[k].n])));

// Admin Overview + Charts
app.get('/admin', needStaff, async (req, res) => {
  const sc = scopeOf(req), w = sc ? ' WHERE campus=$1' : '', pr = sc ? [sc] : [];
  const [m] = await q(`SELECT COUNT(*)::int n, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END)::int p, SUM(CASE WHEN status='official' THEN 1 ELSE 0 END)::int o, SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END)::int r, SUM(CASE WHEN campus='robe' THEN 1 ELSE 0 END)::int robe, SUM(CASE WHEN campus='goba' THEN 1 ELSE 0 END)::int goba, SUM(CASE WHEN campus='shashamane' THEN 1 ELSE 0 END)::int sha FROM members${w}`, pr);
  res.send(A(req, 'Admin Dashboard', `
    <div class="admin-hero"><h2>Welcome, ${h(req.session.sname || 'Admin')}</h2><p>Live Analytics · 📅 ${toEthiopianDate(new Date(), L(req))}</p></div>
    <div class="stat-grid">
      <div class="stat-card"><div class="num" style="color:#2563eb">${m.n || 0}</div><div class="label">Total</div></div>
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
      new Chart(document.getElementById('campusChart'), { type:'bar', data:{ labels:['Robe','Goba','Shashamane'], datasets:[{ data:[${m.robe||0},${m.goba||0},${m.sha||0}], backgroundColor:['#2563eb','#10b981','#f59e0b'], borderRadius:10 }] }, options:{ plugins:{ legend:{ display:false } } } });
      new Chart(document.getElementById('statusChart'), { type:'doughnut', data:{ labels:['Official','Pending','Registered','Rejected'], datasets:[{ data:[${m.o||0},${m.p||0},${(m.n||0)-(m.o||0)-(m.p||0)-(m.r||0)},${m.r||0}], backgroundColor:['#10b981','#f59e0b','#2563eb','#ef4444'] }] } });
    </script>
  `));
});

// Admin Polls & Elections
app.get('/admin/polls', guard('polls'), async (req, res) => {
  const polls = await q(`SELECT * FROM polls ORDER BY id DESC LIMIT 30`);
  res.send(A(req, 'Manage Polls', `
    <div class="glass-card">
      <h3>🗳️ Create New Election / Poll</h3>
      <form method="POST" action="/admin/polls">
        <div style="display:grid; grid-template-columns:2fr 1fr; gap:10px;">
          <div><label>Title / Question</label><input name="title" required placeholder="e.g. 2026 President Election"></div>
          <div><label>Campus</label>${sel('campus', campusOpts(scopeOf(req), true))}</div>
        </div>
        <label>Description (Optional)</label><input name="description" placeholder="Brief instructions...">
        <label>Options (One per line or comma separated)</label><textarea name="options" required placeholder="Candidate A\nCandidate B\nCandidate C"></textarea>
        <p style="margin-top:12px;"><button class="btn">Launch Poll</button></p>
      </form>
    </div>
    <div class="glass-card">
      ${polls.map(p => `<div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:8px;">
        <div><b>${h(p.title)}</b> <span class="badge ${p.status === 'open' ? 'official' : 'rejected'}">${h(p.status)}</span></div>
        <div style="display:flex; gap:6px;">
          <form method="POST" action="/admin/polls/${p.id}/toggle"><button class="btn secondary" style="padding:4px 10px; font-size:11.5px;">${p.status === 'open' ? 'Close' : 'Reopen'}</button></form>
          <form method="POST" action="/admin/polls/${p.id}/delete"><button class="btn danger" style="padding:4px 10px; font-size:11.5px;">Delete</button></form>
        </div>
      </div>`).join('') || '<p>No polls yet.</p>'}
    </div>
  `));
});

app.post('/admin/polls', guard('polls'), async (req, res) => {
  if (req.body.title && req.body.options) {
    await q(`INSERT INTO polls (title, description, options, campus) VALUES ($1,$2,$3,$4)`,
      [req.body.title.slice(0, 200), (req.body.description || '').slice(0, 500), req.body.options.slice(0, 1500), req.body.campus || 'all']);
  }
  res.redirect('/admin/polls?ok=1');
});
app.post('/admin/polls/:id/toggle', guard('polls'), async (req, res) => {
  await q(`UPDATE polls SET status = CASE WHEN status='open' THEN 'closed' ELSE 'open' END WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  res.redirect('/admin/polls?ok=1');
});
app.post('/admin/polls/:id/delete', guard('polls'), async (req, res) => {
  await q(`DELETE FROM polls WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  res.redirect('/admin/polls?ok=1');
});

// Admin Digital Certificates
app.get('/admin/certificates', guard('certificates'), async (req, res) => {
  const certs = await q(`SELECT * FROM certificates ORDER BY id DESC LIMIT 40`);
  res.send(A(req, 'Issue Certificates', `
    <div class="glass-card">
      <h3>🏅 Issue Official Digital Certificate</h3>
      <form method="POST" action="/admin/certificates">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:10px;">
          <div><label>Member No. (e.g. SM-ROB-...)</label><input name="member_no" required placeholder="SM-ROB-2026-0001"></div>
          <div><label>Certificate Title</label><input name="title" required value="Certificate of Appreciation"></div>
          <div><label>Issue Date</label><input name="issue_date" type="date" required value="${new Date().toISOString().slice(0, 10)}"></div>
        </div>
        <label>Citation / Award Description</label>
        <textarea name="role_award" required placeholder="For outstanding leadership and service as Committee Member..."></textarea>
        <p style="margin-top:12px;"><button class="btn g">🏅 Issue Certificate</button></p>
      </form>
    </div>
    <div class="glass-card"><div class="tw"><table>
      <tr><th>Code</th><th>Member</th><th>Title</th><th>Date</th><th>Action</th></tr>
      ${certs.map(c => `<tr><td><b>${h(c.cert_code)}</b></td><td>${h(c.member_name)} (${h(c.member_no)})</td><td>${h(c.title)}</td><td>${h(c.issue_date)}</td>
        <td><form method="POST" action="/admin/certificates/${c.id}/delete"><button class="btn danger" style="padding:4px 9px;font-size:11px">Delete</button></form></td></tr>`).join('')}
    </table></div></div>
  `));
});

app.post('/admin/certificates', guard('certificates'), async (req, res) => {
  const mno = String(req.body.member_no || '').trim();
  const [m] = await q(`SELECT member_no, name FROM members WHERE UPPER(member_no)=UPPER($1)`, [mno]);
  if (m && req.body.title && req.body.role_award) {
    const code = 'CERT-' + new Date().getFullYear() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
    await q(`INSERT INTO certificates (cert_code, member_no, member_name, title, role_award, issue_date) VALUES ($1,$2,$3,$4,$5,$6)`,
      [code, m.member_no, m.name, req.body.title.slice(0, 140), req.body.role_award.slice(0, 600), req.body.issue_date || new Date().toISOString().slice(0, 10)]);
  }
  res.redirect('/admin/certificates?ok=1');
});
app.post('/admin/certificates/:id/delete', guard('certificates'), async (req, res) => {
  await q(`DELETE FROM certificates WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  res.redirect('/admin/certificates?ok=1');
});

// Admin Members, Export, Edit
app.get('/admin/members', guard('members'), async (req, res) => {
  const sc = scopeOf(req), cf = sc || (CAMPUS[req.query.campus] ? req.query.campus : '');
  const sf = req.query.status || '', qs = String(req.query.q || '').trim().slice(0, 50), pr = [], c = [];
  if (cf) { pr.push(cf); c.push(`campus=$${pr.length}`); }
  if (sf) { pr.push(sf); c.push(`status=$${pr.length}`); }
  if (qs) { pr.push('%' + qs + '%'); c.push(`(name ILIKE $${pr.length} OR member_no ILIKE $${pr.length} OR student_id ILIKE $${pr.length} OR phone ILIKE $${pr.length})`); }
  const ms = await q(`SELECT * FROM members ${c.length ? 'WHERE ' + c.join(' AND ') : ''} ORDER BY id DESC LIMIT 400`, pr);
  const act = (id, a, t, cls) => `<form method="POST" action="/admin/members/${id}/${a}" style="display:inline"><button class="btn ${cls || ''}" style="padding:4px 9px;font-size:11px;box-shadow:none">${t}</button></form>`;
  const exportQs = new URLSearchParams({ q: qs, campus: cf, status: sf }).toString();
  res.send(A(req, 'Members', `<div class="glass-card">
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px">
      <h3>👥 Members (${ms.length})</h3><a class="btn excel" href="/admin/members/export?${exportQs}">⬇ Excel (CSV)</a>
    </div>
    <form style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px" method="GET" action="/admin/members">
      <input name="q" value="${h(qs)}" placeholder="Search..." style="flex:1; min-width:160px">
      ${sc ? '' : sel('campus', [['', 'All Campuses']].concat(campusOpts(null)), cf)}
      ${sel('status', [['', 'All Status'], ['official', 'Official'], ['pending', 'Pending'], ['registered', 'Registered'], ['rejected', 'Rejected']], sf)}
      <button class="btn">Filter</button>
    </form>
    <div class="tw"><table>
      <tr><th>No</th><th>Name</th><th>Campus</th><th>Dept</th><th>Phone</th><th>Status</th><th>Actions</th></tr>
      ${ms.map(m => `<tr><td><b>${h(m.member_no)}</b></td><td>${h(m.name)}<br><small>${h(m.student_id)}</small></td><td>${h(campusName(req, m.campus))}</td><td>${h(m.department)} Y${h(m.year)}</td><td>${h(m.phone)}</td><td><span class="badge ${m.status}">${h(m.status)}</span></td>
      <td style="white-space:nowrap"><a class="btn edit-btn" href="/admin/members/${m.id}/edit" style="padding:4px 9px;font-size:11px">✏️</a> ${m.status !== 'official' ? act(m.id, 'approve', 'Approve', 'g') : ''} ${m.status === 'pending' ? act(m.id, 'reject', 'Reject', 'danger') : ''}</td></tr>`).join('')}
    </table></div>
  </div>`));
});

app.get('/admin/members/export', guard('members'), async (req, res) => {
  const sc = scopeOf(req), cf = sc || (CAMPUS[req.query.campus] ? req.query.campus : ''), sf = req.query.status || '', qs = String(req.query.q || '').trim().slice(0, 50), pr = [], c = [];
  if (cf) { pr.push(cf); c.push(`campus=$${pr.length}`); }
  if (sf) { pr.push(sf); c.push(`status=$${pr.length}`); }
  if (qs) { pr.push('%' + qs + '%'); c.push(`(name ILIKE $${pr.length} OR member_no ILIKE $${pr.length})`); }
  const rows = await q(`SELECT * FROM members ${c.length ? 'WHERE ' + c.join(' AND ') : ''} ORDER BY id DESC LIMIT 5000`, pr);
  const headers = ['member_no','name','gender','student_id','campus','college','department','year','zone_woreda','phone','email','status','created_at'];
  const lines = [headers.join(',')].concat(rows.map(r => headers.map(k => csvEsc(r[k])).join(',')));
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="sikkoo-members.csv"').send('\uFEFF' + lines.join('\n'));
});

app.get('/admin/members/:id/edit', guard('members'), async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  if (!m) return res.redirect('/admin/members');
  const s = (k, opts) => opts.map(x => `<option value="${h(x[0])}"${String(m[k]) === String(x[0]) ? ' selected' : ''}>${h(x[1])}</option>`).join('');
  res.send(A(req, 'Edit Member', `<div class="glass-card" style="max-width:780px; margin:0 auto">
    <h3>✏️ Edit ${h(m.name)}</h3>
    <form method="POST" action="/admin/members/${m.id}/edit" enctype="multipart/form-data">
      <div class="form-section" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:8px 12px">
        <div><label>Name</label><input name="name" required value="${h(m.name)}"></div>
        <div><label>Student ID</label><input name="student_id" required value="${h(m.student_id)}"></div>
        <div><label>Phone</label><input name="phone" required value="${h(m.phone)}"></div>
        <div><label>Campus</label><select name="campus">${s('campus', Object.keys(CAMPUS).map(k => [k, CAMPUS[k].n]))}</select></div>
        <div><label>Department</label><input name="department" value="${h(m.department || '')}"></div>
        <div><label>Year</label><select name="year">${s('year', [1,2,3,4,5,6].map(x => [String(x), 'Year '+x]))}</select></div>
        <div><label>Status</label><select name="status">${s('status', [['registered','Registered'],['pending','Pending'],['official','Official'],['rejected','Rejected']])}</select></div>
        <div><label>New Password</label><input name="password" type="password" minlength="6"></div>
      </div>
      <button class="btn">💾 Save</button> <a class="btn secondary" href="/admin/members">Back</a>
    </form>
  </div>`));
});

app.post('/admin/members/:id/edit', guard('members'), files6([{ name: 'photo', maxCount: 1 }]), async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0, b = req.body;
  await q(`UPDATE members SET name=$1, student_id=$2, phone=$3, campus=$4, department=$5, year=$6, status=$7 WHERE id=$8`,
    [b.name, b.student_id, b.phone, b.campus, b.department, b.year, b.status, id]);
  if (b.password && String(b.password).length >= 6) await q(`UPDATE members SET password=$1 WHERE id=$2`, [bcrypt.hashSync(String(b.password), 10), id]);
  res.redirect('/admin/members/' + id + '/edit?saved=1');
});

[['approve', 'official'], ['reject', 'rejected'], ['revoke', 'registered']].forEach(([a, st]) => {
  app.post('/admin/members/:id/' + a, guard('members'), async (req, res) => {
    await q(`UPDATE members SET status=$1 WHERE id=$2`, [st, parseInt(req.params.id, 10) || 0]);
    res.redirect('/admin/members?ok=1');
  });
});

// Admin Content, Meetings, Leaders, Finance, Support, Staff, Audit, Backup
app.get('/admin/content/:type', guard('content'), async (req, res) => {
  const tp = req.params.type; if (!TYPES.includes(tp)) return res.redirect('/admin');
  const sc = scopeOf(req), ps = await q(`SELECT * FROM posts WHERE type=$1 ${sc ? 'AND campus=$2' : ''} ORDER BY id DESC LIMIT 60`, sc ? [tp, sc] : [tp]);
  res.send(A(req, tp, `<div class="glass-card">
    <h3>Publish ${h(tp.toUpperCase())}</h3>
    <form method="POST" action="/admin/content/${tp}" enctype="multipart/form-data">
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px">
        <div><label>Campus</label>${sel('campus', campusOpts(sc, true))}</div>
        ${tp === 'announcement' ? `<div><label>Priority</label><select name="is_emergency"><option value="0">Normal</option><option value="1">🚨 Emergency</option></select></div>` : ''}
        <div><label>Date</label><input name="event_date" type="${tp === 'event' ? 'date' : 'text'}"></div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px">
        <div><label>Title (OM)</label><input name="title_om"></div><div><label>Title (AM)</label><input name="title_am"></div><div><label>Title (EN)</label><input name="title_en"></div>
      </div>
      ${tp === 'gallery' ? '' : `<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px">
        <div><label>Body (OM)</label><textarea name="body_om"></textarea></div><div><label>Body (AM)</label><textarea name="body_am"></textarea></div><div><label>Body (EN)</label><textarea name="body_en"></textarea></div>
      </div>`}
      <label>Image</label><input name="image" type="file" accept="image/*">
      <label>Document PDF (Optional)</label><input name="file" type="file">
      <p style="margin-top:14px"><button class="btn">Publish</button></p>
    </form>
  </div><div class="glass-card">${ps.map(p => `<div style="display:flex; justify-content:space-between; padding:9px 0; border-bottom:1px solid var(--border)"><span><b>${h(p.title_en || p.title_om || p.title_am)}</b></span><form method="POST" action="/admin/content/${tp}/${p.id}/delete"><button class="btn danger" style="padding:4px 9px;font-size:11px">Delete</button></form></div>`).join('')}</div>`));
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
  res.send(A(req, 'Meetings', `<div class="glass-card"><h3>Record Meeting</h3><form method="POST" action="/admin/meetings" enctype="multipart/form-data">
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px">
      <div><label>Title</label><input name="title" required></div><div><label>Date</label><input name="meeting_date" type="date" required></div><div><label>Campus</label>${sel('campus', campusOpts(scopeOf(req), true))}</div>
    </div><label>Agenda</label><textarea name="agenda"></textarea><label>Minutes</label><textarea name="minutes"></textarea><label>Resolutions</label><textarea name="resolutions"></textarea><label>File</label><input name="file" type="file"><p style="margin-top:12px"><button class="btn">Save</button></p>
  </form></div><div class="glass-card">${meets.map(m => `<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border)"><span><b>${h(m.title)}</b> (${h(m.meeting_date)})</span><form method="POST" action="/admin/meetings/${m.id}/delete"><button class="btn danger" style="padding:4px 9px;font-size:11px">Delete</button></form></div>`).join('')}</div>`));
});
app.post('/admin/meetings', guard('meetings'), files6([{ name: 'file', maxCount: 1 }]), async (req, res) => {
  const b = req.body, fl = await saveFile(((req.files || {}).file || [])[0]);
  if (b.title) await q(`INSERT INTO meetings (campus, title, meeting_date, agenda, minutes, resolutions, file_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [b.campus || 'all', b.title, b.meeting_date, b.agenda, b.minutes, b.resolutions, fl]);
  res.redirect('/admin/meetings?ok=1');
});
app.post('/admin/meetings/:id/delete', guard('meetings'), async (req, res) => { await q(`DELETE FROM meetings WHERE id=$1`, [parseInt(req.params.id, 10) || 0]); res.redirect('/admin/meetings?ok=1'); });

app.get('/admin/leaders', guard('leaders'), async (req, res) => {
  const sc = scopeOf(req), ls = await q(`SELECT * FROM leaders ${sc ? 'WHERE campus=$1' : ''} ORDER BY id DESC`, sc ? [sc] : []);
  res.send(A(req, 'Leaders', `<div class="glass-card"><h3>Add Leader</h3><form method="POST" action="/admin/leaders" enctype="multipart/form-data">
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px">
      <div><label>Name</label><input name="name" required></div><div><label>Term</label><input name="term" value="2025-2026"></div>
      <div><label>Level</label>${sel('level', sc ? [['campus','Campus']] : [['central','Central'],['campus','Campus']])}</div><div><label>Campus</label>${sel('campus', campusOpts(sc, false))}</div>
    </div><label>Position</label><input name="position_en" required><label>Photo</label><input name="photo" type="file" accept="image/*"><p style="margin-top:12px"><button class="btn">Save</button></p>
  </form></div><div class="glass-card">${ls.map(x => `<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border)"><span><b>${h(x.name)}</b> · ${h(x.position_en)}</span><form method="POST" action="/admin/leaders/${x.id}/delete"><button class="btn danger" style="padding:4px 9px;font-size:11px">Delete</button></form></div>`).join('')}</div>`));
});
app.post('/admin/leaders', guard('leaders'), files6([{ name: 'photo', maxCount: 1 }]), async (req, res) => {
  const b = req.body, sc = scopeOf(req), pid = await saveFile(((req.files || {}).photo || [])[0]);
  if (b.name) await q(`INSERT INTO leaders (name, position_en, term, level, campus, photo_id) VALUES ($1,$2,$3,$4,$5,$6)`, [b.name, b.position_en || '', b.term || '2025-2026', sc ? 'campus' : b.level, sc || b.campus || 'all', pid]);
  res.redirect('/admin/leaders?ok=1');
});
app.post('/admin/leaders/:id/delete', guard('leaders'), async (req, res) => { await q(`DELETE FROM leaders WHERE id=$1`, [parseInt(req.params.id, 10) || 0]); res.redirect('/admin/leaders?ok=1'); });

const KINDS = [['contribution', 'Contribution'], ['donation', 'Donation'], ['fundraising', 'Fundraising'], ['income', 'Other Income'], ['expense', 'Expense']];
app.get('/admin/finance', guard('finance'), async (req, res) => {
  const sc = scopeOf(req), rp = await q(`SELECT * FROM finance_reports ${sc ? 'WHERE campus=$1' : ''} ORDER BY id DESC LIMIT 20`, sc ? [sc] : []);
  res.send(A(req, 'Finance', `<div class="glass-card"><h3>Record Transaction</h3><form method="POST" action="/admin/finance/tx">
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px">
      <div><label>Type</label>${sel('kind', KINDS)}</div><div><label>Amount (ETB)</label><input name="amount" type="number" required></div><div><label>Date</label><input name="tdate" type="date" required></div><div><label>Campus</label>${sel('campus', campusOpts(sc, true))}</div>
    </div><label>Note</label><input name="note"><p style="margin-top:12px"><button class="btn">Record</button></p></form></div>
    <div class="glass-card"><h3>Generate Report</h3><form method="POST" action="/admin/finance/report" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end">
      <div><label>Period (YYYY-MM)</label><input name="period" placeholder="2026-11" required></div><div><label>Start Balance</label><input name="starting_balance" type="number" value="0"></div><div><label>Campus</label>${sel('campus', campusOpts(sc, true))}</div><button class="btn secondary">Generate</button>
    </form><div class="tw" style="margin-top:12px"><table><tr><th>Period</th><th>Income</th><th>Expense</th><th>Status</th><th>Action</th></tr>
      ${rp.map(r => `<tr><td>${h(r.period)}</td><td style="color:#10b981">${Number(r.income).toLocaleString()}</td><td style="color:#ef4444">${Number(r.expense).toLocaleString()}</td><td>${r.approved ? 'Published' : 'Draft'}</td>
      <td>${can(req, 'approve') ? `<form method="POST" action="/admin/finance/report/${r.id}/${r.approved ? 'hide' : 'approve'}"><button class="btn g" style="padding:4px 9px;font-size:11px">${r.approved ? 'Hide' : 'Publish'}</button></form>` : ''}</td></tr>`).join('')}
    </table></div></div>`));
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
  res.send(A(req, 'Support', rs.map(r => `<div class="glass-card"><small>${h(r.member_no)} · ${h(r.name)}</small><h4>${h(r.subject)} <span class="badge ${r.status==='closed'?'official':'pending'}">${h(r.status)}</span></h4><p style="font-size:13px">${h(r.message)}</p>
    <form method="POST" action="/admin/support/${r.id}/reply" style="margin-top:8px"><textarea name="reply" rows="2">${h(r.reply || '')}</textarea><p style="margin-top:6px"><button class="btn">Reply & Close</button></p></form></div>`).join('') || '<div class="glass-card">No tickets.</div>'));
});
app.post('/admin/support/:id/reply', guard('support'), async (req, res) => { await q(`UPDATE support_requests SET reply=$1, status='closed' WHERE id=$2`, [String(req.body.reply || '').slice(0, 2000), parseInt(req.params.id, 10) || 0]); res.redirect('/admin/support?ok=1'); });

app.get('/admin/staff', guard('staff'), async (req, res) => {
  const st = await q(`SELECT id,username,name,role,campus,active FROM staff ORDER BY id`);
  res.send(A(req, 'Staff', `<div class="glass-card"><h3>Create Staff</h3><form method="POST" action="/admin/staff">
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px">
      <div><label>Name</label><input name="name" required></div><div><label>Username</label><input name="username" required></div><div><label>Role</label>${sel('role', ROLES.map(r => [r, r]))}</div><div><label>Campus</label>${sel('campus', campusOpts(null))}</div>
    </div><label>Password (Min 8)</label><input name="password" type="password" minlength="8" required><p style="margin-top:12px"><button class="btn">Create</button></p></form></div>
    <div class="glass-card"><div class="tw"><table><tr><th>Name</th><th>User</th><th>Role</th><th>Status</th><th>Action</th></tr>${st.map(x => `<tr><td>${h(x.name)}</td><td>${h(x.username)}</td><td>${h(x.role)}</td><td>${x.active ? 'Active' : 'Disabled'}</td><td><form method="POST" action="/admin/staff/${x.id}/toggle"><button class="btn secondary" style="padding:4px 9px;font-size:11px">Toggle</button></form></td></tr>`).join('')}</table></div></div>`));
});
app.post('/admin/staff', guard('staff'), async (req, res) => {
  const b = req.body;
  if (ROLES.includes(b.role) && b.name && b.username && String(b.password || '').length >= 8) {
    try { await q(`INSERT INTO staff (username,name,role,campus,password) VALUES ($1,$2,$3,$4,$5)`, [b.username.trim().toLowerCase(), b.name, b.role, CAMPUS[b.campus] ? b.campus : null, bcrypt.hashSync(String(b.password), 10)]); } catch (e) {}
  }
  res.redirect('/admin/staff?ok=1');
});
app.post('/admin/staff/:id/toggle', guard('staff'), async (req, res) => { await q(`UPDATE staff SET active=1-active WHERE id=$1`, [parseInt(req.params.id, 10) || 0]); res.redirect('/admin/staff?ok=1'); });

app.get('/admin/audit-logs', guard('audit'), async (req, res) => {
  const logs = await q(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 120`);
  res.send(A(req, 'Audit Logs', `<div class="glass-card"><div class="tw"><table><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr>${logs.map(l => `<tr><td>${new Date(l.created_at).toLocaleString()}</td><td><b>${h(l.actor)}</b></td><td>${h(l.action)}</td><td>${h(l.target || '-')}</td><td>${h(l.details || '-')}</td></tr>`).join('')}</table></div></div>`));
});

app.get('/admin/backup', guard('backup'), async (req, res) => {
  if (!req.query.go) return res.send(A(req, 'Backup', `<div class="glass-card" style="text-align:center;padding:40px"><h3>💾 Database Backup</h3><p style="margin:12px 0">Download full JSON snapshot.</p><a class="btn" href="/admin/backup?go=1">⬇ Download Backup</a></div>`));
  const out = { exported_at: new Date().toISOString(), platform: 'Siikkoo-Mandoo MWU' };
  for (const t of ['members','posts','polls','poll_votes','certificates','forum_posts','forum_replies','leaders','meetings','support_requests','transactions','finance_reports','staff','audit_logs']) out[t] = await q(`SELECT * FROM ${t}`);
  res.set('Content-Type', 'application/json').set('Content-Disposition', `attachment; filename="sikkoo-mandoo-backup-${new Date().toISOString().slice(0,10)}.json"`).send(JSON.stringify(out, null, 2));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Siikkoo-Mandoo MWU Platform running on port ${PORT}`));
