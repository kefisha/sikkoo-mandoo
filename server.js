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

// ---------- CAMPUS CONFIGURATION (Section 2) ----------
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

// Post types and slugs (Sections 6, 8, 10)
const TYPES = ['announcement', 'news', 'event', 'education', 'document', 'project', 'gallery', 'heritage'];
const SLUG = {
  announcement: 'announcements', news: 'news', event: 'events',
  education: 'education', document: 'documents', project: 'projects',
  gallery: 'gallery', heritage: 'heritage'
};

// Roles & Permissions (Sections 4 & 11)
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

// Audit Log Helper (Section 11)
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
    heritage: 'Aadaa fi Seenaa', about: 'Waa\'ee Gamtaa', privacy: 'Iccitii', terms: 'Waliigaltee'
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
    heritage: 'ባህል እና ታሪክ', about: 'ስለ ማህበሩ', privacy: 'የግላዊነት ፖሊሲ', terms: 'ውሎች እና ሁኔታዎች'
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
    heritage: 'Heritage & Culture', about: 'About Association', privacy: 'Privacy Policy', terms: 'Terms & Conditions'
  }
};

const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L = req => (['en', 'am', 'om'].includes(req.session.lang) ? req.session.lang : 'om');
const tr = (req, k) => (T[L(req)] && T[L(req)][k]) || (T.en[k] || k);
const campusName = (req, cKey) => { const c = CAMPUS[cKey]; if (!c) return cKey; return c[L(req)] || c.n; };

// Modern CSS
const CSS = `
:root {
  --primary: #2563eb;
  --primary-dark: #1d4ed8;
  --green: #10b981;
  --bg: #f8fafc;
  --text: #0f172a;
  --text-2: #334155;
  --text-muted: #64748b;
  --border: #e2e8f0;
  --radius: 18px;
  --radius-sm: 12px;
  --shadow: 0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.01);
  --shadow-lg: 0 20px 40px -12px rgba(37,99,235,0.15);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: linear-gradient(160deg, #eff6ff 0%, #f8fafc 50%, #fdf2f8 100%);
  background-attachment: fixed;
  color: var(--text);
  line-height: 1.6; min-height: 100vh; display: flex; flex-direction: column;
}
a { color: var(--primary); text-decoration: none; transition: 0.2s; }
a:hover { color: var(--primary-dark); }
header {
  background: rgba(255,255,255,0.85); backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(226,232,240,0.8); position: sticky; top: 0; z-index: 100; padding: 12px 0;
}
.in { max-width: 1140px; margin: 0 auto; padding: 0 20px; width: 100%; }
.header-top { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.logo-area { display: flex; align-items: center; gap: 12px; }
.logo-icon {
  width: 48px; height: 48px; border-radius: 50%;
  background: linear-gradient(135deg, #2563eb, #8b5cf6);
  display: grid; place-items: center; font-size: 22px; color: white;
  box-shadow: 0 6px 16px rgba(37,99,235,0.3);
}
.logo-text h1 { font-size: 15px; font-weight: 800; color: var(--text); letter-spacing: -0.2px; }
.logo-text p { font-size: 12px; color: var(--text-muted); font-weight: 500; }
.nav-group { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.lang-box { display: flex; gap: 3px; background: #f1f5f9; padding: 4px; border-radius: 9999px; }
.lang-btn { padding: 4px 10px; font-size: 12px; font-weight: 600; border-radius: 9999px; color: var(--text-muted); }
.lang-btn.active { background: white; color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.ext-nav { display: flex; gap: 8px; align-items: center; }
.ext-btn {
  padding: 8px 14px; font-size: 13px; font-weight: 600; border-radius: 12px;
  background: white; color: var(--text); border: 1px solid var(--border); transition: 0.2s;
}
.ext-btn:hover { background: #f8fafc; }
.ext-btn.login-btn { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; border: none; }
.glass-card, .card {
  background: white; border-radius: var(--radius); padding: 26px; margin: 16px 0;
  box-shadow: var(--shadow); border: 1px solid rgba(226,232,240,0.8);
}
label { display: block; font-weight: 600; font-size: 12px; margin: 14px 0 6px; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.3px; }
input, select, textarea {
  width: 100%; padding: 12px 14px; background: #f8fafc; border: 1.5px solid #e2e8f0;
  border-radius: 12px; font: inherit; color: var(--text); font-size: 14px; transition: 0.2s;
}
input:focus, select:focus, textarea:focus { outline: none; border-color: #93c5fd; background: white; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
textarea { resize: vertical; min-height: 85px; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff; border: 0;
  border-radius: 12px; padding: 12px 22px; font-weight: 600; cursor: pointer; font-size: 14px;
  transition: 0.2s; box-shadow: 0 4px 14px rgba(37,99,235,0.25);
}
.btn:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(37,99,235,0.3); color: #fff; }
.btn.secondary { background: white; border: 1.5px solid #e2e8f0; color: var(--text); box-shadow: 0 2px 4px rgba(0,0,0,0.03); }
.btn.danger { background: linear-gradient(135deg, #f87171, #ef4444); color: white; }
.btn.g { background: linear-gradient(135deg, #34d399, #10b981); color: white; }
.portal-menu {
  background: white; border-radius: 16px; padding: 10px 12px; display: flex; flex-wrap: wrap; gap: 6px;
  margin: 0 0 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 6px rgba(0,0,0,0.02);
}
.portal-btn {
  background: #f8fafc; color: var(--text-2); border-radius: 10px; padding: 8px 13px; font-size: 12.5px; font-weight: 600;
  display: inline-flex; align-items: center; gap: 5px; border: 1px solid transparent; transition: 0.2s;
}
.portal-btn:hover { background: #eff6ff; color: var(--primary-dark); border-color: #bfdbfe; }
.portal-btn.active { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; }
table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13.5px; }
th, td { padding: 12px 14px; border-bottom: 1px solid #f1f5f9; text-align: left; }
th { background: #f8fafc; font-weight: 600; color: var(--text-muted); font-size: 11.5px; text-transform: uppercase; }
.tw { overflow-x: auto; background: white; border-radius: 12px; border: 1px solid #e2e8f0; }
.badge { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; }
.badge.official { background: #d1fae5; color: #047857; }
.badge.pending { background: #fef3c7; color: #b45309; }
.badge.rejected { background: #fee2e2; color: #b91c1c; }
.badge.registered { background: #dbeafe; color: #1d4ed8; }
.badge.alert { background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; }
.err { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; padding: 12px 14px; border-radius: 12px; margin: 12px 0; font-size: 13.5px; font-weight: 500; }
.msgok { background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; padding: 12px 14px; border-radius: 12px; margin: 12px 0; font-size: 13.5px; font-weight: 500; }
.id {
  border-radius: 20px; max-width: 420px; margin: 20px auto; background: white;
  box-shadow: var(--shadow-lg); overflow: hidden; border: 1px solid #e2e8f0;
}
.id .hd {
  background: linear-gradient(135deg, #2563eb, #7c3aed); color: #fff; padding: 14px 18px;
  font-weight: 700; font-size: 13px; display: flex; justify-content: space-between; align-items: center;
}
.id .bd { display: flex; gap: 14px; padding: 18px; align-items: center; }
.id img { width: 90px; height: 115px; border-radius: 10px; object-fit: cover; border: 2px solid #e2e8f0; }
footer { text-align: center; padding: 24px 20px; color: var(--text-muted); font-size: 12.5px; margin-top: auto; border-top: 1px solid rgba(226,232,240,0.6); }
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 12px; }
.stat-card { background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px 16px; text-align: center; box-shadow: var(--shadow); }
.stat-card .num { font-size: 2.2rem; font-weight: 800; line-height: 1.1; margin-bottom: 4px; }
.stat-card .label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
main { flex: 1; display: flex; flex-direction: column; }
`;

