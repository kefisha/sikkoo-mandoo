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
    background_color: '#f0f5ff',
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

// ---------- CAMPUS CONFIGURATION ----------
const CAMPUS = {
  robe: {
    n: 'Robe Main Campus', c: 'ROB', am: 'ሮቤ ዋናው ካምፓስ', om: 'Kaampasii Guddaa Roobee',
    loc: 'Bale Robe, Oromia', colleges: 'CNCS, Business & Economics, Social Sciences, Law, Computing'
  },
  goba: {
    n: 'Goba Health Campus', c: 'GOB', am: 'ጎባ ጤና ሳይንስ ካምፓስ', om: 'Kaampasii Fayyaa Gooobaa',
    loc: 'Goba Town, Bale, Oromia', colleges: 'College of Health and Medical Sciences'
  },
  shashamane: {
    n: 'Shashamane Campus', c: 'SHA', am: 'ሻሸመኔ ካምፓስ', om: 'Kaampasii Shaashamannee',
    loc: 'Shashamane, West Arsi, Oromia', colleges: 'Agro-Forestry, Natural Resources, Business'
  }
};

const TYPES = ['announcement', 'news', 'event', 'education', 'document', 'project', 'gallery', 'heritage'];
const SLUG = {
  announcement: 'announcements', news: 'news', event: 'events',
  education: 'education', document: 'documents', project: 'projects',
  gallery: 'gallery', heritage: 'heritage'
};

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
  vice_president: ['members', 'content', 'finance', 'support', 'leaders', 'meetings', 'approve', 'audit'],
  general_secretary: ['members', 'content', 'meetings', 'support', 'leaders'],
  finance_secretary: ['finance'],
  academic_secretary: ['content', 'support'],
  social_secretary: ['content', 'support', 'meetings'],
  communication_secretary: ['content', 'leaders'],
  media_secretary: ['content', 'gallery'],
  info_secretary: ['content', 'support', 'staff', 'audit', 'backup'],
  dev_secretary: ['content', 'finance'],
  campus_rep: ['members', 'content', 'support', 'finance', 'meetings'],
  campus_coordinator: ['members', 'content', 'support', 'meetings'],
  committee_member: ['support']
};

const can = (req, x) => {
  const a = PERMS[req.session.sr];
  return a === '*' || (Array.isArray(a) && a.includes(x));
};
const guard = x => (req, res, next) => (req.session.sr && can(req, x)) ? next() : res.redirect('/admin-login');
const needMember = (req, res, next) => req.session.mid ? next() : res.redirect('/login');
const needStaff = (req, res, next) => req.session.sr ? next() : res.redirect('/admin-login');

async function logAudit(req, action, target, details) {
  try {
    const actor = req.session.sname || req.session.mid || 'Anonymous';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    await q(`INSERT INTO audit_logs (actor, action, target, details, ip) VALUES ($1,$2,$3,$4,$5)`,
      [actor, action, target, String(details || '').slice(0, 500), String(ip).slice(0, 50)]);
  } catch (e) {}
}

// ---------- Translations ----------
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
    renew: "Miseensummaa Haaressi", print: 'Maxxansi', title: 'Mata-duree', body: 'Ibsa', date: 'Guyyaa',
    leadership: 'Geggeessitoota', education: 'Barnoota', document: 'Sanadoota', project: 'Pirojektoota',
    gallery: 'Suuraa fi Viidiyoo', finance: 'Maallaqa', support: 'Deeggarsa', meetings: 'Walgahii fi Sochiilee',
    heritage: 'Aadaa fi Seenaa', about: "Waa'ee Gamtaa", privacy: 'Iccitii', terms: 'Waliigaltee',
    bad: 'Maaloo odeeffannoo barbaachisaa guutaa.', exists: 'ID Barattootaa kun duraan galmaa\'eera.'
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
    renew: 'አባልነት አድስ', print: 'አትም', title: 'ርዕስ', body: 'ዝርዝር', date: 'ቀን',
    leadership: 'አመራሮች', education: 'ትምህርትና እድሎች', document: 'ሰነዶች', project: 'ፕሮጀክቶች',
    gallery: 'ፎቶ እና ቪዲዮ', finance: 'ፋይናንስ', support: 'እገዛ', meetings: 'ስብሰባዎች እና እንቅስቃሴዎች',
    heritage: 'ባህል እና ታሪክ', about: 'ስለ ማህበሩ', privacy: 'የግላዊነት ፖሊሲ', terms: 'ውሎች እና ሁኔታዎች',
    bad: 'እባክዎ አስፈላጊ መረጃዎችን በትክክል ይሙሉ።', exists: 'ይህ የተማሪ መታወቂያ ቀደም ብሎ ተመዝግቧል።'
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
    renew: 'Renew Membership', print: 'Print', title: 'Title', body: 'Details', date: 'Date',
    leadership: 'Leadership', education: 'Education & Opportunities', document: 'Documents', project: 'Projects',
    gallery: 'Gallery', finance: 'Finance', support: 'Support', meetings: 'Meetings & Activities',
    heritage: 'Heritage & Culture', about: 'About Association', privacy: 'Privacy Policy', terms: 'Terms & Conditions',
    bad: 'Please fill all required fields properly.', exists: 'This Student ID is already registered.'
  }
};

const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const csvEsc = v => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const L = req => (['en', 'am', 'om'].includes(req.session.lang) ? req.session.lang : 'om');
const tr = (req, k) => (T[L(req)] && T[L(req)][k]) || (T.en[k] || k);
const campusName = (req, cKey) => { const c = CAMPUS[cKey]; if (!c) return cKey; return c[L(req)] || c.n; };

