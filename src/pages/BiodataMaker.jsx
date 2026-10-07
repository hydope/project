import { useState, useRef, useEffect, forwardRef } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../layouts/LandingLayout';
import { usePageTitle } from '../lib/usePageTitle';
import { Download, ImagePlus, Save, Sparkles } from 'lucide-react';

const TEMPLATES = [
  {
    id: 'essential', name: 'Essential', desc: 'Clean, minimal — just the details',
    bg: '#ffffff', ink: '#1a1a1a', accent: '#4a4a4a', muted: '#888888',
  },
  {
    id: 'noor', name: 'Noor', desc: 'Ivory & emerald with geometric grace',
    bg: '#fdfbf7', ink: '#1c2b23', accent: '#0e5c3f', muted: '#8a9a90',
  },
  {
    id: 'sahara', name: 'Sahara', desc: 'Warm sand & bronze, editorial layout',
    bg: '#faf6f0', ink: '#2c2419', accent: '#9a6b2f', muted: '#a89880',
  },
  {
    id: 'midnight', name: 'Midnight', desc: 'Deep ink with gold foil accents',
    bg: '#101418', ink: '#f2ede4', accent: '#d4af6a', muted: '#8a8578',
  },
];

const SECTIONS = [
  {
    title: 'Personal Details',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'dob', label: 'Date of Birth' },
      { key: 'age', label: 'Age' },
      { key: 'height', label: 'Height' },
      { key: 'complexion', label: 'Complexion' },
      { key: 'education', label: 'Education' },
      { key: 'profession', label: 'Profession' },
      { key: 'religion', label: 'Religion / Sect' },
      { key: 'marital', label: 'Marital Status' },
    ],
  },
  {
    title: 'Family Details',
    fields: [
      { key: 'father', label: "Father's Name" },
      { key: 'fatherOcc', label: "Father's Occupation" },
      { key: 'mother', label: "Mother's Name" },
      { key: 'motherOcc', label: "Mother's Occupation" },
      { key: 'siblings', label: 'Siblings' },
    ],
  },
  {
    title: 'Contact Details',
    fields: [
      { key: 'contactPerson', label: 'Contact Person' },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' },
      { key: 'address', label: 'Address' },
    ],
  },
  {
    title: 'Partner Preference',
    fields: [{ key: 'preference', label: 'Looking for', type: 'textarea' }],
  },
];

const DRAFT_KEY = 'shiarishta_biodata_draft_v1';