function page(req, title, body) {
  const l = L(req);
  const isMember = !!req.session.mid;
  const isStaff = !!req.session.sr;

  const langSwitcher = `
    <div class="lang-box">
      <a class="lang-btn ${l === 'om' ? 'active' : ''}" href="/lang/om">Oromo</a>
      <a class="lang-btn ${l === 'am' ? 'active' : ''}" href="/lang/am">አማርኛ</a>
      <a class="lang-btn ${l === 'en' ? 'active' : ''}" href="/lang/en">English</a>
    </div>
  `;

  let extNav = '';
  if (isMember) {
    extNav = `<div class="ext-nav"><a class="ext-btn" href="/student-dashboard">🪪 Dashboard</a><a class="ext-btn login-btn" href="/logout">${h(tr(req, 'logout'))}</a></div>`;
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

  return `<!DOCTYPE html>
<html lang="${l}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${h(title)} · ${h(tr(req, 'site'))}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>${CSS}</style>
</head>
<body>
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
  <div class="in" style="padding-top: 24px; padding-bottom: 40px; width: 100%;">
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
</body>
</html>`;
}

// Member Portal Navigation
function portalMenu(activePath) {
  const items = [
    { p: '/student-dashboard', i: '🪪', t: 'ID Card' },
    { p: '/portal/announcements', i: '📢', t: 'Announcements' },
    { p: '/portal/news', i: '📰', t: 'News' },
    { p: '/portal/events', i: '📅', t: 'Events' },
    { p: '/portal/meetings', i: '🤝', t: 'Meetings & Minutes' },
    { p: '/portal/education', i: '📚', t: 'Education & Library' },
    { p: '/portal/heritage', i: '🏛️', t: 'Heritage & Culture' },
    { p: '/portal/leadership', i: '👥', t: 'Leadership' },
    { p: '/portal/finance', i: '💰', t: 'Finance' },
    { p: '/portal/support', i: '💬', t: 'Support' }
  ];

  let html = '<div class="portal-menu">';
  items.forEach(x => {
    const activeClass = activePath === x.p ? ' active' : '';
    html += '<a href="' + x.p + '" class="portal-btn' + activeClass + '">' + x.i + ' ' + x.t + '</a>';
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

function postCard(req, p) {
  const isEmergency = p.is_emergency ? `<span class="badge alert" style="margin-left:8px">🚨 EMERGENCY / ATATAMAAMA</span>` : '';
  return `<div class="glass-card" style="margin-bottom:16px; padding:22px; border-left: 4px solid ${p.is_emergency ? '#ef4444' : '#2563eb'}">
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
      <small style="color:var(--text-muted);font-weight:600;font-size:12px">${h(p.campus === 'all' ? 'All Campuses' : campusName(req, p.campus))} · ${h(p.event_date || (p.created_at ? new Date(p.created_at).toLocaleDateString() : ''))}</small>
      <div>${isEmergency}</div>
    </div>
    <h3 style="margin:8px 0 10px; font-size:1.15rem; font-weight:700">${h(postT(req, p, 'title'))}</h3>
    ${p.image_id ? `<img style="width:100%;max-height:340px;object-fit:cover;border-radius:12px;margin-bottom:12px" src="/photo/${p.image_id}" alt="">` : ''}
    <div style="color:var(--text-2);font-size:14px;line-height:1.65">${h(postT(req, p, 'body')).replace(/\n/g, '<br>')}</div>
    ${p.file_id ? `<p style="margin-top:14px"><a class="btn secondary" style="padding:6px 14px;font-size:12.5px" href="/photo/${p.file_id}?dl=1">📥 Download Attached Document</a></p>` : ''}
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

  // Safe migrations for pre-existing tables
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

  // Central Super Admin Seed
  const adminPass = bcrypt.hashSync('sikomando123', 10);
  await q(`INSERT INTO staff (username, name, role, campus, password, active) 
           VALUES ('admin', 'Central Admin', 'central_admin', NULL, $1, 1) 
           ON CONFLICT (username) DO UPDATE SET password = $1, role = 'central_admin', active = 1`, [adminPass]);
})().catch(e => console.error('DB init err:', e.message));

app.get('/lang/:l', (req, res) => {
  const l = req.params.l; if (['om', 'am', 'en'].includes(l)) req.session.lang = l;
  res.redirect(req.get('referer') || '/');
});

// ---------- SECTION 1: ORGANIZATION INFORMATION PAGE ----------
app.get('/about', async (req, res) => {
  const html = `
    <div class="glass-card" style="padding:32px">
      <div style="text-align:center; margin-bottom:28px">
        <div style="width:72px; height:72px; margin:0 auto 12px; border-radius:50%; background:linear-gradient(135deg, #2563eb, #8b5cf6); display:grid; place-items:center; font-size:32px; color:white;">🌳</div>
        <h2 style="font-size:1.6rem; font-weight:800; color:#1e293b">${h(tr(req, 'site'))}</h2>
        <p style="color:#64748b; font-weight:600">${h(tr(req, 'uni'))}</p>
        <p style="margin-top:6px; display:inline-block; background:#eff6ff; color:#2563eb; padding:4px 14px; border-radius:999px; font-weight:700; font-size:13px">
          Slogan: "Tokkummaa, Barnoota fi Aadaa" · "አንድነት፣ ትምህርት እና ባህል"
        </p>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:20px; margin-bottom:24px;">
        <div style="background:#f8fafc; padding:20px; border-radius:14px; border:1px solid #e2e8f0;">
          <h4 style="color:#2563eb; font-weight:700; margin-bottom:8px">🏛️ History of the Association</h4>
          <p style="font-size:13.5px; color:var(--text-2); line-height:1.6">
            The Siikkoo-Mandoo Students Association at Madda Walabu University was founded to cultivate unity, mutual assistance, academic excellence, and cultural heritage promotion among students across Robe, Goba, and Shashamane campuses.
          </p>
        </div>
        <div style="background:#f8fafc; padding:20px; border-radius:14px; border:1px solid #e2e8f0;">
          <h4 style="color:#2563eb; font-weight:700; margin-bottom:8px">🎯 Mission & Vision</h4>
          <p style="font-size:13.5px; color:var(--text-2); line-height:1.6">
            <strong>Mission:</strong> To empower students through academic collaboration, leadership cultivation, social solidarity, and cultural identity preservation.<br>
            <strong>Vision:</strong> A thriving, unified, and visionary student community excelling academically and contributing positively to society.
          </p>
        </div>
      </div>

      <div style="background:#f8fafc; padding:20px; border-radius:14px; border:1px solid #e2e8f0; margin-bottom:24px;">
        <h4 style="color:#2563eb; font-weight:700; margin-bottom:8px">📜 Objectives & Responsibilities</h4>
        <ul style="padding-left:20px; font-size:13.5px; color:var(--text-2); line-height:1.7">
          <li>Supporting students in academic integration and tutorial programs across all 3 campuses.</li>
          <li>Preserving and advancing Oromo cultural heritage, literature, arts, and historic identity.</li>
          <li>Organizing student welfare initiatives, emergency relief, and social solidarity funds.</li>
          <li>Representing student voices collaboratively with university administration and campus unions.</li>
        </ul>
      </div>

      <div style="background:#eff6ff; padding:20px; border-radius:14px; border:1px solid #bfdbfe; margin-bottom:24px;">
        <h4 style="color:#1d4ed8; font-weight:700; margin-bottom:8px">⚖️ Constitution and Internal Rules</h4>
        <p style="font-size:13.5px; color:var(--text-2); margin-bottom:12px;">
          The official constitution outlines leadership mandates, electoral bylaws, member rights, and fiscal accountability rules.
        </p>
        <a href="/portal/heritage" class="btn" style="padding:8px 16px; font-size:13px">📖 View Full Constitution & Bylaws</a>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:18px;">
        <div style="background:#f8fafc; padding:18px; border-radius:14px; border:1px solid #e2e8f0;">
          <h4 style="color:var(--text); font-weight:700; margin-bottom:6px">📞 Contact Information</h4>
          <p style="font-size:13px; color:var(--text-2)">
            📍 Head Office: MWU Main Campus (Robe), Bale, Ethiopia<br>
            ✉️ Email: info@siikkoomandoo-mwu.org<br>
            📱 Phone: +251 900 000 000
          </p>
        </div>
        <div style="background:#f8fafc; padding:18px; border-radius:14px; border:1px solid #e2e8f0;">
          <h4 style="color:var(--text); font-weight:700; margin-bottom:6px">🌐 Official Social Media</h4>
          <p style="font-size:13px; color:var(--text-2)">
            ✈️ Telegram: <a href="https://t.me/siikkoomandoomwu" target="_blank">@siikkoomandoomwu</a><br>
            📘 Facebook: Siikkoo-Mandoo MWU Official<br>
            🎥 YouTube: Siikkoo Mandoo Media
          </p>
        </div>
      </div>
    </div>
  `;
  res.send(page(req, tr(req, 'about'), html));
});

// ---------- SECTION 2: THREE-CAMPUS INFORMATION PAGE ----------
app.get('/campuses', async (req, res) => {
  const counts = await q(`SELECT campus, COUNT(*)::int as total,
                          SUM(CASE WHEN status='official' THEN 1 ELSE 0 END)::int as official
                          FROM members GROUP BY campus`);
  const cMap = {}; counts.forEach(c => { cMap[c.campus] = c; });

  const html = `
    <div style="margin-bottom:24px">
      <h2 style="font-size:1.6rem; font-weight:800; color:#1e293b; margin-bottom:6px">🏛️ ${h(tr(req, 'campuses'))}</h2>
      <p style="color:#64748b; font-size:14px">Official directory and student distribution across all 3 Madda Walabu University campuses.</p>
    </div>

    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:20px;">
      ${Object.keys(CAMPUS).map(k => {
        const c = CAMPUS[k];
        const data = cMap[k] || { total: 0, official: 0 };
        return `
          <div class="glass-card" style="padding:24px; display:flex; flex-direction:column; justify-content:space-between">
            <div>
              <span class="badge" style="background:#eff6ff; color:#2563eb; font-weight:700; margin-bottom:10px">${c.c} CAMPUS</span>
              <h3 style="font-size:1.3rem; font-weight:750; color:#1e293b; margin-bottom:4px">${c.n}</h3>
              <p style="color:#64748b; font-size:12.5px; font-weight:600; margin-bottom:12px">📍 ${c.loc}</p>
              
              <div style="background:#f8fafc; padding:12px 14px; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:14px;">
                <p style="font-size:12.5px; color:var(--text-2)"><strong>Academic Focus:</strong> ${c.colleges}</p>
              </div>

              <div style="display:flex; gap:16px; margin-bottom:16px;">
                <div>
                  <b style="font-size:1.4rem; color:#2563eb; font-weight:800">${data.total}</b><br>
                  <small style="color:var(--text-muted); font-size:11.5px; font-weight:600">Total Registered</small>
                </div>
                <div>
                  <b style="font-size:1.4rem; color:#10b981; font-weight:800">${data.official}</b><br>
                  <small style="color:var(--text-muted); font-size:11.5px; font-weight:600">Official Members</small>
                </div>
              </div>
            </div>

            <div style="border-top:1px solid #f1f5f9; padding-top:12px; display:flex; justify-content:space-between; align-items:center;">
              <a href="/portal/announcements?campus=${k}" class="btn secondary" style="padding:6px 12px; font-size:12px">📢 Campus News</a>
              <a href="/portal/leadership?campus=${k}" style="font-size:12.5px; font-weight:600">Coordinators →</a>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
  res.send(page(req, tr(req, 'campuses'), html));
});

// ---------- HOME LANDING PAGE ----------
app.get('/', (req, res) => {
  if (req.session.mid) return res.redirect('/student-dashboard');
  if (req.session.sr) return res.redirect('/admin');

  const html = `
    <div style="min-height: 72vh; display: flex; align-items: center; justify-content: center;">
      <div style="text-align: center; max-width: 480px; width: 100%;">
        <div style="width: 88px; height: 88px; margin: 0 auto 18px; border-radius: 50%; background: linear-gradient(135deg, #2563eb, #8b5cf6); display: grid; place-items: center; font-size: 38px; color: white; box-shadow: 0 12px 30px rgba(37,99,235,0.3);">
          🌳
        </div>
        <h1 style="font-size: 1.65rem; font-weight: 800; color: #0f172a; margin-bottom: 6px; letter-spacing: -0.3px;">
          ${h(tr(req, 'site'))}
        </h1>
        <p style="color: #64748b; font-size: 14.5px; margin-bottom: 24px; font-weight: 500;">
          ${h(tr(req, 'uni'))} · Robe · Goba · Shashamane
        </p>

        <div style="background: white; border-radius: 22px; padding: 26px 22px; box-shadow: var(--shadow-lg); border: 1px solid #e2e8f0;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: #eff6ff; color: #2563eb; font-size: 12px; font-weight: 700; padding: 5px 14px; border-radius: 999px; margin-bottom: 20px;">
            ◆ Official Digital Association Platform
          </div>

          <a href="/login" class="btn" style="width: 100%; padding: 14px; font-size: 15px; border-radius: 14px; margin-bottom: 10px;">
            🔑 Sign in to Member Portal
          </a>

          <a href="/sikkoo-mandoo-register" style="display: block; width: 100%; padding: 13px; font-size: 14.5px; font-weight: 600; border-radius: 14px; background: linear-gradient(135deg, #34d399, #10b981); color: white; text-align: center; box-shadow: 0 4px 14px rgba(16,185,129,0.25); margin-bottom: 10px;">
            📝 New Student Registration
          </a>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:8px;">
            <a href="/about" class="btn secondary" style="padding:10px; font-size:12.5px">🏛️ About Us</a>
            <a href="/campuses" class="btn secondary" style="padding:10px; font-size:12.5px">📍 3 Campuses</a>
          </div>
        </div>
      </div>
    </div>
  `;
  res.send(page(req, tr(req, 'home'), html));
});

// ---------- AUTHENTICATION & RECOVERY (Section 11) ----------
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
    <div style="min-height: 70vh; display: flex; align-items: center; justify-content: center;">
      <div style="width: 100%; max-width: 400px;">
        <div style="text-align: center; margin-bottom: 22px;">
          <h2 style="font-size: 1.45rem; font-weight: 800; color: #1e293b;">${h(tr(req, 'login'))}</h2>
          <p style="color: #64748b; font-size: 13.5px;">${h(tr(req, 'site'))}</p>
        </div>

        <div style="background: white; border-radius: 22px; padding: 26px 22px; box-shadow: var(--shadow-lg); border: 1px solid #e2e8f0;">
          ${req.query.e ? `<div class="err">Invalid credentials. Please verify your ID and password.</div>` : ''}

          <form method="POST" action="/login">
            <label style="margin-top:0">${h(tr(req, 'no'))} / Student ID</label>
            <input name="u" required placeholder="SM-ROB-2026-0001 or UGRR/..." autocomplete="username">

            <label>${h(tr(req, 'pass'))}</label>
            <input name="p" type="password" required autocomplete="current-password">

            <button class="btn" style="width: 100%; padding: 14px; font-size: 15px; margin-top: 20px;">
              Sign in to Portal
            </button>
          </form>

          <div style="margin-top: 16px; text-align: center; display: flex; justify-content: space-between; font-size: 13px;">
            <a href="/sikkoo-mandoo-register">📝 New Member?</a>
            <a href="/forgot-password" style="color:var(--text-muted)">Forgot Password?</a>
          </div>
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
    await logAudit(req, 'MEMBER_LOGIN', m.member_no, 'Member portal login successful');
    return res.redirect('/student-dashboard');
  }
  f.n++; fails.set(req.ip, f); res.redirect('/login?e=1');
});

// Password Recovery Request (Section 11)
app.get('/forgot-password', (req, res) => {
  res.send(page(req, 'Password Recovery', `
    <div style="max-width: 440px; margin: 30px auto;">
      <div class="glass-card" style="padding: 26px;">
        <h3 style="font-size:1.3rem; font-weight:750; margin-bottom:6px">🔑 Password Reset Request</h3>
        <p style="font-size:13.5px; color:var(--text-muted); margin-bottom:16px">Submit your Student ID and phone number. Campus administrators will verify and reset your access.</p>
        ${req.query.ok ? `<div class="msgok">Your recovery request has been submitted to your campus admin.</div>` : ''}
        <form method="POST" action="/forgot-password">
          <label>Student ID Number</label>
          <input name="student_id" required placeholder="UGRR/12345/15">
          <label>Registered Phone Number</label>
          <input name="phone" required placeholder="09...">
          <label>Reason / Note</label>
          <textarea name="reason" placeholder="e.g. Forgotten password or phone changed"></textarea>
          <p style="margin-top:18px"><button class="btn" style="width:100%">Submit Recovery Request</button></p>
        </form>
      </div>
    </div>
  `));
});

app.post('/forgot-password', async (req, res) => {
  const { student_id, phone, reason } = req.body;
  if (student_id && phone) {
    await q(`INSERT INTO password_resets (student_id, phone, reason) VALUES ($1,$2,$3)`, [student_id.trim(), phone.trim(), (reason || '').slice(0, 300)]);
    await logAudit(req, 'RECOVERY_REQUEST', student_id, `Phone: ${phone}`);
  }
  res.redirect('/forgot-password?ok=1');
});

// ---------- SECTION 3: STUDENT REGISTRATION (All fields from Image 2) ----------
function regForm(req, err, v) {
  v = v || {};
  const s = (k, o) => o.map(x => `<option value="${x[0]}"${v[k] === x[0] ? ' selected' : ''}>${h(x[1])}</option>`).join('');
  return page(req, tr(req, 'reg'), `
    <div style="max-width: 680px; margin: 20px auto;">
      <div style="text-align: center; margin-bottom: 18px;">
        <h2 style="font-size: 1.5rem; font-weight: 800; color: #1e293b;">📝 ${h(tr(req, 'reg'))}</h2>
        <p style="color: #64748b; font-size: 13.5px;">Join the Gamtaa Barattoota Siikkoo-Mandoo Digital Community</p>
      </div>

      <div class="glass-card" style="padding: 28px 24px;">
        ${err ? `<div class="err">${h(err)}</div>` : ''}
        <form method="POST" action="/sikkoo-mandoo-register" enctype="multipart/form-data">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 4px 16px;">
            <div><label>${h(tr(req, 'name'))} *</label><input name="name" required value="${h(v.name)}" placeholder="Full name"></div>
            <div><label>${h(tr(req, 'sid'))} *</label><input name="student_id" required value="${h(v.student_id)}" placeholder="UGRR/12345/15"></div>
            <div><label>${h(tr(req, 'gender'))} *</label><select name="gender">${s('gender', [['M', tr(req, 'male')], ['F', tr(req, 'female')]])}</select></div>
            <div><label>${h(tr(req, 'campus'))} *</label><select name="campus" required>${s('campus', Object.keys(CAMPUS).map(k => [k, campusName(req, k)]))}</select></div>
            <div><label>${h(tr(req, 'college'))} *</label><input name="college" required value="${h(v.college)}" placeholder="e.g. Natural & Comp Sciences"></div>
            <div><label>${h(tr(req, 'dept'))} *</label><input name="department" required value="${h(v.department)}" placeholder="e.g. Statistics, Medicine"></div>
            <div><label>${h(tr(req, 'year'))} *</label><select name="year">${s('year', [1, 2, 3, 4, 5, 6].map(x => [String(x), 'Year ' + x]))}</select></div>
            <div><label>${h(tr(req, 'zone_woreda'))} *</label><input name="zone_woreda" required value="${h(v.zone_woreda)}" placeholder="e.g. Bale / Robe, Arsi / Asella"></div>
            <div><label>${h(tr(req, 'phone'))} *</label><input name="phone" required type="tel" value="${h(v.phone)}" placeholder="09..."></div>
            <div><label>${h(tr(req, 'telegram'))} (Optional)</label><input name="telegram_handle" value="${h(v.telegram_handle)}" placeholder="@username"></div>
            <div><label>${h(tr(req, 'email'))} (Optional)</label><input name="email" type="email" value="${h(v.email)}" placeholder="student@example.com"></div>
          </div>

          <label>${h(tr(req, 'photo'))} (Optional profile picture)</label>
          <input name="photo" type="file" accept="image/jpeg,image/png,image/webp">

          <label>${h(tr(req, 'pass'))} (Min. 6 characters) *</label>
          <input name="password" type="password" minlength="6" required>

          <label style="display: flex; align-items: center; gap: 12px; margin-top: 18px; padding: 14px 16px; background: #ecfdf5; border-radius: 12px; border: 1px solid #a7f3d0; color: var(--text); text-transform: none; letter-spacing: 0; font-size: 13.5px;">
            <input type="checkbox" name="want" value="1" style="width: 18px; height: 18px; flex-shrink: 0; accent-color: #10b981;">
            <span style="font-weight: 600;">${h(tr(req, 'want'))} (Apply for verified Official Member ID)</span>
          </label>

          <p style="margin-top: 22px;"><button class="btn" style="width: 100%; padding: 14px; font-size: 15px;">${h(tr(req, 'send'))}</button></p>
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
        
        req.session.mid = no; req.session.campus = b.campus; req.session.role = 'student';
        await logAudit(req, 'MEMBER_REGISTER', no, `Campus: ${b.campus}, Name: ${b.name}`);
        return res.redirect('/student-dashboard');
      } catch (e) {
        if (!/duplicate|unique/i.test(e.message)) throw e;
      }
    }
    res.send(regForm(req, tr(req, 'bad'), b));
  } catch (e) {
    console.error('Registration error:', e);
    res.status(500).send('Error occurred during registration');
  }
});

// ---------- SECTION 5: MEMBER DASHBOARD, DIGITAL ID & RENEWAL ----------
app.get('/student-dashboard', needMember, async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]);
  if (!m) return res.redirect('/logout');
  const base = 'https://' + req.headers.host + '/verify/' + encodeURIComponent(m.member_no);

  const html = `
    ${portalMenu('/student-dashboard')}
    <div class="id">
      <div class="hd">
        <span>${h(tr(req, 'site'))}</span>
        <span class="badge ${m.status}">${h(tr(req, m.status))}</span>
      </div>
      <div class="bd">
        <img src="${m.photo_id ? '/photo/' + m.photo_id : 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27/%3E'}" alt="">
        <div>
          <b style="font-size:16px; color:var(--text); font-weight:750">${h(m.name)}</b><br>
          <small style="color:var(--text-muted); font-size:11.5px">${h(tr(req, 'no'))}</small><br>
          <b style="color:#2563eb; font-size:14.5px; letter-spacing:0.2px">${h(m.member_no)}</b><br>
          <small style="color:var(--text-muted); font-weight:600; font-size:11.5px">${h(campusName(req, m.campus))} · ${h(m.department)} · Y${h(m.year)}</small><br>
          <small style="color:var(--text-2); font-size:11px">📍 ${h(m.zone_woreda || 'Bale')}</small>
        </div>
      </div>
      <div style="padding:0 18px 16px; display:flex; justify-content:space-between; align-items:flex-end; border-top:1px solid #f1f5f9; padding-top:12px;">
        <div>
          <small style="font-weight:600; color:var(--text-muted); font-size:11.5px">Student ID: <span style="color:var(--text)">${h(m.student_id)}</span></small><br>
          <small style="color:#10b981; font-weight:600; font-size:11px">Renewal: ${m.renewal_date ? new Date(m.renewal_date).getFullYear() : 2026}</small>
        </div>
        <div id="qr" style="background:#fff; padding:4px; border-radius:8px; border:1px solid #e2e8f0;"></div>
      </div>
    </div>

    <div style="text-align:center; margin-top:20px; display:flex; justify-content:center; gap:10px; flex-wrap:wrap;">
      <button onclick="print()" class="btn secondary">🖨️ ${h(tr(req, 'print'))}</button>
      ${m.status === 'registered' ? `<form method="POST" action="/student/upgrade" style="display:inline"><button class="btn">${h(tr(req, 'upgrade'))}</button></form>` : ''}
      <form method="POST" action="/student/renew" style="display:inline"><button class="btn secondary">🔄 ${h(tr(req, 'renew'))}</button></form>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <script>new QRCode(document.getElementById('qr'),{text:${JSON.stringify(base)},width:64,height:64,colorDark:"#0f172a",colorLight:"#ffffff"});</script>
  `;
  res.send(page(req, tr(req, 'dash'), html));
});