// ---------- MODERN CSS (Light + Dark Mode + Mobile App UI) ----------
const CSS = `
:root {
  --primary: #4f6ef7;
  --primary-dark: #3b5bdb;
  --accent: #ec4899;
  --purple: #8b5cf6;
  --green: #10b981;
  --orange: #f59e0b;
  --red: #ef4444;
  --text: #1e293b;
  --text-2: #475569;
  --text-muted: #64748b;
  --border: #e2e8f0;
  --surface: rgba(255,255,255,0.84);
  --surface-solid: #ffffff;
  --surface-soft: #f8fafc;
  --radius: 22px;
  --shadow: 0 8px 30px -8px rgba(79,110,247,0.12), 0 4px 12px -4px rgba(0,0,0,0.04);
  --shadow-lg: 0 20px 40px -12px rgba(79,110,247,0.18);
  --shadow-xl: 0 25px 50px -15px rgba(79,110,247,0.22);
}
[data-theme="dark"] {
  --text: #f1f5f9;
  --text-2: #cbd5e1;
  --text-muted: #94a3b8;
  --border: #334155;
  --surface: rgba(30,41,59,0.82);
  --surface-solid: #1e293b;
  --surface-soft: #0f172a;
  --shadow: 0 10px 30px -8px rgba(0,0,0,0.45);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background:
    radial-gradient(ellipse 100% 80% at 0% 0%, #dbeafe 0%, transparent 55%),
    radial-gradient(ellipse 90% 70% at 100% 0%, #ede9fe 0%, transparent 50%),
    radial-gradient(ellipse 80% 60% at 50% 100%, #fce7f3 0%, transparent 45%),
    linear-gradient(165deg, #f0f5ff 0%, #f8fafc 40%, #fdf4ff 100%);
  background-attachment: fixed;
  color: var(--text);
  line-height: 1.65;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  -webkit-font-smoothing: antialiased;
  transition: background 0.3s, color 0.3s;
}
[data-theme="dark"] body {
  background:
    radial-gradient(ellipse 100% 80% at 0% 0%, #1e1b4b 0%, transparent 55%),
    radial-gradient(ellipse 90% 70% at 100% 0%, #172554 0%, transparent 50%),
    linear-gradient(165deg, #0f172a 0%, #0b1120 100%);
}
a { color: var(--primary); text-decoration: none; transition: 0.2s; }
a:hover { color: var(--primary-dark); }

header {
  background: var(--surface);
  backdrop-filter: blur(18px) saturate(180%);
  -webkit-backdrop-filter: blur(18px) saturate(180%);
  border-bottom: 1px solid var(--border);
  position: sticky; top: 0; z-index: 100;
  padding: 12px 0;
}
.in { max-width: 1140px; margin: 0 auto; padding: 0 18px; width: 100%; }
.header-top { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.logo-area { display: flex; align-items: center; gap: 12px; }
.logo-icon {
  width: 46px; height: 46px; border-radius: 15px;
  background: linear-gradient(145deg, #4f6ef7, #8b5cf6);
  display: grid; place-items: center; font-size: 22px; color: white;
  box-shadow: 0 8px 20px rgba(79,110,247,0.35);
}
.logo-text h1 { font-size: 14.5px; font-weight: 800; color: var(--text); letter-spacing: -0.2px; }
.logo-text p { font-size: 11.5px; color: var(--text-muted); font-weight: 500; }
.nav-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.lang-box {
  display: flex; gap: 3px;
  background: var(--surface-soft); padding: 4px; border-radius: 9999px;
  border: 1px solid var(--border);
}
.lang-btn {
  padding: 5px 10px; font-size: 12px; font-weight: 600;
  border-radius: 9999px; color: var(--text-muted); transition: 0.2s;
}
.lang-btn.active {
  background: var(--surface-solid); color: var(--primary);
  box-shadow: 0 2px 6px rgba(0,0,0,0.08);
}
.theme-btn {
  width: 36px; height: 36px; border-radius: 12px;
  border: 1px solid var(--border); background: var(--surface-solid);
  color: var(--text); cursor: pointer; display: grid; place-items: center;
  font-size: 16px; transition: 0.2s;
}
.theme-btn:hover { transform: scale(1.06); }
.ext-nav { display: flex; gap: 8px; align-items: center; }
.ext-btn {
  padding: 8px 14px; font-size: 13px; font-weight: 600; border-radius: 14px;
  background: var(--surface-solid); color: var(--text); border: 1px solid var(--border);
  transition: 0.2s; box-shadow: 0 2px 6px rgba(0,0,0,0.04);
}
.ext-btn:hover { transform: translateY(-1px); }
.ext-btn.login-btn {
  background: linear-gradient(135deg, #4f6ef7, #3b5bdb);
  color: white; border: none;
  box-shadow: 0 4px 14px rgba(79,110,247,0.3);
}

.glass-card, .card {
  background: var(--surface);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-radius: var(--radius);
  padding: 24px 22px;
  margin: 14px 0;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

label { display: block; font-weight: 650; font-size: 12px; margin: 14px 0 6px; color: var(--text-2); }
input, select, textarea {
  width: 100%; padding: 12px 15px;
  background: var(--surface-solid);
  border: 1.5px solid var(--border);
  border-radius: 14px;
  font: inherit; color: var(--text); font-size: 14.5px;
  transition: 0.2s;
}
input:focus, select:focus, textarea:focus {
  outline: none; border-color: #60a5fa;
  box-shadow: 0 0 0 4px rgba(79,110,247,0.14);
}
textarea { resize: vertical; min-height: 85px; }

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  background: linear-gradient(135deg, #4f6ef7, #3b5bdb);
  color: #fff; border: 0; border-radius: 15px; padding: 12px 20px;
  font-weight: 650; cursor: pointer; font-size: 14px;
  transition: 0.22s; box-shadow: 0 6px 18px rgba(79,110,247,0.28);
}
.btn:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(79,110,247,0.35); color: #fff; }
.btn.secondary { background: var(--surface-solid); border: 1.5px solid var(--border); color: var(--text); box-shadow: none; }
.btn.secondary:hover { opacity: 0.9; color: var(--text); }
.btn.danger { background: linear-gradient(135deg, #f87171, #ef4444); box-shadow: 0 4px 14px rgba(239,68,68,0.28); }
.btn.g { background: linear-gradient(135deg, #34d399, #10b981); box-shadow: 0 4px 14px rgba(16,185,129,0.28); }
.btn.excel { background: linear-gradient(135deg, #059669, #047857); box-shadow: 0 4px 14px rgba(5,150,105,0.3); }
.btn.edit-btn { background: linear-gradient(135deg, #6366f1, #4f46e5); box-shadow: 0 4px 12px rgba(99,102,241,0.28); }

.portal-menu {
  background: var(--surface);
  backdrop-filter: blur(12px);
  border-radius: 20px; padding: 12px;
  display: flex; flex-wrap: wrap; gap: 8px;
  margin: 0 0 18px; border: 1px solid var(--border);
  box-shadow: var(--shadow);
}
.portal-btn {
  background: var(--surface-solid); color: var(--text-2);
  border-radius: 13px; padding: 9px 14px; font-size: 13px; font-weight: 650;
  display: inline-flex; align-items: center; gap: 6px;
  border: 1.5px solid var(--border); transition: 0.2s;
}
.portal-btn:hover { border-color: var(--primary); color: var(--primary); transform: translateY(-1px); }
.portal-btn.active {
  background: linear-gradient(135deg, #4f6ef7, #6366f1);
  color: white; border-color: transparent;
  box-shadow: 0 6px 16px rgba(79,110,247,0.3);
}

/* Search Bar */
.search-bar {
  display: flex; gap: 8px; margin-bottom: 18px;
  background: var(--surface); padding: 8px; border-radius: 16px;
  border: 1px solid var(--border); box-shadow: var(--shadow);
}
.search-bar input { border: none; background: transparent; padding: 8px 12px; }
.search-bar input:focus { box-shadow: none; }

/* Feature Tiles */
.feature-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 14px; margin: 16px 0 22px;
}
.feature-tile {
  border-radius: 20px; padding: 22px 16px; text-align: center; color: white;
  font-weight: 700; font-size: 14px; box-shadow: 0 10px 25px -8px rgba(0,0,0,0.18);
  transition: transform 0.2s; display: flex; flex-direction: column; align-items: center;
  gap: 10px; min-height: 110px; justify-content: center;
}
.feature-tile:hover { transform: translateY(-4px); color: white; }
.feature-tile .icon { font-size: 28px; }
.feature-tile.blue { background: linear-gradient(145deg, #60a5fa, #3b82f6); }
.feature-tile.purple { background: linear-gradient(145deg, #a78bfa, #7c3aed); }
.feature-tile.cyan { background: linear-gradient(145deg, #22d3ee, #06b6d4); }
.feature-tile.red { background: linear-gradient(145deg, #f87171, #ef4444); }
.feature-tile.yellow { background: linear-gradient(145deg, #fbbf24, #f59e0b); }
.feature-tile.indigo { background: linear-gradient(145deg, #818cf8, #4f46e5); }
.feature-tile.orange { background: linear-gradient(145deg, #fb923c, #f97316); }
.feature-tile.teal { background: linear-gradient(145deg, #2dd4bf, #14b8a6); }
.feature-tile.green { background: linear-gradient(145deg, #34d399, #10b981); }
.feature-tile.brown { background: linear-gradient(145deg, #a16207, #854d0e); }
.feature-tile.gray { background: linear-gradient(145deg, #64748b, #475569); }
.feature-tile.pink { background: linear-gradient(145deg, #f472b6, #ec4899); }

table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13.5px; }
th, td { padding: 12px 14px; border-bottom: 1px solid var(--border); text-align: left; }
th { background: var(--surface-soft); font-weight: 700; color: var(--primary); font-size: 11.5px; text-transform: uppercase; }
.tw { overflow-x: auto; background: var(--surface-solid); border-radius: 18px; border: 1px solid var(--border); box-shadow: var(--shadow); }

.badge { display: inline-flex; align-items: center; padding: 4px 11px; border-radius: 9999px; font-size: 11.5px; font-weight: 700; }
.badge.official { background: #d1fae5; color: #047857; }
.badge.pending { background: #fef3c7; color: #b45309; }
.badge.rejected { background: #fee2e2; color: #b91c1c; }
.badge.registered { background: #dbeafe; color: #1d4ed8; }
.badge.alert { background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; }

.err { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; padding: 13px 15px; border-radius: 14px; margin: 12px 0; font-size: 14px; font-weight: 600; }
.msgok { background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; padding: 13px 15px; border-radius: 14px; margin: 12px 0; font-size: 14px; font-weight: 600; }

/* Digital ID Card */
.id {
  border-radius: 22px; max-width: 430px; margin: 20px auto;
  background: #ffffff; color: #1e293b;
  box-shadow: var(--shadow-xl); overflow: hidden;
  border: 1px solid #e2e8f0; position: relative;
}
.id .hd {
  background: linear-gradient(135deg, #4f6ef7 0%, #8b5cf6 100%);
  color: #fff; padding: 15px 18px; font-weight: 700; font-size: 13.5px;
  display: flex; justify-content: space-between; align-items: center;
}
.id .bd { display: flex; gap: 14px; padding: 18px; align-items: center; position: relative; }
.id img { width: 92px; height: 116px; border-radius: 12px; object-fit: cover; border: 2px solid #e2e8f0; }
.id-seal { position: absolute; right: 14px; bottom: 8px; opacity: 0.22; pointer-events: none; }

.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin-bottom: 16px; }
.stat-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 20px; padding: 20px 14px; text-align: center;
  box-shadow: var(--shadow); transition: transform 0.2s;
}
.stat-card:hover { transform: translateY(-3px); }
.stat-card .num { font-size: 2.1rem; font-weight: 800; line-height: 1.1; margin-bottom: 4px; }
.stat-card .label { font-size: 11.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }
.stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-bottom: 18px; }
.stat-chip { background: var(--surface-solid); border-radius: 16px; padding: 14px 12px; text-align: center; border: 1px solid var(--border); }
.stat-chip b { display: block; font-size: 1.4rem; font-weight: 800; color: var(--primary); }
.stat-chip span { font-size: 11.5px; color: var(--text-muted); font-weight: 600; }

.auth-wrap { min-height: 74vh; display: flex; align-items: center; justify-content: center; padding: 20px 0; }
.auth-card {
  width: 100%; max-width: 420px; background: var(--surface);
  backdrop-filter: blur(16px); border-radius: 26px; padding: 30px 26px;
  box-shadow: var(--shadow-xl); border: 1px solid var(--border);
}
.auth-icon {
  width: 68px; height: 68px; margin: 0 auto 14px; border-radius: 20px;
  background: linear-gradient(145deg, #4f6ef7, #8b5cf6);
  display: grid; place-items: center; font-size: 28px; color: white;
  box-shadow: 0 12px 28px rgba(79,110,247,0.35);
}
.auth-title { font-size: 1.45rem; font-weight: 800; text-align: center; }
.auth-sub { color: var(--text-muted); font-size: 13.5px; text-align: center; margin: 6px 0 20px; }

.admin-hero {
  background: linear-gradient(135deg, #4f6ef7 0%, #8b5cf6 55%, #ec4899 100%);
  color: white; border-radius: 22px; padding: 26px 22px; margin-bottom: 18px;
  box-shadow: 0 16px 36px rgba(79,110,247,0.28); text-align: center;
}
.form-section {
  background: var(--surface-soft); border: 1px solid var(--border);
  border-radius: 18px; padding: 18px 16px 12px; margin: 16px 0;
}
.form-section h4 { font-size: 13px; font-weight: 750; color: var(--primary); margin: 0 0 8px; }

/* Landing Hero */
.hero-box {
  background: linear-gradient(135deg, #4f6ef7 0%, #7c3aed 55%, #ec4899 100%);
  color: white; border-radius: 28px; padding: 42px 28px; text-align: center;
  box-shadow: 0 22px 45px -15px rgba(79,110,247,0.45); margin-bottom: 24px;
}
.hero-box h1 { font-size: 2rem; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 8px; }
.hero-box p { opacity: 0.92; font-size: 15px; max-width: 600px; margin: 0 auto 22px; }

/* Toast Notification */
.toast {
  position: fixed; top: 20px; right: 20px; z-index: 9999;
  background: #10b981; color: white; padding: 13px 20px; border-radius: 14px;
  font-weight: 650; font-size: 14px; box-shadow: 0 12px 30px rgba(0,0,0,0.2);
  animation: slideIn 0.35s ease, fadeOut 0.4s ease 3.2s forwards;
}
.toast.err-t { background: #ef4444; }
@keyframes slideIn { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes fadeOut { to { transform: translateY(-20px); opacity: 0; pointer-events: none; } }

/* Mobile Bottom Nav */
.mobile-nav {
  display: none; position: fixed; bottom: 0; left: 0; right: 0; z-index: 999;
  background: var(--surface); backdrop-filter: blur(18px);
  border-top: 1px solid var(--border); padding: 8px 6px;
  justify-content: space-around; align-items: center;
}
.mobile-nav a {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  font-size: 11px; font-weight: 650; color: var(--text-muted); padding: 4px 10px; border-radius: 12px;
}
.mobile-nav a.active { color: var(--primary); background: rgba(79,110,247,0.1); }
.mobile-nav span.ico { font-size: 19px; }

main { flex: 1; display: flex; flex-direction: column; }
footer { text-align: center; padding: 24px 18px; color: var(--text-muted); font-size: 12.5px; margin-top: auto; border-top: 1px solid var(--border); background: var(--surface); }

@media (max-width: 680px) {
  .logo-text h1 { font-size: 13.5px; }
  .hero-box { padding: 30px 18px; }
  .hero-box h1 { font-size: 1.5rem; }
  .feature-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .mobile-nav { display: flex; }
  body.has-mnav { padding-bottom: 72px; }
}
`;

// ---------- GLOBAL CLIENT JS (Dark Mode, PWA, Auto Image Compression, Toast) ----------
const CLIENT_JS = `
<script>
// Dark / Light Mode
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

// PWA Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(()=>{});
}

// Auto Image Compression before upload
document.addEventListener('change', async function(e){
  const input = e.target;
  if(!input || input.type !== 'file' || !input.files || !input.files[0]) return;
  const file = input.files[0];
  if(!/^image\\/(jpeg|png|webp)$/.test(file.type) || file.size < 350000) return;
  try {
    const img = await createImageBitmap(file);
    const maxW = 1000;
    const scale = img.width > maxW ? maxW / img.width : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.78));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], file.name.replace(/\\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
    input.files = dt.files;
  } catch(err) {}
});
</script>
`;