export default function BiodataMaker() {
  usePageTitle('Marriage Biodata Maker');
  const [template, setTemplate] = useState('gold');
  const [data, setData] = useState({ religion: 'Shia Muslim' });
  const [photo, setPhoto] = useState(null);
  const [saved, setSaved] = useState(false);
  const previewRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (d) { setData(d.data || {}); setTemplate(d.template || 'gold'); setPhoto(d.photo || null); }
    } catch { /* ignore */ }
  }, []);

  const set = (k, v) => { setData(d => ({ ...d, [k]: v })); setSaved(false); };

  const onPhoto = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { setPhoto(reader.result); setSaved(false); };
    reader.readAsDataURL(f);
  };

  const saveDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ data, template, photo }));
      setSaved(true);
    } catch { /* storage full */ }
  };

  const download = async () => {
    const node = previewRef.current;
    if (!node) return;
    // Render the preview DOM to canvas via SVG foreignObject.
    const w = 794, h = 1123; // A4-ish at 96dpi
    const clone = node.cloneNode(true);
    clone.style.width = w + 'px';
    clone.style.minHeight = h + 'px';
    const html = new XMLSerializer().serializeToString(clone);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%">${html.replace(/&/g, '&amp;')}</foreignObject></svg>`;
    const img = new Image();
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = w * 2; canvas.height = h * 2;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const a = document.createElement('a');
    a.download = `biodata-${(data.name || 'profile').replace(/\s+/g, '-').toLowerCase()}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };

  const t = TEMPLATES.find(x => x.id === template);

  return (
    <Layout>
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--color-ink)' }}>
            Marriage Biodata Maker
          </h1>
          <p className="text-sm max-w-xl mx-auto" style={{ color: 'var(--color-ink-secondary)' }}>
            Create a beautiful Shia marriage biodata in minutes — no account needed.
            Add a photo and details, pick a design, and download it with the ShiaRishta watermark.
          </p>
        </div>

        {/* Templates */}
        <div className="flex gap-3 justify-center mb-8 flex-wrap">
          {TEMPLATES.map(x => (
            <button key={x.id} onClick={() => { setTemplate(x.id); setSaved(false); }}
              className="px-4 py-2.5 rounded-xl text-left transition-all"
              style={{
                border: template === x.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: 'var(--color-surface)',
              }}>
              <p className="text-sm font-bold" style={{ color: 'var(--color-ink)' }}>{x.name}</p>
              <p className="text-[11px]" style={{ color: 'var(--color-ink-tertiary)' }}>{x.desc}</p>
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Form */}
          <div className="space-y-6">
            <div className="card p-5">
              <h2 className="font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--color-ink)' }}>
                <ImagePlus className="w-4 h-4" /> Photo
              </h2>
              <div className="flex items-center gap-4">
                {photo ? (
                  <img src={photo} alt="Biodata" className="w-20 h-24 object-cover rounded-lg" style={{ border: '1px solid var(--color-border)' }} />
                ) : (
                  <div className="w-20 h-24 rounded-lg flex items-center justify-center text-xs"
                    style={{ background: 'var(--color-canvas)', color: 'var(--color-ink-tertiary)', border: '1px dashed var(--color-border)' }}>
                    No photo
                  </div>
                )}
                <div>
                  <button onClick={() => fileRef.current?.click()} className="btn btn-ghost btn-sm">Choose photo</button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
                  <p className="text-[11px] mt-1" style={{ color: 'var(--color-ink-tertiary)' }}>Optional. Stored only in your browser.</p>
                </div>
              </div>
            </div>

            {SECTIONS.map(s => (
              <div key={s.title} className="card p-5">
                <h2 className="font-bold mb-3" style={{ color: 'var(--color-ink)' }}>{s.title}</h2>
                <div className="space-y-3">
                  {s.fields.map(f => (
                    <div key={f.key}>
                      <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--color-ink-secondary)' }}>{f.label}</label>
                      {f.type === 'textarea' ? (
                        <textarea value={data[f.key] || ''} onChange={e => set(f.key, e.target.value)} rows={2} className="input w-full text-sm" />
                      ) : (
                        <input value={data[f.key] || ''} onChange={e => set(f.key, e.target.value)} className="input w-full text-sm" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="flex gap-3">
              <button onClick={saveDraft} className="btn btn-ghost flex items-center gap-2">
                <Save className="w-4 h-4" /> {saved ? 'Draft saved ✓' : 'Save draft'}
              </button>
              <button onClick={download} className="btn btn-primary flex items-center gap-2">
                <Download className="w-4 h-4" /> Download image
              </button>
            </div>
          </div>

          {/* Preview */}
          <div>
            <p className="text-xs font-bold mb-2 flex items-center gap-1.5" style={{ color: 'var(--color-ink-tertiary)' }}>
              <Sparkles className="w-3.5 h-3.5" /> LIVE PREVIEW
            </p>
            <div className="overflow-auto rounded-xl" style={{ border: '1px solid var(--color-border)', maxHeight: '80vh' }}>
              <BiodataPreview ref={previewRef} template={t} data={data} photo={photo} />
            </div>
          </div>
        </div>

        <p className="text-center text-xs mt-8" style={{ color: 'var(--color-ink-tertiary)' }}>
          Want this on a real matchmaking profile? <Link to="/auth/register" className="link-primary font-semibold">Create a free account</Link>
        </p>
      </main>
    </Layout>
  );
}

function DetailRow({ label, value, ink, muted }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 7, fontSize: 13.5, lineHeight: 1.55 }}>
      <span style={{ width: 148, flexShrink: 0, color: muted, fontWeight: 500 }}>{label}</span>
      <span style={{ color: ink, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function SectionTitle({ children, accent, muted }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, marginTop: 4 }}>
      <h2 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 3, color: accent, margin: 0, whiteSpace: 'nowrap' }}>
        {children}
      </h2>
      <div style={{ flex: 1, height: 1, background: muted, opacity: 0.4 }} />
    </div>
  );
}

function Watermark({ dark }) {
  return (
    <>
      {/* Diagonal watermark across the page */}
      <div style={{
        position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%,-50%) rotate(-24deg)',
        fontSize: 64, fontWeight: 800, letterSpacing: 6, whiteSpace: 'nowrap',
        color: dark ? 'rgba(212,175,106,0.06)' : 'rgba(0,0,0,0.035)',
        pointerEvents: 'none', userSelect: 'none', fontFamily: 'Georgia, serif',
      }}>
        shiarishta.com
      </div>
      {/* Footer brand bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, padding: '14px 48px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderTop: `1px solid ${dark ? 'rgba(212,175,106,0.25)' : 'rgba(0,0,0,0.08)'}`,
        fontSize: 10.5, letterSpacing: 1.5, textTransform: 'uppercase',
        color: dark ? 'rgba(212,175,106,0.7)' : '#999',
      }}>
        <span>shiarishta.com</span>
        <span>Shia Nikah Matchmaking</span>
      </div>
    </>
  );
}

// Forwarded ref so the download button can serialize this exact DOM.
const BiodataPreview = forwardRef(function BiodataPreview({ template: t, data, photo }, ref) {
  const dark = t.id === 'midnight';
  const hasName = !!data.name;

  const sections = SECTIONS.map(s => ({
    ...s,
    rows: s.fields.filter(f => data[f.key]),
  })).filter(s => s.rows.length > 0);

  const bismillah = (
    <p style={{ fontSize: 20, margin: '0 0 6px', color: t.accent, fontFamily: 'Georgia, serif' }}>
      بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
    </p>
  );

  // ── ESSENTIAL: ultra-clean, minimal ──────────────────────────────
  if (t.id === 'essential') {
    return (
      <div ref={ref} style={{ width: 794, minHeight: 1123, background: t.bg, color: t.ink, padding: '64px 72px 90px', position: 'relative', fontFamily: '-apple-system, "Segoe UI", sans-serif' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          {bismillah}
          <h1 style={{ fontSize: 28, fontWeight: 300, letterSpacing: 8, textTransform: 'uppercase', margin: '8px 0 0', color: t.ink }}>Biodata</h1>
          <div style={{ width: 40, height: 2, background: t.accent, margin: '16px auto 0' }} />
        </div>
        {hasName && (
          <p style={{ textAlign: 'center', fontSize: 22, fontWeight: 600, margin: '0 0 32px' }}>{data.name}</p>
        )}
        {photo && (
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <img src={photo} alt="" style={{ width: 140, height: 168, objectFit: 'cover', borderRadius: 4 }} />
          </div>
        )}
        {sections.map(s => (
          <div key={s.title} style={{ marginBottom: 28 }}>
            <SectionTitle accent={t.accent} muted={t.muted}>{s.title}</SectionTitle>
            {s.rows.map(f => <DetailRow key={f.key} label={f.label} value={data[f.key]} ink={t.ink} muted={t.muted} />)}
          </div>
        ))}
        <Watermark dark={false} />
      </div>
    );
  }

  // ── NOOR: ivory & emerald ────────────────────────────────────────
  if (t.id === 'noor') {
    return (
      <div ref={ref} style={{ width: 794, minHeight: 1123, background: t.bg, color: t.ink, position: 'relative', fontFamily: 'Georgia, serif' }}>
        <div style={{ height: 10, background: `linear-gradient(90deg, ${t.accent}, #1a7a52, ${t.accent})` }} />
        <div style={{ padding: '48px 64px 90px' }}>
          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            {bismillah}
            <div style={{ display: 'inline-block', border: `1px solid ${t.accent}`, padding: '10px 36px', marginTop: 8 }}>
              <h1 style={{ fontSize: 26, fontWeight: 400, letterSpacing: 6, margin: 0, color: t.accent }}>BIODATA</h1>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              {hasName && <p style={{ fontSize: 24, fontWeight: 600, margin: '0 0 4px', color: t.ink }}>{data.name}</p>}
              {data.religion && <p style={{ fontSize: 13, color: t.muted, margin: '0 0 20px', letterSpacing: 1 }}>{data.religion}</p>}
              {sections.map(s => (
                <div key={s.title} style={{ marginBottom: 24 }}>
                  <SectionTitle accent={t.accent} muted={t.muted}>{s.title}</SectionTitle>
                  {s.rows.filter(f => f.key !== 'name' && f.key !== 'religion').map(f =>
                    <DetailRow key={f.key} label={f.label} value={data[f.key]} ink={t.ink} muted={t.muted} />
                  )}
                </div>
              ))}
            </div>
            {photo && (
              <img src={photo} alt="" style={{ width: 168, height: 200, objectFit: 'cover', borderRadius: 8, border: `1px solid ${t.accent}`, flexShrink: 0 }} />
            )}
          </div>
        </div>
        <Watermark dark={false} />
      </div>
    );
  }

  // ── SAHARA: warm editorial ───────────────────────────────────────
  if (t.id === 'sahara') {
    return (
      <div ref={ref} style={{ width: 794, minHeight: 1123, background: t.bg, color: t.ink, position: 'relative', fontFamily: 'Georgia, serif' }}>
        <div style={{ padding: '56px 64px 90px' }}>
          <p style={{ fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', color: t.muted, margin: '0 0 8px' }}>Marriage Biodata</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              {bismillah}
              {hasName && <h1 style={{ fontSize: 38, fontWeight: 400, margin: '6px 0 0', lineHeight: 1.1 }}>{data.name}</h1>}
            </div>
            {photo && <img src={photo} alt="" style={{ width: 130, height: 156, objectFit: 'cover', borderRadius: 100, border: `3px solid ${t.accent}` }} />}
          </div>
          <div style={{ height: 2, background: t.accent, margin: '20px 0 28px', opacity: 0.6 }} />
          {sections.map(s => (
            <div key={s.title} style={{ marginBottom: 26 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: t.accent, margin: '0 0 12px' }}>{s.title}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 32px' }}>
                {s.rows.filter(f => f.key !== 'name').map(f => (
                  <div key={f.key} style={{ marginBottom: 6 }}>
                    <p style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 1.5, color: t.muted, margin: '0 0 2px' }}>{f.label}</p>
                    <p style={{ fontSize: 14, margin: 0, fontWeight: 500 }}>{data[f.key]}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Watermark dark={false} />
      </div>
    );
  }

  // ── MIDNIGHT: dark luxury ───────────────────────────────────────
  return (
    <div ref={ref} style={{ width: 794, minHeight: 1123, background: t.bg, color: t.ink, position: 'relative', fontFamily: 'Georgia, serif' }}>
      <div style={{ position: 'absolute', inset: 18, border: '1px solid rgba(212,175,106,0.35)', pointerEvents: 'none' }} />
      <div style={{ padding: '64px 72px 90px' }}>
        <div style={{ textAlign: 'center', marginBottom: 34 }}>
          <p style={{ fontSize: 20, color: t.accent, margin: '0 0 10px' }}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
          <p style={{ fontSize: 11, letterSpacing: 5, textTransform: 'uppercase', color: t.muted, margin: '0 0 6px' }}>In the name of Allah</p>
          <h1 style={{ fontSize: 30, fontWeight: 400, letterSpacing: 10, color: t.accent, margin: 0 }}>BIODATA</h1>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
            <div style={{ width: 60, height: 1, background: 'rgba(212,175,106,0.4)' }} />
            <div style={{ width: 7, height: 7, transform: 'rotate(45deg)', background: t.accent }} />
            <div style={{ width: 60, height: 1, background: 'rgba(212,175,106,0.4)' }} />
          </div>
        </div>
        {photo && (
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <img src={photo} alt="" style={{ width: 150, height: 180, objectFit: 'cover', borderRadius: 4, border: `1px solid rgba(212,175,106,0.5)` }} />
          </div>
        )}
        {hasName && <p style={{ textAlign: 'center', fontSize: 26, margin: '0 0 28px', letterSpacing: 1 }}>{data.name}</p>}
        {sections.map(s => (
          <div key={s.title} style={{ marginBottom: 26 }}>
            <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: t.accent, margin: '0 0 12px', textAlign: 'center' }}>{s.title}</h2>
            {s.rows.filter(f => f.key !== 'name').map(f => (
              <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderBottom: '1px solid rgba(212,175,106,0.12)', fontSize: 13.5 }}>
                <span style={{ color: t.muted }}>{f.label}</span>
                <span style={{ textAlign: 'right', fontWeight: 500 }}>{data[f.key]}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <Watermark dark />
    </div>
  );
});
