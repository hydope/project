import { useState, useRef, useEffect, forwardRef } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../layouts/LandingLayout';
import { usePageTitle } from '../lib/usePageTitle';
import { Download, ImagePlus, Save, Sparkles } from 'lucide-react';

const TEMPLATES = [
  { id: 'gold', name: 'Royal Gold', desc: 'Classic gold border, Bismillah header', bg: '#ffffff', accent: '#b8860b', border: 'gold' },
  { id: 'maroon', name: 'Maroon Elegance', desc: 'Deep maroon with traditional border', bg: '#ffffff', accent: '#7b1e1e', border: 'maroon' },
  { id: 'rose', name: 'Blush Rose', desc: 'Soft rose, modern layout with photo', bg: '#c9a0a0', accent: '#ffffff', border: 'none' },
  { id: 'ink', name: 'Classic Ink', desc: 'Timeless black double border', bg: '#fdfdf8', accent: '#1a1a1a', border: 'ink' },
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

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 5, fontSize: 13, lineHeight: 1.5 }}>
      <span style={{ width: 150, flexShrink: 0, fontWeight: 600 }}>{label}</span>
      <span style={{ flexShrink: 0 }}>:</span>
      <span>{value}</span>
    </div>
  );
}

// Forwarded ref so the download button can serialize this exact DOM.
const BiodataPreview = forwardRef(function BiodataPreview({ template: t, data, photo }, ref) {
  const borderStyle =
    t.border === 'gold' ? { border: '6px double #b8860b', outline: '2px solid #b8860b', outlineOffset: 6 } :
    t.border === 'maroon' ? { border: '10px solid transparent', borderImage: 'repeating-linear-gradient(45deg, #7b1e1e, #7b1e1e 8px, #d4a017 8px, #d4a017 12px) 10' } :
    t.border === 'ink' ? { border: '3px solid #1a1a1a', outline: '1px solid #1a1a1a', outlineOffset: 4 } :
    {};
  const dark = t.id === 'rose';

  return (
    <div ref={ref} style={{ width: 794, minHeight: 1123, background: t.bg, color: dark ? '#fff' : '#1a1a1a', padding: 48, position: 'relative', ...borderStyle, fontFamily: 'Georgia, serif' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <p style={{ fontSize: 22, marginBottom: 4, color: dark ? '#fff' : t.accent }}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
        <h1 style={{ fontSize: 34, fontWeight: 'bold', letterSpacing: 2, color: dark ? '#fff' : t.accent }}>Biodata</h1>
      </div>

      {photo && (
        <img src={photo} alt="" style={{ width: 150, height: 180, objectFit: 'cover', float: 'right', marginLeft: 20, marginBottom: 16, border: `3px solid ${dark ? '#fff' : t.accent}` }} />
      )}

      {SECTIONS.map(s => {
        const rows = s.fields.filter(f => data[f.key]);
        if (!rows.length) return null;
        return (
          <div key={s.title} style={{ marginBottom: 22, clear: 'both' }}>
            <h2 style={{ fontSize: 15, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, color: dark ? '#fff' : t.accent, borderBottom: `2px solid ${dark ? '#fff' : t.accent}`, paddingBottom: 4, marginBottom: 10, display: 'inline-block' }}>
              {s.title}
            </h2>
            {rows.map(f => <Row key={f.key} label={f.label} value={data[f.key]} />)}
          </div>
        );
      })}

      {/* Watermark */}
      <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center', fontSize: 12, letterSpacing: 1, opacity: 0.55, color: dark ? '#fff' : '#888' }}>
        Made with ♥ on shiarishta.com
      </div>
    </div>
  );
});