function page(req, title, body) {
  const l = L(req);
  const isMember = !!req.session.mid;
  const isStaff = !!req.session.sr;

  const langSwitcher = `
    <div class="lang-box">
      <a class="lang-btn ${l === 'om' ? 'active' : ''}" href="/lang/om">OM</a>
      <a class="lang-btn ${l === 'am' ? 'active' : ''}" href="/lang/am">አማ</a>
      <a class="lang-btn ${l === 'en' ? 'active' : ''}" href="/lang/en">EN</a>
    </div>
    <button id="themeToggle" class="theme-btn" onclick="toggleTheme()" title="Switch Theme">🌙</button>
  `;

  let extNav = '';
  if (isMember) {
    extNav = `<div class="ext-nav"><a class="ext-btn" href="/student-dashboard">🪪 Portal</a><a class="ext-btn login-btn" href="/logout">${h(tr(req, 'logout'))}</a></div>`;
  } else if (isStaff) {
    extNav = `<div class="ext-nav"><a class="ext-btn" href="/admin">⚙️ Admin</a><a class="ext-btn login-btn" href="/logout">${h(tr(req, 'logout'))}</a></div>`;
  } else {
    extNav = `
      <div class="ext-nav">
        <a class="ext-btn" href="/about">${h(tr(req, 'about'))}</a>
        <a class="ext-btn" href="/campuses">${h(tr(req, 'campuses'))}</a>
        <a class="ext-btn login-btn" href="/login">${h(tr(req, 'login'))}</a>
      </div>
    `;
  }

  let toast = '';
  if (req.query.ok) toast = `<div class="toast">✅ Action completed successfully!</div>`;
  else if (req.query.saved) toast = `<div class="toast">💾 Changes saved successfully!</div>`;
  else if (req.query.rsvp) toast = `<div class="toast">🎉 RSVP confirmed!</div>`;

  const mobileNav = isMember ? `
    <nav class="mobile-nav">
      <a href="/student-dashboard" class="${req.path === '/student-dashboard' ? 'active' : ''}"><span class="ico">🪪</span>ID Card</a>
      <a href="/portal/announcements" class="${req.path.includes('announcements') ? 'active' : ''}"><span class="ico">📢</span>News</a>
      <a href="/portal/events" class="${req.path.includes('events') ? 'active' : ''}"><span class="ico">📅</span>Events</a>
      <a href="/portal/support" class="${req.path.includes('support') ? 'active' : ''}"><span class="ico">💬</span>Support</a>
    </nav>
  ` : '';

  return `<!DOCTYPE html>
<html lang="${l}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#4f6ef7">
  <link rel="manifest" href="/manifest.json">
  <title>${h(title)} · ${h(tr(req, 'site'))}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>${CSS}</style>
</head>
<body class="${isMember ? 'has-mnav' : ''}">
${toast}
<header>
  <div class="in">
    <div class="header-top">
      <a href="/" class="logo-area" style="text-decoration:none">
        <div class="logo-icon">🌳</div>
        <div class="logo-text">
          <h1>${h(tr(req, 'site'))}</h1>
          <p>${h(tr(req, 'uni'))}</p>
        </div>
      </a>
      <div class="nav-group">
        ${langSwitcher}
        ${extNav}
      </div>
    </div>
  </div>
</header>
<main>
  <div class="in" style="padding-top: 22px; padding-bottom: 40px; width: 100%;">
    ${body}
  </div>
</main>
<footer>
  <div class="in">
    <p>© ${new Date().getFullYear()} ${h(tr(req, 'site'))} · ${h(tr(req, 'uni'))}</p>
    <p style="margin-top:6px; font-size:12px;">
      <a href="/about">${h(tr(req, 'about'))}</a> · 
      <a href="/campuses">${h(tr(req, 'campuses'))}</a> · 
      <a href="/privacy">${h(tr(req, 'privacy'))}</a> · 
      <a href="/terms">${h(tr(req, 'terms'))}</a> · 
      <a href="/admin-login">Staff Access</a>
    </p>
  </div>
</footer>
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
    { p: '/portal/meetings', i: '🤝', t: 'Meetings' },
    { p: '/portal/education', i: '📚', t: 'Education' },
    { p: '/portal/heritage', i: '🏛️', t: 'Heritage' },
    { p: '/portal/leadership', i: '👥', t: 'Leadership' },
    { p: '/portal/finance', i: '💰', t: 'Finance' },
    { p: '/portal/support', i: '💬', t: 'Support' }
  ];

  let html = `
    <form class="search-bar" method="GET" action="/portal/search">
      <input name="q" placeholder="🔍 Search announcements, events, education, meetings..." required>
      <button class="btn" style="padding:8px 16px; border-radius:12px;">Search</button>
    </form>
    <div class="portal-menu">
  `;
  items.forEach(x => {
    html += `<a href="${x.p}" class="portal-btn${activePath === x.p ? ' active' : ''}">${x.i} ${x.t}</a>`;
  });
  html += '</div>';
  return html;
}

function postT(req, p, f) {
  const l = L(req);
  if (l === 'am') return p[f + '_am'] || p[f + '_om'] || p[f + '_en'] || '';
  if (l === 'om') return p[f + '_om'] || p[f + '_en'] || '';
  return p[f + '_en'] || p[f + '_om'] || '';
}

function postCard(req, p, extraHtml = '') {
  const isEmergency = p.is_emergency ? `<span class="badge alert" style="margin-left:8px">🚨 EMERGENCY</span>` : '';
  return `<div class="glass-card" style="margin-bottom:16px; padding:22px; border-left: 4px solid ${p.is_emergency ? '#ef4444' : '#4f6ef7'}">
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
      <small style="color:var(--text-muted);font-weight:600;font-size:12px">${h(p.campus === 'all' ? 'All Campuses' : campusName(req, p.campus))} · ${h(p.event_date || (p.created_at ? new Date(p.created_at).toLocaleDateString() : ''))}</small>
      <div>${isEmergency}</div>
    </div>
    <h3 style="margin:8px 0 10px; font-size:1.15rem; font-weight:700">${h(postT(req, p, 'title'))}</h3>
    ${p.image_id ? `<img style="width:100%;max-height:340px;object-fit:cover;border-radius:12px;margin-bottom:12px" src="/photo/${p.image_id}" alt="">` : ''}
    <div style="color:var(--text-2);font-size:14px;line-height:1.65">${h(postT(req, p, 'body')).replace(/\n/g, '<br>')}</div>
    ${p.file_id ? `<p style="margin-top:14px"><a class="btn secondary" style="padding:6px 14px;font-size:12.5px" href="/photo/${p.file_id}?dl=1">📥 Download Attached Document</a></p>` : ''}
    ${extraHtml}
  </div>`;
}

const scopeOf = req => (CENTRAL.includes(req.session.sr) ? null : (req.session.campus || '-'));

// ---------- DATABASE SCHEMA INITIALIZER & MIGRATIONS ----------
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
    title_om TEXT, title_en TEXT, title_am TEXT,
    body_om TEXT, body_en TEXT, body_am TEXT,
    event_date TEXT, image_id INTEGER, file_id INTEGER, is_emergency INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS event_rsvps (
    id SERIAL PRIMARY KEY, post_id INTEGER, member_no TEXT, created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(post_id, member_no)
  )`);
  await q(`CREATE TABLE IF NOT EXISTS staff (
    id SERIAL PRIMARY KEY, username TEXT UNIQUE, name TEXT, role TEXT, campus TEXT, password TEXT, active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS leaders (
    id SERIAL PRIMARY KEY, name TEXT, role_key TEXT, position_om TEXT, position_en TEXT, position_am TEXT,
    term TEXT DEFAULT '2025-2026', responsibilities TEXT, level TEXT DEFAULT 'central', campus TEXT DEFAULT 'all',
    photo_id INTEGER, ord INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS meetings (
    id SERIAL PRIMARY KEY, campus TEXT DEFAULT 'all', title TEXT, meeting_date TEXT, agenda TEXT,
    minutes TEXT, resolutions TEXT, attendance_count INTEGER DEFAULT 0, file_id INTEGER, created_at TIMESTAMP DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS support_requests (
    id SERIAL PRIMARY KEY, member_no TEXT, name TEXT, campus TEXT, subject TEXT, category TEXT DEFAULT 'general',
    message TEXT, status TEXT DEFAULT 'open', reply TEXT, created_at TIMESTAMP DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY, kind TEXT, amount NUMERIC, tdate TEXT, note TEXT, campus TEXT DEFAULT 'all', created_by TEXT, created_at TIMESTAMP DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS finance_reports (
    id SERIAL PRIMARY KEY, period TEXT, campus TEXT, income NUMERIC, expense NUMERIC, starting_balance NUMERIC DEFAULT 0,
    detail TEXT, approved INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY, actor TEXT, action TEXT, target TEXT, details TEXT, ip TEXT, created_at TIMESTAMP DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS password_resets (
    id SERIAL PRIMARY KEY, student_id TEXT, phone TEXT, reason TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMP DEFAULT NOW()
  )`);

  for (const sql of [
    `ALTER TABLE files ADD COLUMN IF NOT EXISTS name TEXT`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS college TEXT`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS zone_woreda TEXT`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS telegram_handle TEXT`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS renewal_date TIMESTAMP DEFAULT NOW()`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS file_id INTEGER`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_id INTEGER`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS subcategory TEXT DEFAULT 'general'`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_emergency INTEGER DEFAULT 0`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS title_am TEXT`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS body_am TEXT`,
    `ALTER TABLE leaders ADD COLUMN IF NOT EXISTS role_key TEXT`,
    `ALTER TABLE leaders ADD COLUMN IF NOT EXISTS term TEXT DEFAULT '2025-2026'`,
    `ALTER TABLE leaders ADD COLUMN IF NOT EXISTS responsibilities TEXT`,
    `ALTER TABLE finance_reports ADD COLUMN IF NOT EXISTS starting_balance NUMERIC DEFAULT 0`
  ]) {
    try { await q(sql); } catch (e) {}
  }

  const adminPass = bcrypt.hashSync('sikomando123', 10);
  await q(`INSERT INTO staff (username, name, role, campus, password, active) 
           VALUES ('admin', 'Central Admin', 'central_admin', NULL, $1, 1) 
           ON CONFLICT (username) DO UPDATE SET password = $1, role = 'central_admin', active = 1`, [adminPass]);
})().catch(e => console.error('DB init err:', e.message));

app.get('/lang/:l', (req, res) => {
  const l = req.params.l; if (['om', 'am', 'en'].includes(l)) req.session.lang = l;
  res.redirect(req.get('referer') || '/');
});