app.post('/student/upgrade', needMember, async (req, res) => {
  await q(`UPDATE members SET status='pending' WHERE member_no=$1 AND status='registered'`, [req.session.mid]);
  await logAudit(req, 'MEMBER_UPGRADE_REQUEST', req.session.mid, 'Requested official member upgrade');
  res.redirect('/student-dashboard');
});

app.post('/student/renew', needMember, async (req, res) => {
  await q(`UPDATE members SET renewal_date=NOW() WHERE member_no=$1`, [req.session.mid]);
  await logAudit(req, 'MEMBER_RENEWAL', req.session.mid, 'Member renewed card');
  res.redirect('/student-dashboard');
});

// ---------- SECTIONS 6 & 10: PORTAL CONTENT (Announcements, News, Events, Heritage, Gallery) ----------
TYPES.forEach(tp => {
  app.get('/portal/' + SLUG[tp], needMember, async (req, res) => {
    const cf = req.query.campus || '';
    const query = cf ? `SELECT * FROM posts WHERE type=$1 AND (campus=$2 OR campus='all') ORDER BY is_emergency DESC, id DESC LIMIT 60`
                     : `SELECT * FROM posts WHERE type=$1 ORDER BY is_emergency DESC, id DESC LIMIT 60`;
    const rows = await q(query, cf ? [tp, cf] : [tp]);

    let content = '';
    if (tp === 'gallery') {
      content = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px">
        ${rows.map(p => `<div class="glass-card" style="padding:12px;margin:0">
          <img style="width:100%;height:190px;object-fit:cover;border-radius:10px;margin-bottom:8px" src="/photo/${p.image_id}">
          <p style="margin:0;font-weight:650;font-size:14px">${h(postT(req, p, 'title'))}</p>
        </div>`).join('')}
      </div>`;
    } else {
      content = rows.map(p => postCard(req, p)).join('');
    }

    const html = portalMenu('/portal/' + SLUG[tp]) +
      (rows.length ? content : `<div class="glass-card" style="text-align:center;padding:48px 24px"><p style="color:var(--text-muted);font-size:14.5px">${h(tr(req, 'none'))}</p></div>`);
    res.send(page(req, tr(req, tp), html));
  });
});

// ---------- SECTION 8: EDUCATION & OPPORTUNITIES PORTAL ----------
app.get('/portal/education', needMember, async (req, res) => {
  const materials = await q(`SELECT * FROM posts WHERE type='education' ORDER BY id DESC LIMIT 40`);
  const html = portalMenu('/portal/education') + `
    <div class="glass-card" style="padding:24px; margin-bottom:20px;">
      <h3 style="font-size:1.3rem; font-weight:800; color:#1e293b; margin-bottom:6px">📚 Education, Opportunities & Digital Library</h3>
      <p style="font-size:13.5px; color:var(--text-muted); margin-bottom:18px">Study materials, scholarship notifications, career guidance, and student support services.</p>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:20px;">
        <div style="background:#eff6ff; padding:16px; border-radius:12px; border:1px solid #bfdbfe;">
          <h4 style="color:#2563eb; font-weight:700; font-size:14px">📖 Digital Library</h4>
          <p style="font-size:12px; color:var(--text-2); margin-top:4px">Curated textbook PDFs, lecture slides, and exam archives.</p>
        </div>
        <div style="background:#ecfdf5; padding:16px; border-radius:12px; border:1px solid #a7f3d0;">
          <h4 style="color:#047857; font-weight:700; font-size:14px">🎓 Scholarships & Jobs</h4>
          <p style="font-size:12px; color:var(--text-2); margin-top:4px">Domestic & global study programs and paid internships.</p>
        </div>
        <div style="background:#fdf2f8; padding:16px; border-radius:12px; border:1px solid #fbcfe8;">
          <h4 style="color:#be185d; font-weight:700; font-size:14px">💡 Academic Contests</h4>
          <p style="font-size:12px; color:var(--text-2); margin-top:4px">Research competitions, hackathons, and training bootcamps.</p>
        </div>
      </div>
    </div>
    ${materials.map(p => postCard(req, p)).join('')}
  `;
  res.send(page(req, tr(req, 'education'), html));
});

// ---------- SECTION 9: MEETINGS & ACTIVITIES PORTAL ----------
app.get('/portal/meetings', needMember, async (req, res) => {
  const meets = await q(`SELECT * FROM meetings ORDER BY id DESC LIMIT 30`);
  const html = portalMenu('/portal/meetings') + `
    <div class="glass-card" style="padding:24px">
      <h3 style="font-size:1.3rem; font-weight:800; color:#1e293b; margin-bottom:6px">🤝 Meetings, Minutes & Activity Resolutions</h3>
      <p style="font-size:13.5px; color:var(--text-muted); margin-bottom:20px">Transparency portal for general assemblies, executive council meetings, and committee minutes.</p>

      ${meets.map(m => `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:20px; margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <h4 style="font-size:1.1rem; font-weight:750; color:#1e293b">${h(m.title)}</h4>
            <span class="badge" style="background:#eff6ff; color:#2563eb">${h(m.meeting_date || '')} · ${h(m.campus === 'all' ? 'All Campuses' : campusName(req, m.campus))}</span>
          </div>
          ${m.agenda ? `<p style="font-size:13px; color:var(--text-2); margin-top:8px"><strong>Agenda:</strong> ${h(m.agenda)}</p>` : ''}
          ${m.minutes ? `<div style="font-size:13px; color:var(--text-2); margin-top:8px; line-height:1.6"><strong>Meeting Minutes:</strong><br>${h(m.minutes).replace(/\n/g, '<br>')}</div>` : ''}
          ${m.resolutions ? `<div style="background:#ecfdf5; border-left:3px solid #10b981; padding:10px; border-radius:6px; margin-top:10px; font-size:13px; color:#047857"><strong>Key Resolutions:</strong> ${h(m.resolutions)}</div>` : ''}
          ${m.file_id ? `<p style="margin-top:10px"><a href="/photo/${m.file_id}?dl=1" class="btn secondary" style="padding:5px 12px; font-size:12px">📥 Download Signed Minutes</a></p>` : ''}
        </div>
      `).join('') || `<p style="color:var(--text-muted); text-align:center; padding:30px">No meeting minutes recorded yet.</p>`}
    </div>
  `;
  res.send(page(req, tr(req, 'meetings'), html));
});

// ---------- SECTION 4: LEADERSHIP DIRECTORY ----------
app.get('/portal/leadership', needMember, async (req, res) => {
  const ls = await q(`SELECT * FROM leaders ORDER BY (level='central') DESC, ord, id`);
  const grp = (t, list) => list.length ? `<h3 style="margin:22px 0 12px; color:#2563eb; font-size:1.1rem; font-weight:750">${h(t)}</h3>
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:16px">
    ${list.map(x => `
      <div class="glass-card" style="text-align:center; margin:0; padding:20px">
        <img style="width:90px; height:90px; border-radius:50%; object-fit:cover; border:3px solid #93c5fd; margin:auto;" src="${x.photo_id ? '/photo/' + x.photo_id : 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27/%3E'}">
        <h4 style="margin:10px 0 3px; font-size:14.5px; font-weight:750; color:var(--text)">${h(x.name)}</h4>
        <p style="color:#2563eb; font-weight:650; font-size:12px">${h(x.position_en || x.position_om || x.position_am)}</p>
        <small style="color:var(--text-muted); font-size:11px">Term: ${h(x.term || '2025-2026')}</small>
        ${x.responsibilities ? `<p style="font-size:11.5px; color:var(--text-2); margin-top:8px; line-height:1.4">${h(x.responsibilities)}</p>` : ''}
      </div>`).join('')}
    </div>` : '';

  const html = portalMenu('/portal/leadership') +
    grp('Central Executive Leadership', ls.filter(x => x.level === 'central')) +
    Object.keys(CAMPUS).map(k => grp(campusName(req, k) + ' Representatives', ls.filter(x => x.level !== 'central' && x.campus === k))).join('');
  res.send(page(req, tr(req, 'leadership'), html || `<div class="glass-card" style="text-align:center;padding:48px">${h(tr(req, 'none'))}</div>`));
});

// Public leadership route
app.get('/leadership', (req, res) => res.redirect('/about'));

// ---------- SECTION 7: FINANCE & FUNDRAISING ----------
app.get('/portal/finance', needMember, async (req, res) => {
  const rs = await q(`SELECT * FROM finance_reports WHERE approved=1 ORDER BY period DESC, id DESC LIMIT 36`);
  const html = portalMenu('/portal/finance') + `
    <div class="glass-card" style="padding:24px; margin-bottom:20px;">
      <h3 style="font-size:1.3rem; font-weight:800; color:#1e293b; margin-bottom:6px">💰 Transparent Finance & Fundraising Records</h3>
      <p style="font-size:13.5px; color:var(--text-muted);">Audited reports including student contributions, donations, project expenditures, and ending balances.</p>
    </div>
    ${rs.map(r => {
      const d = JSON.parse(r.detail || '{}');
      return `<div class="glass-card" style="padding:22px">
        <h4 style="font-size:1.1rem; font-weight:700; margin-bottom:14px">${h(r.period)} · ${h(r.campus === 'all' ? 'All Campuses' : campusName(req, r.campus))}</h4>
        <div style="display:flex; gap:20px; margin-bottom:12px; flex-wrap:wrap">
          <div><b style="color:#2563eb; font-size:1.4rem; font-weight:800">${Number(r.starting_balance || 0).toLocaleString()}</b><br><small style="color:var(--text-muted); font-size:11.5px">Starting Balance</small></div>
          <div><b style="color:#10b981; font-size:1.4rem; font-weight:800">${Number(r.income).toLocaleString()}</b><br><small style="color:var(--text-muted); font-size:11.5px">Total Income</small></div>
          <div><b style="color:#ef4444; font-size:1.4rem; font-weight:800">${Number(r.expense).toLocaleString()}</b><br><small style="color:var(--text-muted); font-size:11.5px">Total Expense</small></div>
          <div><b style="font-size:1.4rem; font-weight:800; color:var(--text)">${(Number(r.starting_balance || 0) + Number(r.income) - Number(r.expense)).toLocaleString()}</b><br><small style="color:var(--text-muted); font-size:11.5px">Net Balance</small></div>
        </div>
        <div style="font-size:12.5px; color:var(--text-2); background:#f8fafc; padding:10px 14px; border-radius:10px; border:1px solid #e2e8f0">
          ${Object.keys(d).map(k => `<b>${h(k)}</b>: ${Number(d[k]).toLocaleString()} ETB`).join(' &nbsp;•&nbsp; ')}
        </div>
      </div>`;
    }).join('') || `<div class="glass-card" style="text-align:center;padding:48px">${h(tr(req, 'none'))}</div>`}
  `;
  res.send(page(req, tr(req, 'finance'), html));
});

// ---------- SUPPORT TICKETING (Section 8) ----------
app.get('/portal/support', needMember, async (req, res) => {
  const reqs = await q(`SELECT * FROM support_requests WHERE member_no=$1 ORDER BY id DESC LIMIT 20`, [req.session.mid]);
  const html = portalMenu('/portal/support') + `
    <div class="glass-card" style="padding:24px">
      <h3 style="font-size:1.3rem; font-weight:800; margin-bottom:6px">🤝 Student Support & Grievance Desk</h3>
      <p style="font-size:13.5px; color:var(--text-muted); margin-bottom:18px">Reach out to your campus representatives or executive committee for academic, social, or administrative support.</p>
      ${req.query.ok ? `<div class="msgok">Your message has been sent to the student affairs committee.</div>` : ''}

      <form method="POST" action="/portal/support">
        <label>Subject / Issue</label>
        <input name="subject" required placeholder="Brief description of your question or request">
        <label>Category</label>
        <select name="category">
          <option value="academic">Academic & Tutorial Support</option>
          <option value="financial">Emergency & Welfare Assistance</option>
          <option value="campus_life">Campus Accommodation / Cafeteria</option>
          <option value="administrative">Student Union / Administration</option>
          <option value="other">Other Inquiry</option>
        </select>
        <label>Message Details</label>
        <textarea name="message" required placeholder="Write your message here in detail..."></textarea>
        <p style="margin-top:16px"><button class="btn">Send Support Request</button></p>
      </form>
    </div>

    <div class="glass-card" style="padding:24px">
      <h4 style="font-size:1.1rem; font-weight:750; margin-bottom:12px">Your Previous Inquiries</h4>
      ${reqs.map(r => `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <b>${h(r.subject)}</b>
            <span class="badge ${r.status === 'closed' ? 'official' : 'pending'}">${h(r.status)}</span>
          </div>
          <p style="font-size:13px; color:var(--text-2); margin-top:6px">${h(r.message)}</p>
          ${r.reply ? `<div style="background:#ecfdf5; border-left:3px solid #10b981; padding:8px 12px; margin-top:8px; font-size:12.5px; color:#047857"><strong>Reply:</strong> ${h(r.reply)}</div>` : ''}
        </div>
      `).join('') || `<p style="color:var(--text-muted)">No previous support requests found.</p>`}
    </div>
  `;
  res.send(page(req, tr(req, 'support'), html));
});

app.post('/portal/support', needMember, async (req, res) => {
  const [m] = await q(`SELECT * FROM members WHERE member_no=$1`, [req.session.mid]);
  if (m && req.body.subject && req.body.message) {
    await q(`INSERT INTO support_requests (member_no, name, campus, subject, category, message) VALUES ($1,$2,$3,$4,$5,$6)`,
      [m.member_no, m.name, m.campus, req.body.subject.slice(0, 150), req.body.category || 'general', req.body.message.slice(0, 3000)]);
    await logAudit(req, 'SUPPORT_TICKET', m.member_no, req.body.subject);
  }
  res.redirect('/portal/support?ok=1');
});

// ---------- FILE ACCESS & QR VERIFICATION ----------
app.get('/photo/:id', async (req, res) => {
  const [f] = await q(`SELECT mime, data, name FROM files WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  if (!f) return res.status(404).end();
  res.set('Content-Type', f.mime).set('Cache-Control', 'public,max-age=604800');
  if (req.query.dl) res.set('Content-Disposition', `attachment; filename="${String(f.name || 'file').replace(/[^\w.\-]/g, '_')}"`);
  res.send(f.data);
});

app.get('/verify/:no', async (req, res) => {
  const [m] = await q(`SELECT name,member_no,campus,department,college,year,status,photo_id FROM members WHERE UPPER(member_no)=UPPER($1)`, [req.params.no]);
  res.send(page(req, tr(req, 'verify'), m ? `
    <div class="glass-card" style="max-width:380px; margin:36px auto; text-align:center; padding:28px">
      <h2 style="color:#10b981; margin-bottom:14px; font-size:1.25rem">${h(tr(req, 'valid'))}</h2>
      <img style="width:100px; height:125px; border-radius:12px; object-fit:cover; border:2px solid #e2e8f0;" src="${m.photo_id ? '/photo/' + m.photo_id : ''}">
      <h3 style="margin:12px 0 4px; font-size:1.15rem; font-weight:750; color:var(--text)">${h(m.name)}</h3>
      <p style="color:#2563eb; font-weight:700; font-size:14px">${h(m.member_no)}</p>
      <p style="color:var(--text-muted); margin:4px 0 10px; font-size:12.5px">${h(campusName(req, m.campus))} · ${h(m.department)}</p>
      <span class="badge ${m.status}">${h(tr(req, m.status))}</span>
    </div>
  ` : `
    <div class="glass-card" style="max-width:380px; margin:36px auto; text-align:center; padding:40px">
      <h2 style="color:#ef4444">${h(tr(req, 'invalid'))}</h2>
    </div>
  `));
});

// ---------- LEGAL PAGES (Section 11) ----------
app.get('/privacy', (req, res) => res.send(page(req, tr(req, 'privacy'), `
  <div class="glass-card" style="padding:32px; max-width:800px; margin:20px auto;">
    <h2 style="font-size:1.5rem; font-weight:800; margin-bottom:12px">🔒 Privacy Policy</h2>
    <p style="font-size:13.5px; color:var(--text-2); line-height:1.7">
      The Gamtaa Barattoota Siikkoo-Mandoo Digital Platform respects and secures all student personal records. Data collected during registration—such as full name, student ID, campus, department, phone, and photos—is exclusively utilized for membership identification, digital ID card issuance, emergency academic announcements, and student union service provision. Data is never disclosed to commercial entities.
    </p>
  </div>
`)));

app.get('/terms', (req, res) => res.send(page(req, tr(req, 'terms'), `
  <div class="glass-card" style="padding:32px; max-width:800px; margin:20px auto;">
    <h2 style="font-size:1.5rem; font-weight:800; margin-bottom:12px">📜 Terms and Conditions</h2>
    <p style="font-size:13.5px; color:var(--text-2); line-height:1.7">
      By registering with the Siikkoo-Mandoo Student Association platform, members agree to adhere to Madda Walabu University student codes of conduct and association bylaws. Membership cards remain the property of the association and must only be used by the registered student. Misuse of platform accounts or falsification of academic identification may lead to suspension.
    </p>
  </div>
`)));

// ---------- ADMIN PORTAL (Sections 5, 8, 11) ----------
app.get('/admin-login', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin Portal</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"><style>${CSS}</style></head>
  <body style="display:grid; place-items:center; min-height:100vh;">
  <div class="glass-card" style="width:min(390px,92vw); padding:32px 26px;">
    <div style="text-align:center; margin-bottom:20px">
      <div style="width:60px; height:60px; margin:0 auto 10px; border-radius:50%; background:linear-gradient(135deg,#2563eb,#8b5cf6); display:grid; place-items:center; font-size:26px; color:white;">🔐</div>
      <h2 style="font-size:1.35rem; font-weight:800;">Admin Access</h2>
      <p style="color:#64748b; font-size:13px">Authorized association staff only</p>
    </div>
    ${req.query.e ? '<div class="err">Invalid username or password.</div>' : ''}
    <form method="POST" action="/admin-login">
      <label style="margin-top:0">Username</label><input name="u" required autocomplete="username">
      <label>Password</label><input name="p" type="password" required autocomplete="current-password">
      <button class="btn" style="width:100%; margin-top:20px; padding:13px">Sign In to Dashboard</button>
    </form>
    <p style="text-align:center; margin-top:20px"><a href="/" style="font-size:13px">← Return to Website</a></p>
  </div></body></html>`);
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
    ['/admin', '📊 Overview', null],
    ['/admin/members', '👥 Members', 'members'],
    ['/admin/content/announcement', '📢 Announcements', 'content'],
    ['/admin/content/news', '📰 News', 'content'],
    ['/admin/content/event', '📅 Events', 'content'],
    ['/admin/meetings', '🤝 Meetings', 'meetings'],
    ['/admin/content/education', '📚 Education/PDFs', 'content'],
    ['/admin/content/heritage', '🏛️ Heritage & Docs', 'content'],
    ['/admin/content/gallery', '🖼️ Gallery', 'content'],
    ['/admin/leaders', '🎖️ Leadership', 'leaders'],
    ['/admin/finance', '💰 Finance', 'finance'],
    ['/admin/support', '💬 Support', 'support'],
    ['/admin/staff', '🔑 Staff & Roles', 'staff'],
    ['/admin/audit-logs', '📜 Audit Logs', 'audit'],
    ['/admin/backup', '💾 Backup', 'backup']
  ].filter(x => !x[2] || can(req, x[2]));

  return page(req, title, `
    <div class="portal-menu" style="margin-top:0; margin-bottom:18px">
      ${links.map(x => `<a href="${x[0]}" class="portal-btn ${req.path === x[0] || (x[0] !== '/admin' && req.path.startsWith(x[0])) ? 'active' : ''}">${x[1]}</a>`).join('')}
    </div>
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

// Admin Overview
app.get('/admin', needStaff, async (req, res) => {
  const sc = scopeOf(req), w = sc ? ' WHERE campus=$1' : '', pr = sc ? [sc] : [];
  const [m] = await q(`SELECT COUNT(*)::int n,
                       SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END)::int p,
                       SUM(CASE WHEN status='official' THEN 1 ELSE 0 END)::int o,
                       SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END)::int r
                       FROM members${w}`, pr);
  const [posts] = await q(`SELECT COUNT(*)::int total FROM posts`);
  const [resets] = await q(`SELECT COUNT(*)::int pending FROM password_resets WHERE status='pending'`);

  res.send(A(req, 'Admin Dashboard', `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="num" style="color:#2563eb">${m.n}</div>
        <div class="label">Total Members</div>
      </div>
      <div class="stat-card">
        <div class="num" style="color:#10b981">${m.o || 0}</div>
        <div class="label">Approved (Official)</div>
      </div>
      <div class="stat-card">
        <div class="num" style="color:#f59e0b">${m.p || 0}</div>
        <div class="label">Pending Applications</div>
      </div>
      <div class="stat-card">
        <div class="num" style="color:#ef4444">${m.r || 0}</div>
        <div class="label">Rejected</div>
      </div>
    </div>

    ${resets.pending > 0 ? `
      <div class="glass-card" style="background:#fffbeb; border:1px solid #fde68a; padding:16px 20px;">
        <span style="font-weight:700; color:#b45309">⚠️ Notice:</span> You have <b>${resets.pending}</b> pending password reset requests.
        <a href="/admin/resets" style="margin-left:12px; font-weight:700">Review Requests →</a>
      </div>
    ` : ''}
  `));
});

// Admin Members Management (Section 5)
app.get('/admin/members', guard('members'), async (req, res) => {
  const sc = scopeOf(req), cf = sc || (CAMPUS[req.query.campus] ? req.query.campus : '');
  const statusFilter = req.query.status || '';
  const qs = String(req.query.q || '').trim().slice(0, 50), pr = [], c = [];
  if (cf) { pr.push(cf); c.push(`campus=$${pr.length}`); }
  if (statusFilter) { pr.push(statusFilter); c.push(`status=$${pr.length}`); }
  if (qs) { pr.push('%' + qs + '%'); c.push(`(name ILIKE $${pr.length} OR member_no ILIKE $${pr.length} OR student_id ILIKE $${pr.length} OR phone ILIKE $${pr.length} OR zone_woreda ILIKE $${pr.length})`); }

  const ms = await q(`SELECT * FROM members ${c.length ? 'WHERE ' + c.join(' AND ') : ''} ORDER BY id DESC LIMIT 400`, pr);
  const act = (id, a, t, cls) => `<form method="POST" action="/admin/members/${id}/${a}" style="display:inline"><button class="btn ${cls || ''}" style="padding:5px 10px;font-size:11.5px;box-shadow:none">${t}</button></form>`;

  res.send(A(req, 'Members Management', `
    <div class="glass-card" style="padding:22px">
      <form style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px">
        <input name="q" value="${h(qs)}" placeholder="Search by name, ID, phone, woreda..." style="flex:1; min-width:180px">
        ${sc ? '' : sel('campus', [['', 'All Campuses']].concat(campusOpts(null)), cf)}
        ${sel('status', [['', 'All Statuses'], ['official', 'Official'], ['pending', 'Pending'], ['registered', 'Registered'], ['rejected', 'Rejected']], statusFilter)}
        <button class="btn" style="padding:0 18px">Filter</button>
      </form>

      <div class="tw">
        <table>
          <tr><th>No</th><th>Name</th><th>Campus</th><th>College & Dept</th><th>Zone/Woreda</th><th>Status</th><th>Actions</th></tr>
          ${ms.map(m => `<tr>
            <td style="font-weight:600;font-size:12.5px">${h(m.member_no)}</td>
            <td><b>${h(m.name)}</b><br><small style="color:var(--text-muted)">${h(m.student_id)}</small></td>
            <td>${h(campusName(req, m.campus))}</td>
            <td>${h(m.department)} · Y${h(m.year)}</td>
            <td>${h(m.zone_woreda || '-')}</td>
            <td><span class="badge ${m.status}">${h(m.status)}</span></td>
            <td style="white-space:nowrap">
              ${m.status !== 'official' ? act(m.id, 'approve', 'Approve', 'g') : ''}
              ${m.status === 'pending' ? act(m.id, 'reject', 'Reject', 'danger') : ''}
              ${m.status === 'official' ? act(m.id, 'revoke', 'Revoke', 'secondary') : ''}
            </td>
          </tr>`).join('')}
        </table>
      </div>
    </div>
  `));
});

[['approve', 'official'], ['reject', 'rejected'], ['revoke', 'registered']].forEach(([a, st]) => {
  app.post('/admin/members/:id/' + a, async (req, res) => {
    const [m] = await q(`SELECT * FROM members WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
    if (m) {
      await q(`UPDATE members SET status=$1 WHERE id=$2`, [st, m.id]);
      await logAudit(req, 'MEMBER_STATUS_CHANGE', m.member_no, `Status changed to: ${st}`);
    }
    res.redirect('/admin/members');
  });
});

// Admin Meetings (Section 9)
app.get('/admin/meetings', guard('meetings'), async (req, res) => {
  const meets = await q(`SELECT * FROM meetings ORDER BY id DESC LIMIT 50`);
  res.send(A(req, 'Meeting Minutes & Agendas', `
    <div class="glass-card" style="padding:22px">
      <h3 style="font-size:1.15rem; font-weight:750; margin-bottom:12px">Record New Meeting / Minutes</h3>
      <form method="POST" action="/admin/meetings" enctype="multipart/form-data">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px">
          <div><label>Title</label><input name="title" required placeholder="e.g. 1st Semester Central Executive Assembly"></div>
          <div><label>Meeting Date</label><input name="meeting_date" type="date" required></div>
          <div><label>Campus</label>${sel('campus', campusOpts(scopeOf(req), true))}</div>
        </div>
        <label>Agenda</label><textarea name="agenda" rows="2" placeholder="List of discussion topics..."></textarea>
        <label>Meeting Minutes</label><textarea name="minutes" rows="4" placeholder="Detailed proceedings of the meeting..."></textarea>
        <label>Key Decisions & Resolutions</label><textarea name="resolutions" rows="2" placeholder="Agreements reached..."></textarea>
        <label>Signed Document (PDF / Image)</label><input name="file" type="file">
        <p style="margin-top:16px"><button class="btn">Save & Publish Minutes</button></p>
      </form>
    </div>

    <div class="glass-card" style="padding:22px">
      <h3 style="font-size:1rem; font-weight:750; margin-bottom:12px">Recorded Meetings</h3>
      ${meets.map(m => `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f1f5f9; padding:10px 0">
          <div><b>${h(m.title)}</b> · <small style="color:var(--text-muted)">${h(m.meeting_date)} (${h(m.campus)})</small></div>
          <form method="POST" action="/admin/meetings/${m.id}/delete"><button class="btn danger" style="padding:4px 10px; font-size:11.5px">Delete</button></form>
        </div>
      `).join('') || '<p style="color:var(--text-muted)">No meetings recorded yet.</p>'}
    </div>
  `));
});

app.post('/admin/meetings', guard('meetings'), files6([{ name: 'file', maxCount: 1 }]), async (req, res) => {
  const b = req.body, fl = await saveFile(((req.files || {}).file || [])[0]);
  if (b.title) {
    await q(`INSERT INTO meetings (campus, title, meeting_date, agenda, minutes, resolutions, file_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [b.campus || 'all', b.title.slice(0, 200), b.meeting_date, b.agenda, b.minutes, b.resolutions, fl]);
    await logAudit(req, 'MEETING_POST', b.title, `Date: ${b.meeting_date}`);
  }
  res.redirect('/admin/meetings');
});
app.post('/admin/meetings/:id/delete', guard('meetings'), async (req, res) => {
  await q(`DELETE FROM meetings WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  res.redirect('/admin/meetings');
});

// Admin Content Publishing (Sections 6, 8, 10)
app.get('/admin/content/:type', guard('content'), async (req, res) => {
  const tp = req.params.type; if (!TYPES.includes(tp)) return res.redirect('/admin');
  const sc = scopeOf(req), ps = await q(`SELECT * FROM posts WHERE type=$1 ${sc ? 'AND campus=$2' : ''} ORDER BY id DESC LIMIT 60`, sc ? [tp, sc] : [tp]);

  res.send(A(req, tp, `
    <div class="glass-card" style="padding:22px">
      <h3 style="font-size:1.15rem; font-weight:750; margin-bottom:12px">Publish ${h(tp.toUpperCase())}</h3>
      <form method="POST" action="/admin/content/${tp}" enctype="multipart/form-data">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px">
          <div><label>Campus</label>${sel('campus', campusOpts(sc, true))}</div>
          ${tp === 'announcement' ? `<div><label>Emergency Alert?</label><select name="is_emergency"><option value="0">Normal</option><option value="1">🚨 High Alert (Emergency)</option></select></div>` : ''}
          <div><label>Event / Activity Date</label><input name="event_date" placeholder="YYYY-MM-DD or date text"></div>
        </div>
        <label>Title (Oromo / Amharic / English)</label>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px">
          <input name="title_om" placeholder="Afaan Oromoo">
          <input name="title_am" placeholder="አማርኛ">
          <input name="title_en" placeholder="English">
        </div>
        ${tp === 'gallery' ? '' : `
          <label>Content Body (Oromo / Amharic / English)</label>
          <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px">
            <textarea name="body_om" rows="3" placeholder="Afaan Oromoo"></textarea>
            <textarea name="body_am" rows="3" placeholder="አማርኛ"></textarea>
            <textarea name="body_en" rows="3" placeholder="English"></textarea>
          </div>
        `}
        <label>Image Cover</label><input name="image" type="file" accept="image/*">
        ${['document', 'education', 'heritage'].includes(tp) ? `<label>Downloadable Document / Study PDF</label><input name="file" type="file">` : ''}
        <p style="margin-top:18px"><button class="btn">Publish to Portal</button></p>
      </form>
    </div>

    <div class="glass-card" style="padding:22px">
      <h3 style="font-size:1rem; font-weight:750; margin-bottom:12px">Published Posts</h3>
      ${ps.map(p => `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f1f5f9; padding:10px 0">
          <div>
            <b>${h(p.title_en || p.title_om || p.title_am)}</b> 
            <small style="color:var(--text-muted)">(${h(p.campus)})</small>
            ${p.is_emergency ? '<span class="badge alert" style="margin-left:6px">🚨 EMERGENCY</span>' : ''}
          </div>
          <form method="POST" action="/admin/content/${tp}/${p.id}/delete">
            <button class="btn danger" style="padding:4px 10px; font-size:11.5px">Delete</button>
          </form>
        </div>
      `).join('') || `<p style="color:var(--text-muted)">No content published yet.</p>`}
    </div>
  `));
});

app.post('/admin/content/:type', guard('content'), files6([{ name: 'image', maxCount: 1 }, { name: 'file', maxCount: 1 }]), async (req, res) => {
  const tp = req.params.type, b = req.body, sc = scopeOf(req), s = (k, n) => String(b[k] || '').trim().slice(0, n);
  if (!TYPES.includes(tp)) return res.redirect('/admin');
  const img = await saveFile(((req.files || {}).image || [])[0]), fl = await saveFile(((req.files || {}).file || [])[0]);
  if (s('title_om', 200) || s('title_en', 200) || s('title_am', 200)) {
    await q(`INSERT INTO posts (type, campus, title_om, title_en, title_am, body_om, body_en, body_am, event_date, is_emergency, image_id, file_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [tp, sc || (CAMPUS[b.campus] ? b.campus : 'all'), s('title_om', 200), s('title_en', 200), s('title_am', 200),
       s('body_om', 4000), s('body_en', 4000), s('body_am', 4000), b.event_date || '', parseInt(b.is_emergency, 10) || 0, img, fl]);
    await logAudit(req, 'CONTENT_PUBLISH', tp, s('title_en', 100) || s('title_om', 100));
  }
  res.redirect('/admin/content/' + tp);
});

app.post('/admin/content/:type/:id/delete', guard('content'), async (req, res) => {
  await q(`DELETE FROM posts WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  res.redirect('/admin/content/' + req.params.type);
});

// Admin Leadership Management (Section 4)
app.get('/admin/leaders', guard('leaders'), async (req, res) => {
  const sc = scopeOf(req), ls = await q(`SELECT * FROM leaders ${sc ? 'WHERE campus=$1' : ''} ORDER BY (level='central') DESC, ord, id`, sc ? [sc] : []);
  res.send(A(req, 'Leadership Management', `
    <div class="glass-card" style="padding:22px">
      <h3 style="font-size:1.15rem; font-weight:750; margin-bottom:12px">Add Leadership Member</h3>
      <form method="POST" action="/admin/leaders" enctype="multipart/form-data">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px">
          <div><label>Leader Full Name</label><input name="name" required placeholder="Full Name"></div>
          <div><label>Leadership Term</label><input name="term" value="2025-2026" required></div>
          <div><label>Level</label>${sel('level', sc ? [['campus', 'Campus Representative']] : [['central', 'Central Executive'], ['campus', 'Campus Coordinator']])}</div>
          <div><label>Campus</label>${sel('campus', campusOpts(sc, false))}</div>
        </div>
        <label>Portfolio / Position (Oromo / Amharic / English)</label>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px">
          <input name="position_om" placeholder="Pirezidaantii...">
          <input name="position_am" placeholder="ፕሬዝዳንት...">
          <input name="position_en" placeholder="President, Secretary...">
        </div>
        <label>Mandate & Responsibilities</label>
        <textarea name="responsibilities" rows="2" placeholder="Key responsibilities and duties..."></textarea>
        <label>Display Priority / Order</label><input name="ord" type="number" value="1" style="max-width:140px">
        <label>Official Portrait</label><input name="photo" type="file" accept="image/*">
        <p style="margin-top:16px"><button class="btn">Save Leader</button></p>
      </form>
    </div>

    <div class="glass-card" style="padding:22px">
      ${ls.map(x => `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f1f5f9; padding:10px 0">
          <div><b>${h(x.name)}</b> · <span style="color:#2563eb">${h(x.position_en || x.position_om)}</span> (${h(x.campus)})</div>
          <form method="POST" action="/admin/leaders/${x.id}/delete">
            <button class="btn danger" style="padding:4px 10px; font-size:11.5px">Delete</button>
          </form>
        </div>
      `).join('') || `<p style="color:var(--text-muted)">No leaders added yet.</p>`}
    </div>
  `));
});

app.post('/admin/leaders', guard('leaders'), files6([{ name: 'photo', maxCount: 1 }]), async (req, res) => {
  const b = req.body, sc = scopeOf(req), pid = await saveFile(((req.files || {}).photo || [])[0]);
  const lvl = sc ? 'campus' : (b.level === 'campus' ? 'campus' : 'central');
  if (b.name) {
    await q(`INSERT INTO leaders (name, position_om, position_en, position_am, term, responsibilities, level, campus, photo_id, ord)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [b.name.slice(0, 80), (b.position_om || '').slice(0, 100), (b.position_en || '').slice(0, 100), (b.position_am || '').slice(0, 100),
       b.term || '2025-2026', b.responsibilities || '', lvl, lvl === 'central' ? 'all' : (sc || (CAMPUS[b.campus] ? b.campus : 'robe')),
       pid, parseInt(b.ord, 10) || 0]);
    await logAudit(req, 'LEADER_ADD', b.name, b.position_en);
  }
  res.redirect('/admin/leaders');
});
app.post('/admin/leaders/:id/delete', guard('leaders'), async (req, res) => {
  await q(`DELETE FROM leaders WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  res.redirect('/admin/leaders');
});

// Admin Finance Management (Section 7)
const KINDS = [
  ['contribution', 'Membership Contribution'],
  ['donation', 'External Donation'],
  ['fundraising', 'Fundraising Campaign'],
  ['income', 'Other Income'],
  ['expense', 'Operational Expense'],
  ['project_budget', 'Project Budget Allocation']
];

app.get('/admin/finance', guard('finance'), async (req, res) => {
  const sc = scopeOf(req), w = sc ? 'WHERE campus=$1' : '', pr = sc ? [sc] : [];
  const tx = await q(`SELECT * FROM transactions ${w} ORDER BY id DESC LIMIT 80`, pr);
  const rp = await q(`SELECT * FROM finance_reports ${sc ? 'WHERE campus=$1' : ''} ORDER BY id DESC LIMIT 24`, pr);

  res.send(A(req, 'Finance & Fundraising', `
    <div class="glass-card" style="padding:22px">
      <h3 style="font-size:1.15rem; font-weight:750; margin-bottom:12px">Record Transaction</h3>
      <form method="POST" action="/admin/finance/tx">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px">
          <div><label>Category</label>${sel('kind', KINDS)}</div>
          <div><label>Amount (ETB)</label><input name="amount" type="number" step="0.01" min="0" required></div>
          <div><label>Date</label><input name="tdate" type="date" required></div>
          <div><label>Campus</label>${sel('campus', campusOpts(sc, true))}</div>
        </div>
        <label>Memo / Description</label><input name="note" placeholder="Purpose or donor name">
        <p style="margin-top:16px"><button class="btn">Record Transaction</button></p>
      </form>
    </div>

    <div class="glass-card" style="padding:22px">
      <h3 style="font-size:1.15rem; font-weight:750; margin-bottom:12px">Generate Formal Financial Report</h3>
      <form method="POST" action="/admin/finance/report" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end">
        <div><label>Period (YYYY-MM)</label><input name="period" placeholder="2026-11" required style="max-width:140px"></div>
        <div><label>Starting Balance</label><input name="starting_balance" type="number" step="0.01" value="0" style="max-width:150px"></div>
        <div><label>Campus</label>${sel('campus', campusOpts(sc, true))}</div>
        <button class="btn secondary">Compute & Generate</button>
      </form>

      <div class="tw" style="margin-top:16px">
        <table>
          <tr><th>Period</th><th>Campus</th><th>Starting</th><th>Income</th><th>Expense</th><th>Status</th><th>Actions</th></tr>
          ${rp.map(r => `<tr>
            <td>${h(r.period)}</td>
            <td>${h(r.campus)}</td>
            <td>${Number(r.starting_balance || 0).toLocaleString()}</td>
            <td style="color:#10b981; font-weight:600">${Number(r.income).toLocaleString()}</td>
            <td style="color:#ef4444; font-weight:600">${Number(r.expense).toLocaleString()}</td>
            <td>${r.approved ? '<span class="badge official">✔ Published</span>' : '<span class="badge pending">Draft</span>'}</td>
            <td>
              ${can(req, 'approve') ? `
                <form method="POST" action="/admin/finance/report/${r.id}/${r.approved ? 'hide' : 'approve'}" style="display:inline">
                  <button class="btn ${r.approved ? 'secondary' : 'g'}" style="padding:4px 10px; font-size:11.5px">${r.approved ? 'Hide' : 'Approve & Publish'}</button>
                </form>
              ` : ''}
            </td>
          </tr>`).join('')}
        </table>
      </div>
    </div>
  `));
});

app.post('/admin/finance/tx', guard('finance'), async (req, res) => {
  const b = req.body, sc = scopeOf(req), amt = num(b.amount);
  if (KINDS.some(k => k[0] === b.kind) && amt > 0 && /^\d{4}-\d{2}-\d{2}$/.test(b.tdate || '')) {
    await q(`INSERT INTO transactions (kind,amount,tdate,note,campus,created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
      [b.kind, amt, b.tdate, (b.note || '').slice(0, 200), sc || (CAMPUS[b.campus] ? b.campus : 'all'), req.session.sname || '']);
    await logAudit(req, 'TRANSACTION_RECORD', b.kind, `${amt} ETB - ${b.note || ''}`);
  }
  res.redirect('/admin/finance');
});

app.post('/admin/finance/report', guard('finance'), async (req, res) => {
  const per = String(req.body.period || '').trim(), sc = scopeOf(req), cmp = sc || (CAMPUS[req.body.campus] ? req.body.campus : 'all');
  const startBal = num(req.body.starting_balance);
  if (/^\d{4}(-\d{2})?$/.test(per)) {
    const rows = await q(`SELECT kind, SUM(amount) a FROM transactions WHERE tdate LIKE $1 ${cmp === 'all' ? '' : 'AND campus=$2'} GROUP BY kind`,
      cmp === 'all' ? [per + '%'] : [per + '%', cmp]);
    let inc = 0, exp = 0; const d = {};
    rows.forEach(r => {
      d[r.kind] = Number(r.a);
      if (r.kind === 'expense') exp += Number(r.a);
      else inc += Number(r.a);
    });
    await q(`INSERT INTO finance_reports (period,campus,income,expense,starting_balance,detail) VALUES ($1,$2,$3,$4,$5,$6)`,
      [per, cmp, inc, exp, startBal, JSON.stringify(d)]);
    await logAudit(req, 'FINANCE_REPORT_GEN', per, `Campus: ${cmp}`);
  }
  res.redirect('/admin/finance');
});

app.post('/admin/finance/report/:id/:a', guard('approve'), async (req, res) => {
  const isApprove = req.params.a === 'approve';
  await q(`UPDATE finance_reports SET approved=$1 WHERE id=$2`, [isApprove ? 1 : 0, parseInt(req.params.id, 10) || 0]);
  await logAudit(req, 'FINANCE_REPORT_STATUS', req.params.id, isApprove ? 'Published' : 'Hidden');
  res.redirect('/admin/finance');
});

// Admin Support Handling
app.get('/admin/support', guard('support'), async (req, res) => {
  const sc = scopeOf(req);
  const rs = await q(`SELECT * FROM support_requests ${sc ? "WHERE campus IN ($1,'all')" : ''} ORDER BY (status='open') DESC, id DESC LIMIT 100`, sc ? [sc] : []);
  res.send(A(req, 'Support Tickets', rs.map(r => `
    <div class="glass-card" style="padding:20px">
      <small style="color:var(--text-muted)">${h(r.member_no)} · ${h(r.name)} (${h(r.campus)}) · Category: <b>${h(r.category || 'general')}</b></small>
      <h3 style="margin:6px 0; font-size:1.05rem">${h(r.subject)} <span class="badge ${r.status === 'closed' ? 'official' : 'pending'}">${h(r.status)}</span></h3>
      <p style="font-size:13.5px; color:var(--text-2)">${h(r.message)}</p>
      <form method="POST" action="/admin/support/${r.id}/reply" style="margin-top:12px">
        <textarea name="reply" rows="2" placeholder="Write administrative resolution or reply...">${h(r.reply || '')}</textarea>
        <p style="margin-top:8px"><button class="btn">Reply & Close Ticket</button></p>
      </form>
    </div>
  `).join('') || `<div class="glass-card" style="text-align:center;padding:40px"><p style="color:var(--text-muted)">No support inquiries.</p></div>`));
});

app.post('/admin/support/:id/reply', guard('support'), async (req, res) => {
  await q(`UPDATE support_requests SET reply=$1, status='closed' WHERE id=$2`, [String(req.body.reply || '').slice(0, 2000), parseInt(req.params.id, 10) || 0]);
  await logAudit(req, 'SUPPORT_REPLY', req.params.id, 'Replied and closed ticket');
  res.redirect('/admin/support');
});

// Staff Accounts & Roles (Section 11)
app.get('/admin/staff', guard('staff'), async (req, res) => {
  const st = await q(`SELECT id,username,name,role,campus,active FROM staff ORDER BY id`);
  res.send(A(req, 'Staff Accounts & Permissions', `
    <div class="glass-card" style="padding:22px">
      <h3 style="font-size:1.15rem; font-weight:750; margin-bottom:12px">Create Official Administrative Account</h3>
      <form method="POST" action="/admin/staff">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px">
          <div><label>Officer Full Name</label><input name="name" required placeholder="e.g. Kefyalew Kebede"></div>
          <div><label>Username</label><input name="username" required placeholder="username"></div>
          <div><label>Role Mandate</label>${sel('role', ROLES.map(r => [r, r]))}</div>
          <div><label>Campus Assignment</label>${sel('campus', campusOpts(null))}</div>
        </div>
        <label>Password (Min. 8 characters)</label><input name="password" type="password" minlength="8" required>
        <p style="margin-top:16px"><button class="btn">Create Staff Account</button></p>
      </form>
    </div>

    <div class="glass-card" style="padding:22px">
      <div class="tw">
        <table>
          <tr><th>Name</th><th>Username</th><th>Assigned Role</th><th>Campus</th><th>Status</th><th>Action</th></tr>
          ${st.map(x => `<tr>
            <td>${h(x.name)}</td>
            <td>${h(x.username)}</td>
            <td><b>${h(x.role)}</b></td>
            <td>${h(x.campus || 'All Campuses')}</td>
            <td><span class="badge ${x.active ? 'official' : 'rejected'}">${x.active ? 'Active' : 'Disabled'}</span></td>
            <td>
              <form method="POST" action="/admin/staff/${x.id}/toggle">
                <button class="btn ${x.active ? 'secondary' : 'g'}" style="padding:4px 10px; font-size:11.5px">${x.active ? 'Deactivate' : 'Activate'}</button>
              </form>
            </td>
          </tr>`).join('')}
        </table>
      </div>
    </div>
  `));
});

app.post('/admin/staff', guard('staff'), async (req, res) => {
  const b = req.body;
  if (ROLES.includes(b.role) && b.name && b.username && String(b.password || '').length >= 8) {
    try {
      await q(`INSERT INTO staff (username,name,role,campus,password) VALUES ($1,$2,$3,$4,$5)`,
        [b.username.trim().toLowerCase(), b.name.slice(0, 80), b.role, CAMPUS[b.campus] ? b.campus : null, bcrypt.hashSync(String(b.password), 10)]);
      await logAudit(req, 'STAFF_CREATE', b.username, `Role: ${b.role}`);
    } catch (e) {}
  }
  res.redirect('/admin/staff');
});

app.post('/admin/staff/:id/toggle', guard('staff'), async (req, res) => {
  await q(`UPDATE staff SET active=1-active WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  res.redirect('/admin/staff');
});

// Admin Password Reset Reviews (Section 11)
app.get('/admin/resets', guard('members'), async (req, res) => {
  const resets = await q(`SELECT * FROM password_resets ORDER BY (status='pending') DESC, id DESC LIMIT 50`);
  res.send(A(req, 'Password Reset Requests', `
    <div class="glass-card" style="padding:22px">
      <h3 style="font-size:1.15rem; font-weight:750; margin-bottom:12px">Student Password Reset Inquiries</h3>
      <div class="tw">
        <table>
          <tr><th>Student ID</th><th>Phone</th><th>Reason</th><th>Status</th><th>Action</th></tr>
          ${resets.map(r => `<tr>
            <td><b>${h(r.student_id)}</b></td>
            <td>${h(r.phone)}</td>
            <td>${h(r.reason || '-')}</td>
            <td><span class="badge ${r.status === 'pending' ? 'pending' : 'official'}">${h(r.status)}</span></td>
            <td>
              ${r.status === 'pending' ? `
                <form method="POST" action="/admin/resets/${r.id}/reset" style="display:inline">
                  <input name="new_pass" placeholder="Set New Password" style="padding:4px 8px; font-size:12px; width:140px;" required>
                  <button class="btn g" style="padding:4px 10px; font-size:11.5px">Reset & Close</button>
                </form>
              ` : 'Resolved'}
            </td>
          </tr>`).join('')}
        </table>
      </div>
    </div>
  `));
});

app.post('/admin/resets/:id/reset', guard('members'), async (req, res) => {
  const [r] = await q(`SELECT * FROM password_resets WHERE id=$1`, [parseInt(req.params.id, 10) || 0]);
  if (r && req.body.new_pass) {
    const hash = bcrypt.hashSync(String(req.body.new_pass), 10);
    await q(`UPDATE members SET password=$1 WHERE UPPER(student_id)=UPPER($2)`, [hash, r.student_id]);
    await q(`UPDATE password_resets SET status='resolved' WHERE id=$3`, [r.id]);
    await logAudit(req, 'PASSWORD_RESET', r.student_id, 'Admin manual reset completed');
  }
  res.redirect('/admin/resets');
});

// Audit Logs View (Section 11)
app.get('/admin/audit-logs', guard('audit'), async (req, res) => {
  const logs = await q(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 150`);
  res.send(A(req, 'Activity & Audit Logs', `
    <div class="glass-card" style="padding:22px">
      <h3 style="font-size:1.15rem; font-weight:750; margin-bottom:12px">Administrative Action & Audit Trail</h3>
      <div class="tw">
        <table>
          <tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th><th>IP</th></tr>
          ${logs.map(l => `<tr>
            <td style="font-size:11.5px; color:var(--text-muted)">${new Date(l.created_at).toLocaleString()}</td>
            <td><b>${h(l.actor)}</b></td>
            <td><span class="badge ${l.action.includes('DELETE') ? 'rejected' : 'registered'}">${h(l.action)}</span></td>
            <td>${h(l.target || '-')}</td>
            <td style="font-size:12px">${h(l.details || '-')}</td>
            <td style="font-size:11.5px; color:var(--text-muted)">${h(l.ip)}</td>
          </tr>`).join('')}
        </table>
      </div>
    </div>
  `));
});

// Secure Data Backup System (Section 11)
app.get('/admin/backup', guard('backup'), async (req, res) => {
  if (!req.query.go) return res.send(A(req, 'Data Backup', `
    <div class="glass-card" style="text-align:center; padding:48px 24px">
      <div style="font-size:42px; margin-bottom:10px">💾</div>
      <h3 style="font-size:1.3rem; font-weight:750; margin-bottom:6px">Complete Database Export & Backup</h3>
      <p style="color:var(--text-muted); margin-bottom:20px; font-size:13.5px">Download an encrypted, full JSON snapshot of all members, posts, minutes, finance, and staff accounts.</p>
      <a class="btn" href="/admin/backup?go=1">⬇ Download Backup Snapshot</a>
    </div>
  `));

  const out = { exported_at: new Date().toISOString(), platform: 'Siikkoo-Mandoo MWU' };
  for (const t of ['members', 'posts', 'leaders', 'meetings', 'support_requests', 'transactions', 'finance_reports', 'staff', 'audit_logs']) {
    out[t] = await q(`SELECT * FROM ${t}`);
  }
  await logAudit(req, 'BACKUP_EXPORT', 'database', 'Full database snapshot downloaded');
  res.set('Content-Type', 'application/json')
     .set('Content-Disposition', `attachment; filename="sikkoo-mandoo-backup-${new Date().toISOString().slice(0, 10)}.json"`)
     .send(JSON.stringify(out, null, 2));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Siikkoo-Mandoo MWU Official Platform running on port ${PORT}`);
});