// ---------- DYNAMIC HOME LANDING PAGE ----------
app.get('/', async (req, res) => {
  if (req.session.mid) return res.redirect('/student-dashboard');
  if (req.session.sr) return res.redirect('/admin');

  const [stats] = await q(`SELECT COUNT(*)::int total,
    SUM(CASE WHEN campus='robe' THEN 1 ELSE 0 END)::int robe,
    SUM(CASE WHEN campus='goba' THEN 1 ELSE 0 END)::int goba,
    SUM(CASE WHEN campus='shashamane' THEN 1 ELSE 0 END)::int sha
    FROM members`);
  const recent = await q(`SELECT * FROM posts WHERE type IN ('announcement','news','event') ORDER BY is_emergency DESC, id DESC LIMIT 3`);

  const html = `
    <div class="hero-box">
      <div style="font-size:46px; margin-bottom:10px;">🌳</div>
      <h1>${h(tr(req, 'site'))}</h1>
      <p>${h(tr(req, 'uni'))} · Robe · Goba · Shashamane<br>Official Digital Membership, Academic & Cultural Portal</p>
      <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
        <a href="/login" class="btn" style="background:white; color:#3b5bdb; box-shadow:0 8px 20px rgba(0,0,0,0.18);">🔑 Member Login</a>
        <a href="/sikkoo-mandoo-register" class="btn g">📝 Join Association</a>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="num" style="color:#4f6ef7">${stats.total || 0}</div><div class="label">Total Members</div></div>
      <div class="stat-card"><div class="num" style="color:#8b5cf6">${stats.robe || 0}</div><div class="label">Robe Main</div></div>
      <div class="stat-card"><div class="num" style="color:#10b981">${stats.goba || 0}</div><div class="label">Goba Health</div></div>
      <div class="stat-card"><div class="num" style="color:#f59e0b">${stats.sha || 0}</div><div class="label">Shashamane</div></div>
    </div>

    ${recent.length ? `
      <h3 style="margin:24px 0 12px; font-size:1.2rem; font-weight:800;">📢 Latest Updates</h3>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
        ${recent.map(p => `
          <div class="glass-card" style="margin:0; padding:20px; border-top:4px solid ${p.is_emergency ? '#ef4444' : '#4f6ef7'}">
            <small style="color:var(--text-muted); font-weight:600">${h(p.type.toUpperCase())} · ${h(p.event_date || new Date(p.created_at).toLocaleDateString())}</small>
            <h4 style="margin:6px 0 8px; font-size:1.05rem;">${h(postT(req, p, 'title'))}</h4>
            <p style="font-size:13px; color:var(--text-2);">${h(postT(req, p, 'body')).slice(0, 130)}...</p>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
  res.send(page(req, tr(req, 'home'), html));
});

// ---------- ABOUT & CAMPUSES ----------
app.get('/about', async (req, res) => {
  const html = `
    <div class="glass-card" style="padding:32px">
      <div style="text-align:center; margin-bottom:28px">
        <div style="width:72px; height:72px; margin:0 auto 12px; border-radius:50%; background:linear-gradient(135deg, #4f6ef7, #8b5cf6); display:grid; place-items:center; font-size:32px; color:white;">🌳</div>
        <h2 style="font-size:1.6rem; font-weight:800;">${h(tr(req, 'site'))}</h2>
        <p style="color:var(--text-muted); font-weight:600">${h(tr(req, 'uni'))}</p>
        <p style="margin-top:8px; display:inline-block; background:rgba(79,110,247,0.12); color:var(--primary); padding:5px 14px; border-radius:999px; font-weight:700; font-size:13px">
          "Tokkummaa, Barnoota fi Aadaa" · "አንድነት፣ ትምህርት እና ባህል"
        </p>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:20px; margin-bottom:24px;">
        <div class="form-section" style="margin:0">
          <h4>🏛️ History of the Association</h4>
          <p style="font-size:13.5px; color:var(--text-2);">The Siikkoo-Mandoo Students Association at Madda Walabu University was founded to cultivate unity, mutual assistance, academic excellence, and cultural heritage promotion across Robe, Goba, and Shashamane campuses.</p>
        </div>
        <div class="form-section" style="margin:0">
          <h4>🎯 Mission & Vision</h4>
          <p style="font-size:13.5px; color:var(--text-2);"><strong>Mission:</strong> Empower students through academic collaboration, leadership, and cultural identity.<br><strong>Vision:</strong> A thriving, unified, and visionary student community excelling academically.</p>
        </div>
      </div>
      <div class="form-section">
        <h4>📞 Contact & Social Media</h4>
        <p style="font-size:13.5px; color:var(--text-2);">📍 MWU Main Campus (Robe) · ✉️ info@siikkoomandoo-mwu.org · ✈️ Telegram: <a href="https://t.me/siikkoomandoomwu" target="_blank">@siikkoomandoomwu</a></p>
      </div>
    </div>
  `;
  res.send(page(req, tr(req, 'about'), html));
});

app.get('/campuses', async (req, res) => {
  const counts = await q(`SELECT campus, COUNT(*)::int as total, SUM(CASE WHEN status='official' THEN 1 ELSE 0 END)::int as official FROM members GROUP BY campus`);
  const cMap = {}; counts.forEach(c => { cMap[c.campus] = c; });
  const html = `
    <h2 style="font-size:1.6rem; font-weight:800; margin-bottom:16px">🏛️ ${h(tr(req, 'campuses'))}</h2>
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:20px;">
      ${Object.keys(CAMPUS).map(k => {
        const c = CAMPUS[k], data = cMap[k] || { total: 0, official: 0 };
        return `<div class="glass-card" style="padding:24px; margin:0">
          <span class="badge registered" style="margin-bottom:10px">${c.c} CAMPUS</span>
          <h3 style="font-size:1.3rem; font-weight:750;">${c.n}</h3>
          <p style="color:var(--text-muted); font-size:12.5px; margin-bottom:12px">📍 ${c.loc}</p>
          <p style="font-size:13px; color:var(--text-2); margin-bottom:16px"><strong>Colleges:</strong> ${c.colleges}</p>
          <div style="display:flex; gap:20px;">
            <div><b style="font-size:1.4rem; color:var(--primary)">${data.total}</b><br><small style="color:var(--text-muted)">Registered</small></div>
            <div><b style="font-size:1.4rem; color:#10b981">${data.official}</b><br><small style="color:var(--text-muted)">Official</small></div>
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
  res.send(page(req, tr(req, 'campuses'), html));
});

// ---------- AUTHENTICATION & RECOVERY ----------
const fails = new Map();
function limited(req, res) {
  const f = fails.get(req.ip) || { n: 0, t: Date.now() };
  if (Date.now() - f.t > 9e5) { f.n = 0; f.t = Date.now(); }
  if (f.n >= 10) { res.status(429).send('Too many login attempts. Please wait 15 minutes.'); return null; }
  return f;
}

app.get('/login', (req, res) => {
  if (req.session.mid) return res.redirect('/student-dashboard');
  res.send(page(req, tr(req, 'login'), `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-icon">🌳</div>
        <h2 class="auth-title">${h(tr(req, 'login'))}</h2>
        <p class="auth-sub">${h(tr(req, 'site'))}</p>
        ${req.query.e ? `<div class="err">Invalid credentials. Please verify your ID and password.</div>` : ''}
        <form method="POST" action="/login">
          <label style="margin-top:0">${h(tr(req, 'no'))} / Student ID</label>
          <input name="u" required placeholder="SM-ROB-2026-0001 or UGRR/..." autocomplete="username">
          <label>${h(tr(req, 'pass'))}</label>
          <input name="p" type="password" required autocomplete="current-password">
          <button class="btn" style="width:100%; padding:14px; margin-top:22px;">Sign in to Portal</button>
        </form>
        <div style="margin-top:20px; display:flex; justify-content:space-between; font-size:13.5px;">
          <a href="/sikkoo-mandoo-register">📝 New Member?</a>
          <a href="/forgot-password" style="color:var(--text-muted)">Forgot Password?</a>
        </div>
      </div>
    </div>
  `));
});

app.post('/login', async (req, res) => {
  const f = limited(req, res); if (!f) return;
  const identifier = String(req.body.u || '').trim();
  const [m] = await q(`SELECT * FROM members WHERE UPPER(member_no)=UPPER($1) OR UPPER(student_id)=UPPER($1)`, [identifier]);
  if (m && bcrypt.compareSync(String(req.body.p || ''), m.password)) {
    req.session.sr = null; req.session.mid = m.member_no; req.session.campus = m.campus;
    await logAudit(req, 'MEMBER_LOGIN', m.member_no, 'Member login');
    return res.redirect('/student-dashboard');
  }
  f.n++; fails.set(req.ip, f); res.redirect('/login?e=1');
});

app.get('/forgot-password', (req, res) => {
  const newPass = req.query.np || '', name = req.query.nm || '';
  res.send(page(req, 'Password Recovery', `
    <div class="auth-wrap"><div class="auth-card">
      <div class="auth-icon">🔑</div>
      <h2 class="auth-title">Password Reset</h2>
      <p class="auth-sub">Enter Student ID and Zone / Woreda to generate a temporary password.</p>
      ${newPass ? `
        <div class="msgok">
          <strong>✅ New password for ${h(name)}</strong>
          <div style="font-size:1.45rem; font-weight:800; letter-spacing:2px; margin:10px 0; text-align:center; padding:10px; border:2px dashed #10b981; border-radius:10px;">${h(newPass)}</div>
        </div>
        <a href="/login" class="btn" style="width:100%;">Go to Login →</a>
      ` : `
        ${req.query.e ? `<div class="err">No matching member found.</div>` : ''}
        <form method="POST" action="/forgot-password">
          <label>Student ID</label><input name="student_id" required>
          <label>Zone and Woreda</label><input name="zone_woreda" required>
          <button class="btn" style="width:100%; margin-top:20px;">Generate New Password</button>
        </form>
      `}
    </div></div>
  `));
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
    <div style="max-width: 680px; margin: 16px auto;">
      <div class="glass-card" style="padding: 28px 24px;">
        <h2 style="text-align:center; font-size:1.45rem; font-weight:800; margin-bottom:14px;">📝 ${h(tr(req, 'reg'))}</h2>
        ${err ? `<div class="err">${h(err)}</div>` : ''}
        <form method="POST" action="/sikkoo-mandoo-register" enctype="multipart/form-data">
          <div class="form-section"><h4>👤 Personal & Academic Information</h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 4px 16px;">
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
            <label>${h(tr(req, 'photo'))} (Auto-compressed)</label>
            <input name="photo" type="file" accept="image/jpeg,image/png,image/webp">
            <label>${h(tr(req, 'pass'))} (Min. 6 chars) *</label>
            <input name="password" type="password" minlength="6" required>
          </div>
          <label style="display:flex; align-items:center; gap:10px; padding:12px; background:rgba(16,185,129,0.1); border-radius:12px;">
            <input type="checkbox" name="want" value="1" style="width:18px; height:18px;">
            <span>${h(tr(req, 'want'))}</span>
          </label>
          <p style="margin-top:20px;"><button class="btn" style="width:100%; padding:14px;">${h(tr(req, 'send'))}</button></p>
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

// ---------- MEMBER DASHBOARD + PNG ID DOWNLOAD + OFFICIAL SVG SEAL ----------
app.get('/student-dashboard', needMember, async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]);
  if (!m) return res.redirect('/logout');
  const base = 'https://' + req.headers.host + '/verify/' + encodeURIComponent(m.member_no);

  const sealSvg = `<svg class="id-seal" width="84" height="84" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="45" fill="none" stroke="#4f6ef7" stroke-width="3" stroke-dasharray="4 2"/>
    <circle cx="50" cy="50" r="35" fill="none" stroke="#4f6ef7" stroke-width="1.5"/>
    <text x="50" y="48" font-size="10" font-weight="800" text-anchor="middle" fill="#4f6ef7">SIIKKOO-MANDOO</text>
    <text x="50" y="61" font-size="8" font-weight="700" text-anchor="middle" fill="#4f6ef7">MWU OFFICIAL</text>
  </svg>`;

  const html = `
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
      <div style="padding:12px 18px 16px; display:flex; justify-content:space-between; align-items:flex-end; border-top:1px solid #f1f5f9;">
        <div>
          <small style="font-weight:600; color:#64748b; font-size:11.5px">Student ID: <span style="color:#0f172a">${h(m.student_id)}</span></small><br>
          <small style="color:#10b981; font-weight:600; font-size:11px">Valid: ${m.renewal_date ? new Date(m.renewal_date).getFullYear() : 2026}</small>
        </div>
        <div id="qr" style="background:#fff; padding:4px; border-radius:8px; border:1px solid #e2e8f0;"></div>
      </div>
    </div>

    <div style="text-align:center; margin-top:18px; display:flex; justify-content:center; gap:10px; flex-wrap:wrap;">
      <button onclick="downloadID()" class="btn g">📥 Download ID (PNG)</button>
      <button onclick="print()" class="btn secondary">🖨️ ${h(tr(req, 'print'))}</button>
      ${m.status === 'registered' ? `<form method="POST" action="/student/upgrade" style="display:inline"><button class="btn">${h(tr(req, 'upgrade'))}</button></form>` : ''}
      <form method="POST" action="/student/renew" style="display:inline"><button class="btn secondary">🔄 ${h(tr(req, 'renew'))}</button></form>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    <script>
      new QRCode(document.getElementById('qr'),{text:${JSON.stringify(base)},width:62,height:62,colorDark:"#0f172a",colorLight:"#ffffff"});
      function downloadID(){
        html2canvas(document.getElementById('idCardBox'), { scale: 2, useCORS: true }).then(canvas => {
          const a = document.createElement('a');
          a.download = ${JSON.stringify(m.member_no + '-ID.png')};
          a.href = canvas.toDataURL('image/png');
          a.click();
        });
      }
    </script>
  `;
  res.send(page(req, tr(req, 'dash'), html));
});

app.post('/student/upgrade', needMember, async (req, res) => {
  await q(`UPDATE members SET status='pending' WHERE member_no=$1 AND status='registered'`, [req.session.mid]);
  res.redirect('/student-dashboard?ok=1');
});
app.post('/student/renew', needMember, async (req, res) => {
  await q(`UPDATE members SET renewal_date=NOW() WHERE member_no=$1`, [req.session.mid]);
  res.redirect('/student-dashboard?ok=1');
});

// ---------- GLOBAL PORTAL SEARCH ----------
app.get('/portal/search', needMember, async (req, res) => {
  const term = String(req.query.q || '').trim().slice(0, 60);
  if (!term) return res.redirect('/student-dashboard');
  const like = '%' + term + '%';
  const posts = await q(`SELECT * FROM posts WHERE title_en ILIKE $1 OR title_om ILIKE $1 OR title_am ILIKE $1 OR body_en ILIKE $1 OR body_om ILIKE $1 ORDER BY id DESC LIMIT 30`, [like]);
  const meets = await q(`SELECT * FROM meetings WHERE title ILIKE $1 OR agenda ILIKE $1 OR minutes ILIKE $1 ORDER BY id DESC LIMIT 15`, [like]);

  const html = portalMenu('') + `
    <div class="glass-card">
      <h3 style="margin-bottom:6px;">🔍 Search Results for "${h(term)}"</h3>
      <p style="color:var(--text-muted); font-size:13px;">Found ${posts.length} posts and ${meets.length} meeting records.</p>
    </div>
    ${posts.map(p => postCard(req, p)).join('')}
    ${meets.map(m => `<div class="glass-card"><h4>🤝 ${h(m.title)} (${h(m.meeting_date)})</h4><p style="font-size:13px; color:var(--text-2); margin-top:6px;">${h(m.agenda || m.minutes || '').slice(0, 220)}</p></div>`).join('')}
  `;
  res.send(page(req, 'Search: ' + term, html));
});

// ---------- PORTAL CONTENT + EVENTS COUNTDOWN & RSVP ----------
TYPES.forEach(tp => {
  app.get('/portal/' + SLUG[tp], needMember, async (req, res) => {
    const cf = req.query.campus || '';
    const query = cf ? `SELECT * FROM posts WHERE type=$1 AND (campus=$2 OR campus='all') ORDER BY is_emergency DESC, id DESC LIMIT 60`
                     : `SELECT * FROM posts WHERE type=$1 ORDER BY is_emergency DESC, id DESC LIMIT 60`;
    const rows = await q(query, cf ? [tp, cf] : [tp]);

    let rsvpCounts = {}, myRsvps = new Set();
    if (tp === 'event' && rows.length) {
      const counts = await q(`SELECT post_id, COUNT(*)::int c FROM event_rsvps GROUP BY post_id`);
      counts.forEach(r => rsvpCounts[r.post_id] = r.c);
      const mine = await q(`SELECT post_id FROM event_rsvps WHERE member_no=$1`, [req.session.mid]);
      mine.forEach(r => myRsvps.add(r.post_id));
    }

    let content = '';
    if (tp === 'gallery') {
      content = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px">
        ${rows.map(p => `<div class="glass-card" style="padding:12px;margin:0">
          <img style="width:100%;height:190px;object-fit:cover;border-radius:10px;margin-bottom:8px" src="/photo/${p.image_id}">
          <p style="margin:0;font-weight:650;font-size:14px">${h(postT(req, p, 'title'))}</p>
        </div>`).join('')}
      </div>`;
    } else if (tp === 'event') {
      content = rows.map(p => {
        const joined = myRsvps.has(p.id);
        const cnt = rsvpCounts[p.id] || 0;
        const extra = `
          <div style="margin-top:14px; padding-top:12px; border-top:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <span class="badge registered" data-countdown="${h(p.event_date || '')}">📅 ${h(p.event_date || 'Upcoming')}</span>
            <form method="POST" action="/portal/events/${p.id}/rsvp" style="display:inline">
              <button class="btn ${joined ? 'g' : 'secondary'}" style="padding:7px 14px; font-size:12.5px;">
                ${joined ? '✔ Going' : '✋ I will attend'} (${cnt})
              </button>
            </form>
          </div>
        `;
        return postCard(req, p, extra);
      }).join('') + `
      <script>
        document.querySelectorAll('[data-countdown]').forEach(el => {
          const d = new Date(el.getAttribute('data-countdown'));
          if (isNaN(d.getTime())) return;
          const diff = Math.ceil((d - new Date()) / 86400000);
          if (diff > 0) el.textContent = '⏳ ' + diff + ' days left (' + el.getAttribute('data-countdown') + ')';
          else if (diff === 0) el.textContent = '🔥 Happening Today!';
        });
      </script>`;
    } else {
      content = rows.map(p => postCard(req, p)).join('');
    }

    const html = portalMenu('/portal/' + SLUG[tp]) +
      (rows.length ? content : `<div class="glass-card" style="text-align:center;padding:48px 24px"><p style="color:var(--text-muted)">${h(tr(req, 'none'))}</p></div>`);
    res.send(page(req, tr(req, tp), html));
  });
});

app.post('/portal/events/:id/rsvp', needMember, async (req, res) => {
  const pid = parseInt(req.params.id, 10) || 0;
  try {
    await q(`INSERT INTO event_rsvps (post_id, member_no) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [pid, req.session.mid]);
  } catch (e) {}
  res.redirect('/portal/events?rsvp=1');
});

app.get('/portal/meetings', needMember, async (req, res) => {
  const meets = await q(`SELECT * FROM meetings ORDER BY id DESC LIMIT 30`);
  const html = portalMenu('/portal/meetings') + `
    <div class="glass-card" style="padding:24px">
      <h3 style="font-size:1.3rem; font-weight:800; margin-bottom:14px">🤝 Meetings & Minutes</h3>
      ${meets.map(m => `
        <div class="form-section">
          <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
            <h4>${h(m.title)}</h4>
            <span class="badge registered">${h(m.meeting_date || '')}</span>
          </div>
          ${m.agenda ? `<p style="font-size:13px; margin-top:6px"><strong>Agenda:</strong> ${h(m.agenda)}</p>` : ''}
          ${m.minutes ? `<p style="font-size:13px; margin-top:6px"><strong>Minutes:</strong> ${h(m.minutes).replace(/\n/g, '<br>')}</p>` : ''}
          ${m.resolutions ? `<p style="font-size:13px; margin-top:6px; color:#10b981"><strong>Resolutions:</strong> ${h(m.resolutions)}</p>` : ''}
          ${m.file_id ? `<p style="margin-top:8px"><a href="/photo/${m.file_id}?dl=1" class="btn secondary" style="padding:5px 12px; font-size:12px">📥 Signed Minutes</a></p>` : ''}
        </div>
      `).join('') || `<p style="color:var(--text-muted); text-align:center;">No meeting minutes yet.</p>`}
    </div>
  `;
  res.send(page(req, tr(req, 'meetings'), html));
});

app.get('/portal/leadership', needMember, async (req, res) => {
  const ls = await q(`SELECT * FROM leaders ORDER BY (level='central') DESC, ord, id`);
  const grp = (t, list) => list.length ? `<h3 style="margin:22px 0 12px; color:var(--primary); font-size:1.1rem; font-weight:750">${h(t)}</h3>
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:16px">
    ${list.map(x => `
      <div class="glass-card" style="text-align:center; margin:0; padding:20px">
        <img style="width:90px; height:90px; border-radius:50%; object-fit:cover; border:3px solid #93c5fd; margin:auto;" src="${x.photo_id ? '/photo/' + x.photo_id : 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27/%3E'}">
        <h4 style="margin:10px 0 3px;">${h(x.name)}</h4>
        <p style="color:var(--primary); font-weight:650; font-size:12px">${h(x.position_en || x.position_om || x.position_am)}</p>
        <small style="color:var(--text-muted); font-size:11px">Term: ${h(x.term || '2025-2026')}</small>
      </div>`).join('')}
    </div>` : '';

  const html = portalMenu('/portal/leadership') +
    grp('Central Executive Leadership', ls.filter(x => x.level === 'central')) +
    Object.keys(CAMPUS).map(k => grp(campusName(req, k) + ' Representatives', ls.filter(x => x.level !== 'central' && x.campus === k))).join('');
  res.send(page(req, tr(req, 'leadership'), html || `<div class="glass-card" style="text-align:center;padding:48px">${h(tr(req, 'none'))}</div>`));
});

app.get('/portal/finance', needMember, async (req, res) => {
  const rs = await q(`SELECT * FROM finance_reports WHERE approved=1 ORDER BY period DESC, id DESC LIMIT 36`);
  const html = portalMenu('/portal/finance') + (rs.map(r => {
    const d = JSON.parse(r.detail || '{}');
    return `<div class="glass-card" style="padding:22px">
      <h4 style="margin-bottom:14px">${h(r.period)} · ${h(r.campus === 'all' ? 'All Campuses' : campusName(req, r.campus))}</h4>
      <div class="stat-row">
        <div class="stat-chip"><b>${Number(r.starting_balance || 0).toLocaleString()}</b><span>Starting</span></div>
        <div class="stat-chip"><b style="color:#10b981">${Number(r.income).toLocaleString()}</b><span>Income</span></div>
        <div class="stat-chip"><b style="color:#ef4444">${Number(r.expense).toLocaleString()}</b><span>Expense</span></div>
        <div class="stat-chip"><b>${(Number(r.starting_balance || 0) + Number(r.income) - Number(r.expense)).toLocaleString()}</b><span>Net ETB</span></div>
      </div>
      <div style="font-size:12.5px; color:var(--text-2);">${Object.keys(d).map(k => `<b>${h(k)}</b>: ${Number(d[k]).toLocaleString()} ETB`).join(' • ')}</div>
    </div>`;
  }).join('') || `<div class="glass-card" style="text-align:center;padding:48px">${h(tr(req, 'none'))}</div>`);
  res.send(page(req, tr(req, 'finance'), html));
});

app.get('/portal/support', needMember, async (req, res) => {
  const reqs = await q(`SELECT * FROM support_requests WHERE member_no=$1 ORDER BY id DESC LIMIT 20`, [req.session.mid]);
  const html = portalMenu('/portal/support') + `
    <div class="glass-card">
      <h3 style="margin-bottom:12px">🤝 Student Support Desk</h3>
      <form method="POST" action="/portal/support">
        <label>Subject</label><input name="subject" required>
        <label>Category</label>
        <select name="category">
          <option value="academic">Academic Support</option>
          <option value="financial">Welfare Assistance</option>
          <option value="campus_life">Campus Life</option>
          <option value="other">Other</option>
        </select>
        <label>Message</label><textarea name="message" required></textarea>
        <p style="margin-top:16px"><button class="btn">Send Request</button></p>
      </form>
    </div>
    <div class="glass-card">
      <h4 style="margin-bottom:12px">Your Previous Inquiries</h4>
      ${reqs.map(r => `<div class="form-section">
        <div style="display:flex; justify-content:space-between;"><b>${h(r.subject)}</b><span class="badge ${r.status === 'closed' ? 'official' : 'pending'}">${h(r.status)}</span></div>
        <p style="font-size:13px; margin-top:6px">${h(r.message)}</p>
        ${r.reply ? `<div class="msgok" style="margin-top:8px"><strong>Reply:</strong> ${h(r.reply)}</div>` : ''}
      </div>`).join('') || `<p style="color:var(--text-muted)">No inquiries yet.</p>`}
    </div>
  `;
  res.send(page(req, tr(req, 'support'), html));
});

app.post('/portal/support', needMember, async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]);
  if (m && req.body.subject && req.body.message) {
    await q(`INSERT INTO support_requests (member_no, name, campus, subject, category, message) VALUES ($1,$2,$3,$4,$5,$6)`,
      [m.member_no, m.name, m.campus, req.body.subject.slice(0, 150), req.body.category || 'general', req.body.message.slice(0, 3000)]);
  }
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
  res.send(page(req, tr(req, 'verify'), m ? `
    <div class="glass-card" style="max-width:380px; margin:36px auto; text-align:center;">
      <h2 style="color:#10b981; margin-bottom:14px;">${h(tr(req, 'valid'))}</h2>
      <img style="width:100px; height:125px; border-radius:12px; object-fit:cover;" src="${m.photo_id ? '/photo/' + m.photo_id : ''}">
      <h3 style="margin:12px 0 4px;">${h(m.name)}</h3>
      <p style="color:var(--primary); font-weight:700;">${h(m.member_no)}</p>
      <p style="color:var(--text-muted); font-size:12.5px; margin-bottom:10px;">${h(campusName(req, m.campus))} · ${h(m.department)}</p>
      <span class="badge ${m.status}">${h(tr(req, m.status))}</span>
    </div>
  ` : `<div class="glass-card" style="max-width:380px; margin:36px auto; text-align:center;"><h2 style="color:#ef4444">${h(tr(req, 'invalid'))}</h2></div>`));
});

app.get('/privacy', (req, res) => res.send(page(req, tr(req, 'privacy'), `<div class="glass-card"><h2>🔒 Privacy Policy</h2><p style="margin-top:10px; color:var(--text-2);">Student personal data is used strictly for Siikkoo-Mandoo MWU membership IDs and association communication.</p></div>`)));
app.get('/terms', (req, res) => res.send(page(req, tr(req, 'terms'), `<div class="glass-card"><h2>📜 Terms & Conditions</h2><p style="margin-top:10px; color:var(--text-2);">Members agree to abide by MWU student conduct and Siikkoo-Mandoo bylaws.</p></div>`)));

// ---------- ADMIN PORTAL + INTERACTIVE CHARTS ----------
app.get('/admin-login', (req, res) => {
  res.send(page(req, 'Admin Access', `
    <div class="auth-wrap"><div class="auth-card" style="max-width:400px;">
      <div class="auth-icon">🔐</div>
      <h2 class="auth-title">Admin Access</h2>
      <p class="auth-sub">Authorized association staff only</p>
      ${req.query.e ? '<div class="err">Invalid username or password.</div>' : ''}
      <form method="POST" action="/admin-login">
        <label>Username</label><input name="u" required>
        <label>Password</label><input name="p" type="password" required>
        <button class="btn" style="width:100%; margin-top:22px;">Sign In</button>
      </form>
    </div></div>
  `));
});

app.post('/admin-login', async (req, res) => {
  const f = limited(req, res); if (!f) return;
  const u = String(req.body.u || '').trim(), pw = String(req.body.p || '');
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
  f.n++; fails.set(req.ip, f); res.redirect('/admin-login?e=1');
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

const A = (req, title, body) => {
  const links = [
    ['/admin', '📊', 'Overview', null, 'blue'],
    ['/admin/members', '👥', 'Members', 'members', 'pink'],
    ['/admin/content/announcement', '📢', 'Announcements', 'content', 'purple'],
    ['/admin/content/news', '📰', 'News', 'content', 'cyan'],
    ['/admin/content/event', '📅', 'Events', 'content', 'orange'],
    ['/admin/meetings', '🤝', 'Meetings', 'meetings', 'indigo'],
    ['/admin/content/education', '📚', 'Education', 'content', 'blue'],
    ['/admin/content/heritage', '🏛️', 'Heritage', 'content', 'brown'],
    ['/admin/content/gallery', '🖼️', 'Gallery', 'content', 'teal'],
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
const files6 = fields => (req, res, next) => up6.fields(fields)(req, res, err => (err ? res.status(400).send('File size exceeds 6 MB') : next()));
async function saveFile(f) {
  if (!f || !OKMIME.test(f.mimetype)) return null;
  return (await q(`INSERT INTO files (mime,data,name) VALUES ($1,$2,$3) RETURNING id`, [f.mimetype, f.buffer, String(f.originalname || 'document').slice(0, 100)]))[0].id;
}
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const sel = (name, opts, cur) => `<select name="${name}">${opts.map(o => `<option value="${o[0]}"${cur === o[0] ? ' selected' : ''}>${h(o[1])}</option>`).join('')}</select>`;
const campusOpts = (sc, all) => (sc ? [[sc, CAMPUS[sc].n]] : (all ? [['all', 'All campuses']] : []).concat(Object.keys(CAMPUS).map(k => [k, CAMPUS[k].n])));

// Admin Overview with Chart.js
app.get('/admin', needStaff, async (req, res) => {
  const sc = scopeOf(req), w = sc ? ' WHERE campus=$1' : '', pr = sc ? [sc] : [];
  const [m] = await q(`SELECT COUNT(*)::int n,
    SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END)::int p,
    SUM(CASE WHEN status='official' THEN 1 ELSE 0 END)::int o,
    SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END)::int r,
    SUM(CASE WHEN campus='robe' THEN 1 ELSE 0 END)::int robe,
    SUM(CASE WHEN campus='goba' THEN 1 ELSE 0 END)::int goba,
    SUM(CASE WHEN campus='shashamane' THEN 1 ELSE 0 END)::int sha
    FROM members${w}`, pr);
  const [resets] = await q(`SELECT COUNT(*)::int pending FROM password_resets WHERE status='pending'`);

  res.send(A(req, 'Admin Dashboard', `
    <div class="admin-hero">
      <h2>Welcome, ${h(req.session.sname || 'Admin')}</h2>
      <p>Live Analytics & Control Center · Siikkoo-Mandoo MWU</p>
    </div>
    <div class="stat-grid">
      <div class="stat-card"><div class="num" style="color:#4f6ef7">${m.n || 0}</div><div class="label">Total Members</div></div>
      <div class="stat-card"><div class="num" style="color:#10b981">${m.o || 0}</div><div class="label">Official</div></div>
      <div class="stat-card"><div class="num" style="color:#f59e0b">${m.p || 0}</div><div class="label">Pending</div></div>
      <div class="stat-card"><div class="num" style="color:#ef4444">${m.r || 0}</div><div class="label">Rejected</div></div>
    </div>

    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:16px;">
      <div class="glass-card"><h4 style="margin-bottom:12px;">📊 Members by Campus</h4><canvas id="campusChart" height="200"></canvas></div>
      <div class="glass-card"><h4 style="margin-bottom:12px;">📈 Membership Status</h4><canvas id="statusChart" height="200"></canvas></div>
    </div>

    ${resets.pending > 0 ? `<div class="glass-card" style="border-left:4px solid #f59e0b;">⚠️ You have <b>${resets.pending}</b> pending password reset requests. <a href="/admin/resets" style="margin-left:10px; font-weight:700">Review →</a></div>` : ''}

    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
      new Chart(document.getElementById('campusChart'), {
        type: 'bar',
        data: {
          labels: ['Robe Main', 'Goba Health', 'Shashamane'],
          datasets: [{ label: 'Members', data: [${m.robe || 0}, ${m.goba || 0}, ${m.sha || 0}], backgroundColor: ['#4f6ef7','#10b981','#f59e0b'], borderRadius: 10 }]
        },
        options: { plugins: { legend: { display: false } } }
      });
      new Chart(document.getElementById('statusChart'), {
        type: 'doughnut',
        data: {
          labels: ['Official', 'Pending', 'Registered', 'Rejected'],
          datasets: [{ data: [${m.o || 0}, ${m.p || 0}, ${(m.n || 0) - (m.o || 0) - (m.p || 0) - (m.r || 0)}, ${m.r || 0}], backgroundColor: ['#10b981','#f59e0b','#4f6ef7','#ef4444'] }]
        }
      });
    </script>
  `));
});

// Admin Members
app.get('/admin/members', guard('members'), async (req, res) => {
  const sc = scopeOf(req), cf = sc || (CAMPUS[req.query.campus] ? req.query.campus : '');
  const statusFilter = req.query.status || '';
  const qs = String(req.query.q || '').trim().slice(0, 50), pr = [], c = [];
  if (cf) { pr.push(cf); c.push(`campus=$${pr.length}`); }
  if (statusFilter) { pr.push(statusFilter); c.push(`status=$${pr.length}`); }
  if (qs) { pr.push('%' + qs + '%'); c.push(`(name ILIKE $${pr.length} OR member_no ILIKE $${pr.length} OR student_id ILIKE $${pr.length} OR phone ILIKE $${pr.length} OR zone_woreda ILIKE $${pr.length})`); }

  const ms = await q(`SELECT * FROM members ${c.length ? 'WHERE ' + c.join(' AND ') : ''} ORDER BY id DESC LIMIT 400`, pr);
  const act = (id, a, t, cls) => `<form method="POST" action="/admin/members/${id}/${a}" style="display:inline"><button class="btn ${cls || ''}" style="padding:5px 10px;font-size:11.5px;box-shadow:none">${t}</button></form>`;
  const exportQs = new URLSearchParams({ q: qs, campus: cf, status: statusFilter }).toString();

  res.send(A(req, 'Members Management', `
    <div class="glass-card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:14px">
        <h3>👥 Members (${ms.length})</h3>
        <a class="btn excel" href="/admin/members/export?${exportQs}" style="padding:9px 16px; font-size:13px">⬇ Download Excel (CSV)</a>
      </div>
      <form style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px" method="GET" action="/admin/members">
        <input name="q" value="${h(qs)}" placeholder="Search..." style="flex:1; min-width:180px">
        ${sc ? '' : sel('campus', [['', 'All Campuses']].concat(campusOpts(null)), cf)}
        ${sel('status', [['', 'All Statuses'], ['official', 'Official'], ['pending', 'Pending'], ['registered', 'Registered'], ['rejected', 'Rejected']], statusFilter)}
        <button class="btn">Filter</button>
      </form>
      <div class="tw"><table>
        <tr><th>No</th><th>Name</th><th>Campus</th><th>Dept</th><th>Phone</th><th>Status</th><th>Actions</th></tr>
        ${ms.map(m => `<tr>
          <td><b>${h(m.member_no)}</b></td>
          <td>${h(m.name)}<br><small style="color:var(--text-muted)">${h(m.student_id)}</small></td>
          <td>${h(campusName(req, m.campus))}</td>
          <td>${h(m.department)} · Y${h(m.year)}</td>
          <td>${h(m.phone || '')}</td>
          <td><span class="badge ${m.status}">${h(m.status)}</span></td>
          <td style="white-space:nowrap">
            <a class="btn edit-btn" href="/admin/members/${m.id}/edit" style="padding:5px 10px;font-size:11.5px">✏️</a>
            ${m.status !== 'official' ? act(m.id, 'approve', 'Approve', 'g') : ''}
            ${m.status === 'pending' ? act(m.id, 'reject', 'Reject', 'danger') : ''}
            ${m.status === 'official' ? act(m.id, 'revoke', 'Revoke', 'secondary') : ''}
          </td>
        </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;padding:24px">No members found.</td></tr>'}
      </table></div>
    </div>
  `));
});

app.get('/admin/members/export', guard('members'), async (req, res) => {
  const sc = scopeOf(req), cf = sc || (CAMPUS[req.query.campus] ? req.query.campus : '');
  const statusFilter = req.query.status || '', qs = String(req.query.q || '').trim().slice(0, 50), pr = [], c = [];
  if (cf) { pr.push(cf); c.push(`campus=$${pr.length}`); }
  if (statusFilter) { pr.push(statusFilter); c.push(`status=$${pr.length}`); }
  if (qs) { pr.push('%' + qs + '%'); c.push(`(name ILIKE $${pr.length} OR member_no ILIKE $${pr.length} OR student_id ILIKE $${pr.length})`); }
  const rows = await q(`SELECT * FROM members ${c.length ? 'WHERE ' + c.join(' AND ') : ''} ORDER BY id DESC LIMIT 5000`, pr);
  const headers = ['member_no','name','gender','student_id','campus','college','department','year','zone_woreda','phone','email','telegram_handle','status','created_at'];
  const lines = [headers.join(',')].concat(rows.map(r => headers.map(k => csvEsc(r[k])).join(',')));
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="sikkoo-members.csv"`).send('\uFEFF' + lines.join('\n'));
});

app.get('/admin/members/:id/edit', guard('members'), async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  if (!m) return res.redirect('/admin/members');
  const s = (k, opts) => opts.map(x => `<option value="${h(x[0])}"${String(m[k]) === String(x[0]) ? ' selected' : ''}>${h(x[1])}</option>`).join('');
  res.send(A(req, 'Edit Member', `
    <div class="glass-card" style="max-width:800px; margin:0 auto">
      <h3>✏️ Edit ${h(m.name)} (${h(m.member_no)})</h3>
      <form method="POST" action="/admin/members/${m.id}/edit" enctype="multipart/form-data">
        <div class="form-section" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:8px 14px">
          <div><label>Name</label><input name="name" required value="${h(m.name)}"></div>
          <div><label>Gender</label><select name="gender">${s('gender', [['M','Male'],['F','Female']])}</select></div>
          <div><label>Student ID</label><input name="student_id" required value="${h(m.student_id)}"></div>
          <div><label>Phone</label><input name="phone" required value="${h(m.phone)}"></div>
          <div><label>Campus</label><select name="campus">${s('campus', Object.keys(CAMPUS).map(k => [k, CAMPUS[k].n]))}</select></div>
          <div><label>College</label><input name="college" value="${h(m.college || '')}"></div>
          <div><label>Department</label><input name="department" value="${h(m.department || '')}"></div>
          <div><label>Year</label><select name="year">${s('year', [1,2,3,4,5,6].map(x => [String(x), 'Year '+x]))}</select></div>
          <div><label>Zone/Woreda</label><input name="zone_woreda" value="${h(m.zone_woreda || '')}"></div>
          <div><label>Status</label><select name="status">${s('status', [['registered','Registered'],['pending','Pending'],['official','Official'],['rejected','Rejected']])}</select></div>
          <div><label>New Password (Optional)</label><input name="password" type="password" minlength="6"></div>
          <div><label>Replace Photo</label><input name="photo" type="file" accept="image/*"></div>
        </div>
        <button class="btn">💾 Save Changes</button> <a class="btn secondary" href="/admin/members">Back</a>
      </form>
    </div>
  `));
});

app.post('/admin/members/:id/edit', guard('members'), files6([{ name: 'photo', maxCount: 1 }]), async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0, [m] = await q(`SELECT * FROM members WHERE id=$1`, [id]);
  if (!m) return res.redirect('/admin/members');
  const b = req.body;
  let photo_id = m.photo_id;
  try { const f = ((req.files || {}).photo || [])[0]; if (f) photo_id = await saveFile(f); } catch (e) {}
  await q(`UPDATE members SET name=$1, gender=$2, student_id=$3, phone=$4, campus=$5, college=$6, department=$7, year=$8, zone_woreda=$9, status=$10, photo_id=$11 WHERE id=$12`,
    [b.name.trim(), b.gender === 'F' ? 'F' : 'M', b.student_id.trim(), b.phone.trim(), CAMPUS[b.campus] ? b.campus : m.campus,
     b.college || '', b.department || '', String(b.year || '1'), b.zone_woreda || '', b.status || m.status, photo_id, id]);
  if (b.password && String(b.password).length >= 6) {
    await q(`UPDATE members SET password=$1 WHERE id=$2`, [bcrypt.hashSync(String(b.password), 10), id]);
  }
  res.redirect('/admin/members/' + id + '/edit?saved=1');
});

[['approve', 'official'], ['reject', 'rejected'], ['revoke', 'registered']].forEach(([a, st]) => {
  app.post('/admin/members/:id/' + a, guard('members'), async (req, res) => {
    await q(`UPDATE members SET status=$1 WHERE id=$2`, [st, parseInt(req.params.id, 10) || 0]);
    res.redirect('/admin/members?ok=1');
  });
});

// Admin Meetings
app.get('/admin/meetings', guard('meetings'), async (req, res) => {
  const meets = await q(`SELECT * FROM meetings ORDER BY id DESC LIMIT 50`);
  res.send(A(req, 'Meetings', `
    <div class="glass-card">
      <h3>Record Meeting</h3>
      <form method="POST" action="/admin/meetings" enctype="multipart/form-data">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px">
          <div><label>Title</label><input name="title" required></div>
          <div><label>Date</label><input name="meeting_date" type="date" required></div>
          <div><label>Campus</label>${sel('campus', campusOpts(scopeOf(req), true))}</div>
        </div>
        <label>Agenda</label><textarea name="agenda" rows="2"></textarea>
        <label>Minutes</label><textarea name="minutes" rows="3"></textarea>
        <label>Resolutions</label><textarea name="resolutions" rows="2"></textarea>
        <label>File</label><input name="file" type="file">
        <p style="margin-top:14px"><button class="btn">Save Minutes</button></p>
      </form>
    </div>
    <div class="glass-card">${meets.map(m => `<div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border)">
      <span><b>${h(m.title)}</b> (${h(m.meeting_date)})</span>
      <form method="POST" action="/admin/meetings/${m.id}/delete"><button class="btn danger" style="padding:4px 10px; font-size:11.5px">Delete</button></form>
    </div>`).join('')}</div>
  `));
});

app.post('/admin/meetings', guard('meetings'), files6([{ name: 'file', maxCount: 1 }]), async (req, res) => {
  const b = req.body, fl = await saveFile(((req.files || {}).file || [])[0]);
  if (b.title) await q(`INSERT INTO meetings (campus, title, meeting_date, agenda, minutes, resolutions, file_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [b.campus || 'all', b.title, b.meeting_date, b.agenda, b.minutes, b.resolutions, fl]);
  res.redirect('/admin/meetings?ok=1');
});
app.post('/admin/meetings/:id/delete', guard('meetings'), async (req, res) => {
  await q(`DELETE FROM meetings WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  res.redirect('/admin/meetings?ok=1');
});

// Admin Content + Telegram Auto-Post
app.get('/admin/content/:type', guard('content'), async (req, res) => {
  const tp = req.params.type; if (!TYPES.includes(tp)) return res.redirect('/admin');
  const sc = scopeOf(req), ps = await q(`SELECT * FROM posts WHERE type=$1 ${sc ? 'AND campus=$2' : ''} ORDER BY id DESC LIMIT 60`, sc ? [tp, sc] : [tp]);
  res.send(A(req, tp, `
    <div class="glass-card">
      <h3>Publish ${h(tp.toUpperCase())}</h3>
      <form method="POST" action="/admin/content/${tp}" enctype="multipart/form-data">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px">
          <div><label>Campus</label>${sel('campus', campusOpts(sc, true))}</div>
          ${tp === 'announcement' ? `<div><label>Priority</label><select name="is_emergency"><option value="0">Normal</option><option value="1">🚨 Emergency</option></select></div>` : ''}
          <div><label>Event Date</label><input name="event_date" type="${tp === 'event' ? 'date' : 'text'}" placeholder="YYYY-MM-DD"></div>
        </div>
        <label>Title (Oromo / Amharic / English)</label>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px">
          <input name="title_om" placeholder="Afaan Oromoo"><input name="title_am" placeholder="አማርኛ"><input name="title_en" placeholder="English">
        </div>
        ${tp === 'gallery' ? '' : `<label>Body</label><div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px">
          <textarea name="body_om" rows="3" placeholder="Afaan Oromoo"></textarea><textarea name="body_am" rows="3" placeholder="አማርኛ"></textarea><textarea name="body_en" rows="3" placeholder="English"></textarea>
        </div>`}
        <label>Image</label><input name="image" type="file" accept="image/*">
        ${['document', 'education', 'heritage'].includes(tp) ? `<label>Document PDF</label><input name="file" type="file">` : ''}
        <p style="margin-top:16px"><button class="btn">Publish to Portal</button></p>
      </form>
    </div>
    <div class="glass-card">${ps.map(p => `<div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border)">
      <span><b>${h(p.title_en || p.title_om || p.title_am)}</b> (${h(p.campus)})</span>
      <form method="POST" action="/admin/content/${tp}/${p.id}/delete"><button class="btn danger" style="padding:4px 10px; font-size:11.5px">Delete</button></form>
    </div>`).join('')}</div>
  `));
});

app.post('/admin/content/:type', guard('content'), files6([{ name: 'image', maxCount: 1 }, { name: 'file', maxCount: 1 }]), async (req, res) => {
  const tp = req.params.type, b = req.body, sc = scopeOf(req), s = (k, n) => String(b[k] || '').trim().slice(0, n);
  if (!TYPES.includes(tp)) return res.redirect('/admin');
  const img = await saveFile(((req.files || {}).image || [])[0]), fl = await saveFile(((req.files || {}).file || [])[0]);
  const tEn = s('title_en', 200), tOm = s('title_om', 200), tAm = s('title_am', 200);
  const isEm = parseInt(b.is_emergency, 10) || 0;
  if (tOm || tEn || tAm) {
    await q(`INSERT INTO posts (type, campus, title_om, title_en, title_am, body_om, body_en, body_am, event_date, is_emergency, image_id, file_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [tp, sc || (CAMPUS[b.campus] ? b.campus : 'all'), tOm, tEn, tAm, s('body_om', 4000), s('body_en', 4000), s('body_am', 4000), b.event_date || '', isEm, img, fl]);
    if (['announcement', 'news', 'event'].includes(tp)) {
      postToTelegram(tEn || tOm || tAm, s('body_en', 800) || s('body_om', 800) || s('body_am', 800), tp, isEm);
    }
  }
  res.redirect('/admin/content/' + tp + '?ok=1');
});

app.post('/admin/content/:type/:id/delete', guard('content'), async (req, res) => {
  await q(`DELETE FROM posts WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  res.redirect('/admin/content/' + req.params.type + '?ok=1');
});

// Admin Leaders, Finance, Support, Staff, Resets, Audit, Backup
app.get('/admin/leaders', guard('leaders'), async (req, res) => {
  const sc = scopeOf(req), ls = await q(`SELECT * FROM leaders ${sc ? 'WHERE campus=$1' : ''} ORDER BY (level='central') DESC, ord, id`, sc ? [sc] : []);
  res.send(A(req, 'Leaders', `
    <div class="glass-card">
      <h3>Add Leader</h3>
      <form method="POST" action="/admin/leaders" enctype="multipart/form-data">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px">
          <div><label>Name</label><input name="name" required></div>
          <div><label>Term</label><input name="term" value="2025-2026"></div>
          <div><label>Level</label>${sel('level', sc ? [['campus', 'Campus']] : [['central', 'Central'], ['campus', 'Campus']])}</div>
          <div><label>Campus</label>${sel('campus', campusOpts(sc, false))}</div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px">
          <div><label>Position (OM)</label><input name="position_om"></div>
          <div><label>Position (AM)</label><input name="position_am"></div>
          <div><label>Position (EN)</label><input name="position_en"></div>
        </div>
        <label>Photo</label><input name="photo" type="file" accept="image/*">
        <p style="margin-top:14px"><button class="btn">Save Leader</button></p>
      </form>
    </div>
    <div class="glass-card">${ls.map(x => `<div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border)">
      <span><b>${h(x.name)}</b> · ${h(x.position_en || x.position_om)}</span>
      <form method="POST" action="/admin/leaders/${x.id}/delete"><button class="btn danger" style="padding:4px 10px; font-size:11.5px">Delete</button></form>
    </div>`).join('')}</div>
  `));
});

app.post('/admin/leaders', guard('leaders'), files6([{ name: 'photo', maxCount: 1 }]), async (req, res) => {
  const b = req.body, sc = scopeOf(req), pid = await saveFile(((req.files || {}).photo || [])[0]);
  const lvl = sc ? 'campus' : (b.level === 'campus' ? 'campus' : 'central');
  if (b.name) await q(`INSERT INTO leaders (name, position_om, position_en, position_am, term, level, campus, photo_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [b.name, b.position_om || '', b.position_en || '', b.position_am || '', b.term || '2025-2026', lvl, lvl === 'central' ? 'all' : (sc || b.campus || 'robe'), pid]);
  res.redirect('/admin/leaders?ok=1');
});
app.post('/admin/leaders/:id/delete', guard('leaders'), async (req, res) => {
  await q(`DELETE FROM leaders WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  res.redirect('/admin/leaders?ok=1');
});

const KINDS = [['contribution', 'Contribution'], ['donation', 'Donation'], ['fundraising', 'Fundraising'], ['income', 'Other Income'], ['expense', 'Expense']];
app.get('/admin/finance', guard('finance'), async (req, res) => {
  const sc = scopeOf(req), rp = await q(`SELECT * FROM finance_reports ${sc ? 'WHERE campus=$1' : ''} ORDER BY id DESC LIMIT 24`, sc ? [sc] : []);
  res.send(A(req, 'Finance', `
    <div class="glass-card">
      <h3>Record Transaction</h3>
      <form method="POST" action="/admin/finance/tx">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px">
          <div><label>Type</label>${sel('kind', KINDS)}</div>
          <div><label>Amount (ETB)</label><input name="amount" type="number" step="0.01" required></div>
          <div><label>Date</label><input name="tdate" type="date" required></div>
          <div><label>Campus</label>${sel('campus', campusOpts(sc, true))}</div>
        </div>
        <label>Note</label><input name="note">
        <p style="margin-top:14px"><button class="btn">Record</button></p>
      </form>
    </div>
    <div class="glass-card">
      <h3>Generate Report</h3>
      <form method="POST" action="/admin/finance/report" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end">
        <div><label>Period (YYYY-MM)</label><input name="period" placeholder="2026-11" required></div>
        <div><label>Starting Balance</label><input name="starting_balance" type="number" value="0"></div>
        <div><label>Campus</label>${sel('campus', campusOpts(sc, true))}</div>
        <button class="btn secondary">Generate</button>
      </form>
      <div class="tw" style="margin-top:14px"><table>
        <tr><th>Period</th><th>Campus</th><th>Income</th><th>Expense</th><th>Status</th><th>Action</th></tr>
        ${rp.map(r => `<tr>
          <td>${h(r.period)}</td><td>${h(r.campus)}</td><td style="color:#10b981">${Number(r.income).toLocaleString()}</td><td style="color:#ef4444">${Number(r.expense).toLocaleString()}</td>
          <td>${r.approved ? '<span class="badge official">Published</span>' : '<span class="badge pending">Draft</span>'}</td>
          <td>${can(req, 'approve') ? `<form method="POST" action="/admin/finance/report/${r.id}/${r.approved ? 'hide' : 'approve'}"><button class="btn ${r.approved ? 'secondary' : 'g'}" style="padding:4px 10px;font-size:11.5px">${r.approved ? 'Hide' : 'Publish'}</button></form>` : ''}</td>
        </tr>`).join('')}
      </table></div>
    </div>
  `));
});

app.post('/admin/finance/tx', guard('finance'), async (req, res) => {
  const b = req.body, sc = scopeOf(req), amt = num(b.amount);
  if (amt > 0 && b.tdate) await q(`INSERT INTO transactions (kind,amount,tdate,note,campus,created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
    [b.kind, amt, b.tdate, b.note || '', sc || b.campus || 'all', req.session.sname || '']);
  res.redirect('/admin/finance?ok=1');
});

app.post('/admin/finance/report', guard('finance'), async (req, res) => {
  const per = String(req.body.period || '').trim(), sc = scopeOf(req), cmp = sc || req.body.campus || 'all';
  const rows = await q(`SELECT kind, SUM(amount) a FROM transactions WHERE tdate LIKE $1 ${cmp === 'all' ? '' : 'AND campus=$2'} GROUP BY kind`, cmp === 'all' ? [per + '%'] : [per + '%', cmp]);
  let inc = 0, exp = 0, d = {};
  rows.forEach(r => { d[r.kind] = Number(r.a); if (r.kind === 'expense') exp += Number(r.a); else inc += Number(r.a); });
  await q(`INSERT INTO finance_reports (period,campus,income,expense,starting_balance,detail) VALUES ($1,$2,$3,$4,$5,$6)`, [per, cmp, inc, exp, num(req.body.starting_balance), JSON.stringify(d)]);
  res.redirect('/admin/finance?ok=1');
});

app.post('/admin/finance/report/:id/:a', guard('approve'), async (req, res) => {
  await q(`UPDATE finance_reports SET approved=$1 WHERE id=$2`, [req.params.a === 'approve' ? 1 : 0, parseInt(req.params.id, 10) || 0]);
  res.redirect('/admin/finance?ok=1');
});

app.get('/admin/support', guard('support'), async (req, res) => {
  const sc = scopeOf(req), rs = await q(`SELECT * FROM support_requests ${sc ? "WHERE campus IN ($1,'all')" : ''} ORDER BY (status='open') DESC, id DESC LIMIT 100`, sc ? [sc] : []);
  res.send(A(req, 'Support', rs.map(r => `<div class="glass-card">
    <small style="color:var(--text-muted)">${h(r.member_no)} · ${h(r.name)} (${h(r.campus)})</small>
    <h4 style="margin:6px 0">${h(r.subject)} <span class="badge ${r.status === 'closed' ? 'official' : 'pending'}">${h(r.status)}</span></h4>
    <p style="font-size:13.5px">${h(r.message)}</p>
    <form method="POST" action="/admin/support/${r.id}/reply" style="margin-top:10px">
      <textarea name="reply" rows="2" placeholder="Reply...">${h(r.reply || '')}</textarea>
      <p style="margin-top:8px"><button class="btn">Reply & Close</button></p>
    </form>
  </div>`).join('') || `<div class="glass-card" style="text-align:center">No support tickets.</div>`));
});

app.post('/admin/support/:id/reply', guard('support'), async (req, res) => {
  await q(`UPDATE support_requests SET reply=$1, status='closed' WHERE id=$2`, [String(req.body.reply || '').slice(0, 2000), parseInt(req.params.id, 10) || 0]);
  res.redirect('/admin/support?ok=1');
});

app.get('/admin/staff', guard('staff'), async (req, res) => {
  const st = await q(`SELECT id,username,name,role,campus,active FROM staff ORDER BY id`);
  res.send(A(req, 'Staff', `
    <div class="glass-card">
      <h3>Create Staff Account</h3>
      <form method="POST" action="/admin/staff">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px">
          <div><label>Name</label><input name="name" required></div>
          <div><label>Username</label><input name="username" required></div>
          <div><label>Role</label>${sel('role', ROLES.map(r => [r, r]))}</div>
          <div><label>Campus</label>${sel('campus', campusOpts(null))}</div>
        </div>
        <label>Password (Min 8)</label><input name="password" type="password" minlength="8" required>
        <p style="margin-top:14px"><button class="btn">Create Staff</button></p>
      </form>
    </div>
    <div class="glass-card"><div class="tw"><table>
      <tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Action</th></tr>
      ${st.map(x => `<tr><td>${h(x.name)}</td><td>${h(x.username)}</td><td>${h(x.role)}</td><td><span class="badge ${x.active ? 'official' : 'rejected'}">${x.active ? 'Active' : 'Disabled'}</span></td>
      <td><form method="POST" action="/admin/staff/${x.id}/toggle"><button class="btn secondary" style="padding:4px 10px;font-size:11.5px">Toggle</button></form></td></tr>`).join('')}
    </table></div></div>
  `));
});

app.post('/admin/staff', guard('staff'), async (req, res) => {
  const b = req.body;
  if (ROLES.includes(b.role) && b.name && b.username && String(b.password || '').length >= 8) {
    try { await q(`INSERT INTO staff (username,name,role,campus,password) VALUES ($1,$2,$3,$4,$5)`, [b.username.trim().toLowerCase(), b.name, b.role, CAMPUS[b.campus] ? b.campus : null, bcrypt.hashSync(String(b.password), 10)]); } catch (e) {}
  }
  res.redirect('/admin/staff?ok=1');
});
app.post('/admin/staff/:id/toggle', guard('staff'), async (req, res) => {
  await q(`UPDATE staff SET active=1-active WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  res.redirect('/admin/staff?ok=1');
});

app.get('/admin/resets', guard('members'), async (req, res) => {
  const resets = await q(`SELECT * FROM password_resets ORDER BY (status='pending') DESC, id DESC LIMIT 50`);
  res.send(A(req, 'Password Resets', `<div class="glass-card"><div class="tw"><table>
    <tr><th>Student ID</th><th>Phone</th><th>Status</th><th>Action</th></tr>
    ${resets.map(r => `<tr><td>${h(r.student_id)}</td><td>${h(r.phone)}</td><td><span class="badge ${r.status === 'pending' ? 'pending' : 'official'}">${h(r.status)}</span></td>
    <td>${r.status === 'pending' ? `<form method="POST" action="/admin/resets/${r.id}/reset" style="display:flex;gap:6px"><input name="new_pass" placeholder="New Pass" required style="padding:4px 8px;width:130px"><button class="btn g" style="padding:4px 10px;font-size:11.5px">Reset</button></form>` : 'Resolved'}</td></tr>`).join('')}
  </table></div></div>`));
});

app.post('/admin/resets/:id/reset', guard('members'), async (req, res) => {
  const [r] = await q(`SELECT * FROM password_resets WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  if (r && req.body.new_pass) {
    await q(`UPDATE members SET password=$1 WHERE UPPER(student_id)=UPPER($2)`, [bcrypt.hashSync(String(req.body.new_pass), 10), r.student_id]);
    await q(`UPDATE password_resets SET status='resolved' WHERE id=$1`, [r.id]);
  }
  res.redirect('/admin/resets?ok=1');
});

app.get('/admin/audit-logs', guard('audit'), async (req, res) => {
  const logs = await q(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 150`);
  res.send(A(req, 'Audit Logs', `<div class="glass-card"><div class="tw"><table>
    <tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr>
    ${logs.map(l => `<tr><td>${new Date(l.created_at).toLocaleString()}</td><td><b>${h(l.actor)}</b></td><td><span class="badge registered">${h(l.action)}</span></td><td>${h(l.target || '-')}</td><td>${h(l.details || '-')}</td></tr>`).join('')}
  </table></div></div>`));
});

app.get('/admin/backup', guard('backup'), async (req, res) => {
  if (!req.query.go) return res.send(A(req, 'Backup', `<div class="glass-card" style="text-align:center; padding:40px"><h3>💾 Database Backup</h3><p style="margin:12px 0; color:var(--text-muted)">Download full JSON snapshot.</p><a class="btn" href="/admin/backup?go=1">⬇ Download Backup</a></div>`));
  const out = { exported_at: new Date().toISOString(), platform: 'Siikkoo-Mandoo MWU' };
  for (const t of ['members', 'posts', 'leaders', 'meetings', 'support_requests', 'transactions', 'finance_reports', 'staff', 'audit_logs']) out[t] = await q(`SELECT * FROM ${t}`);
  res.set('Content-Type', 'application/json').set('Content-Disposition', `attachment; filename="sikkoo-mandoo-backup-${new Date().toISOString().slice(0, 10)}.json"`).send(JSON.stringify(out, null, 2));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Siikkoo-Mandoo MWU Platform running on port ${PORT}`));
