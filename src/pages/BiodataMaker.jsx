import { useState, useRef, useEffect, forwardRef } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../layouts/LandingLayout';
import { usePageTitle } from '../lib/usePageTitle';
import { useAuth } from '../lib/auth/AuthContext';
import { Download, ImagePlus, Save, Sparkles, ZoomIn, ZoomOut, Maximize2, Upload, Share2 } from 'lucide-react';
import { http } from '../lib/api/transport';

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
    id: 'wilayat', name: 'Wilayat', desc: 'Ya Ali & Ya Fatima — light Shia elegance',
    bg: '#f8faf9', ink: '#1e2b26', accent: '#0e6b4f', muted: '#8aa39a',
  },
];

const LANGUAGES = [
  { code: 'en', name: 'English', rtl: false },
  { code: 'ur', name: 'Urdu (اردو)', rtl: true },
  { code: 'ar', name: 'Arabic (العربية)', rtl: true },
  { code: 'hi', name: 'Hindi (हिन्दी)', rtl: false },
  { code: 'fr', name: 'French (Français)', rtl: false },
  { code: 'es', name: 'Spanish (Español)', rtl: false },
];

// UI translations for the biodata document itself.
const I18N = {
  en: {
    biodata: 'Biodata',
    sections: { personal: 'Personal Details', family: 'Family Details', contact: 'Contact Details', partner: 'Partner Preference' },
    fields: {
      name: 'Name', dob: 'Date of Birth', age: 'Age', height: 'Height', complexion: 'Complexion',
      education: 'Education', profession: 'Profession', religion: 'Religion / Sect', marital: 'Marital Status',
      father: "Father's Name", fatherOcc: "Father's Occupation", mother: "Mother's Name",
      motherOcc: "Mother's Occupation", siblings: 'Siblings',
      contactPerson: 'Contact Person', phone: 'Phone', email: 'Email', address: 'Address',
      preference: 'Looking for',
    },
  },
  ur: {
    biodata: 'بائیو ڈیٹا',
    sections: { personal: 'ذاتی معلومات', family: 'خاندانی معلومات', contact: 'رابطے کی تفصیلات', partner: 'شریک حیات کی ترجیح' },
    fields: {
      name: 'نام', dob: 'تاریخ پیدائش', age: 'عمر', height: 'قد', complexion: 'رنگت',
      education: 'تعلیم', profession: 'پیشہ', religion: 'مذہب / مسلک', marital: 'ازدواجی حیثیت',
      father: 'والد کا نام', fatherOcc: 'والد کا پیشہ', mother: 'والدہ کا نام',
      motherOcc: 'والدہ کا پیشہ', siblings: 'بہن بھائی',
      contactPerson: 'رابطہ شخص', phone: 'فون', email: 'ای میل', address: 'پتہ',
      preference: 'تلاش',
    },
  },
  ar: {
    biodata: 'السيرة الذاتية للزواج',
    sections: { personal: 'البيانات الشخصية', family: 'بيانات العائلة', contact: 'بيانات الاتصال', partner: 'مواصفات شريك الحياة' },
    fields: {
      name: 'الاسم', dob: 'تاريخ الميلاد', age: 'العمر', height: 'الطول', complexion: 'البشرة',
      education: 'التعليم', profession: 'المهنة', religion: 'الدين / المذهب', marital: 'الحالة الاجتماعية',
      father: 'اسم الأب', fatherOcc: 'مهنة الأب', mother: 'اسم الأم',
      motherOcc: 'مهنة الأم', siblings: 'الإخوة والأخوات',
      contactPerson: 'جهة الاتصال', phone: 'الهاتف', email: 'البريد الإلكتروني', address: 'العنوان',
      preference: 'أبحث عن',
    },
  },
  hi: {
    biodata: 'बायोडाटा',
    sections: { personal: 'व्यक्तिगत विवरण', family: 'पारिवारिक विवरण', contact: 'संपर्क विवरण', partner: 'जीवनसाथी की प्राथमिकता' },
    fields: {
      name: 'नाम', dob: 'जन्म तिथि', age: 'आयु', height: 'ऊंचाई', complexion: 'रंग',
      education: 'शिक्षा', profession: 'पेशा', religion: 'धर्म / संप्रदाय', marital: 'वैवाहिक स्थिति',
      father: 'पिता का नाम', fatherOcc: 'पिता का पेशा', mother: 'माता का नाम',
      motherOcc: 'माता का पेशा', siblings: 'भाई-बहन',
      contactPerson: 'संपर्क व्यक्ति', phone: 'फोन', email: 'ईमेल', address: 'पता',
      preference: 'तलाश',
    },
  },
  fr: {
    biodata: 'Biodata de mariage',
    sections: { personal: 'Informations personnelles', family: 'Informations familiales', contact: 'Coordonnées', partner: 'Préférences du partenaire' },
    fields: {
      name: 'Nom', dob: 'Date de naissance', age: 'Âge', height: 'Taille', complexion: 'Teint',
      education: 'Éducation', profession: 'Profession', religion: 'Religion / Secte', marital: 'État civil',
      father: 'Nom du père', fatherOcc: 'Profession du père', mother: 'Nom de la mère',
      motherOcc: 'Profession de la mère', siblings: 'Frères et sœurs',
      contactPerson: 'Personne à contacter', phone: 'Téléphone', email: 'E-mail', address: 'Adresse',
      preference: 'Recherche',
    },
  },
  es: {
    biodata: 'Biodata matrimonial',
    sections: { personal: 'Datos personales', family: 'Datos familiares', contact: 'Datos de contacto', partner: 'Preferencia de pareja' },
    fields: {
      name: 'Nombre', dob: 'Fecha de nacimiento', age: 'Edad', height: 'Altura', complexion: 'Tez',
      education: 'Educación', profession: 'Profesión', religion: 'Religión / Secta', marital: 'Estado civil',
      father: 'Nombre del padre', fatherOcc: 'Ocupación del padre', mother: 'Nombre de la madre',
      motherOcc: 'Ocupación de la madre', siblings: 'Hermanos',
      contactPerson: 'Persona de contacto', phone: 'Teléfono', email: 'Correo electrónico', address: 'Dirección',
      preference: 'Busco',
    },
  },
};

const SECTIONS = [
  {
    key: 'personal',
    fields: [
      { key: 'name' }, { key: 'dob' }, { key: 'age' }, { key: 'height' },
      { key: 'education' }, { key: 'profession' },
      { key: 'religion' }, { key: 'marital' },
    ],
  },
  {
    key: 'family',
    fields: [
      { key: 'father' }, { key: 'fatherOcc' }, { key: 'mother' },
      { key: 'motherOcc' }, { key: 'siblings' },
    ],
  },
  {
    key: 'contact',
    fields: [
      { key: 'contactPerson' }, { key: 'phone' }, { key: 'email' }, { key: 'address' },
    ],
  },
  {
    key: 'partner',
    fields: [{ key: 'preference', type: 'textarea' }],
  },
];

const DRAFT_KEY = 'shiarishta_biodata_draft_v1';

export default function BiodataMaker() {
  usePageTitle('Marriage Biodata Maker');
  const { isLoggedIn } = useAuth();
  const [template, setTemplate] = useState('essential');
  const [lang, setLang] = useState('en');
  const [data, setData] = useState({ religion: 'Shia Muslim' });
  const [photo, setPhoto] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const previewRef = useRef(null);
  const fileRef = useRef(null);

  // ── Zoomable preview ──────────────────────────────────────────────
  // The biodata is a fixed 794px-wide document. On small screens it is
  // scaled to fit; the user can zoom in/out with controls. transform: scale
  // doesn't affect layout, so the wrapper gets explicit scaled dimensions.
  const PREVIEW_W = 794;
  const [zoomMode, setZoomMode] = useState('fit'); // 'fit' | 'custom'
  const [customZoom, setCustomZoom] = useState(1);
  const [wrapWidth, setWrapWidth] = useState(0);
  const [previewH, setPreviewH] = useState(1123);
  const wrapRef = useRef(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(es => setWrapWidth(es[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Measure the actual rendered preview height for the scaled wrapper.
  useEffect(() => {
    const node = previewRef.current;
    if (!node) return;
    const ro = new ResizeObserver(() => setPreviewH(node.offsetHeight || 1123));
    ro.observe(node);
    setPreviewH(node.offsetHeight || 1123);
    return () => ro.disconnect();
  }, [template, data, photo, lang]);

  const fitScale = wrapWidth > 0 ? Math.min(1, wrapWidth / PREVIEW_W) : 1;
  const scale = zoomMode === 'fit' ? fitScale : customZoom;
  const zoomPct = Math.round(scale * 100);

  const zoomIn = () => { setZoomMode('custom'); setCustomZoom(z => Math.min(2, +(z + 0.25).toFixed(2))); };
  const zoomOut = () => { setZoomMode('custom'); setCustomZoom(z => Math.max(0.25, +(z - 0.25).toFixed(2))); };
  const zoomFit = () => setZoomMode('fit');

  useEffect(() => {
    const load = async () => {
      // Server draft wins for logged-in users; guests use localStorage.
      if (isLoggedIn) {
        try {
          const r = await http.get('/api/biodata/draft');
          if (r && r.draft) {
            setData(r.draft.data || {});
            setTemplate(r.draft.template || 'essential');
            setPhoto(r.draft.photo || null);
            setLang(r.draft.lang || 'en');
            return;
          }
        } catch { /* fall through to local */ }
      }
      try {
        const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
        if (d) { setData(d.data || {}); setTemplate(d.template || 'essential'); setPhoto(d.photo || null); setLang(d.lang || 'en'); }
      } catch { /* ignore */ }
    };
    load();
  }, [isLoggedIn]);

  const set = (k, v) => { setData(d => ({ ...d, [k]: v })); setSaved(false); };

  const onPhoto = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { setPhoto(reader.result); setSaved(false); };
    reader.readAsDataURL(f);
  };

  const saveDraft = async () => {
    const payload = { data, template, photo, lang };
    // Always keep a local copy; logged-in users also get an encrypted
    // server copy so the draft follows them across devices.
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch { /* storage full */ }
    if (isLoggedIn) {
      setSaving(true);
      try {
        await http.post('/api/biodata/draft', payload);
      } catch { /* server save failed — local copy remains */ }
      setSaving(false);
    }
    setSaved(true);
  };

  // Render the biodata preview to a high-res canvas. Shared by image + PDF.
  const renderCanvas = async () => {
    const node = previewRef.current;
    if (!node) return null;
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
    return canvas;
  };

  const logCreation = async () => {
    // Log the creation to the admin audit trail (count + submitted details).
    // Fire-and-forget: the download must never wait on it. A downscaled
    // thumbnail of the photo is included so admins can see it in the logs.
    try {
      let photoThumb = null;
      if (photo) {
        photoThumb = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            try {
              const maxSide = 600;
              const r = Math.min(1, maxSide / Math.max(img.width, img.height));
              const c = document.createElement('canvas');
              c.width = Math.round(img.width * r);
              c.height = Math.round(img.height * r);
              c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
              resolve(c.toDataURL('image/jpeg', 0.8));
            } catch { resolve(null); }
          };
          img.onerror = () => resolve(null);
          img.src = photo;
        });
      }
      http.post('/api/biodata/log', {
        data, template, lang, has_photo: !!photo, photo_thumb: photoThumb,
      }).catch(() => {});
    } catch { /* ignore */ }
  };

  const shareBiodata = async () => {
    // Mobile: native share sheet (includes WhatsApp). Desktop: download + WhatsApp Web.
    const canvas = await renderCanvas();
    if (!canvas) return;
    const fileName = `${fileSlug()}.png`;
    try {
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      const file = new File([blob], fileName, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'My Biodata',
          text: 'My marriage biodata',
        });
        return;
      }
    } catch {
      // User cancelled or share failed — fall through to WhatsApp Web.
    }
    // Fallback: download the image and open WhatsApp with a prefilled note.
    const a = document.createElement('a');
    a.download = fileName;
    a.href = canvas.toDataURL('image/png');
    a.click();
    const text = encodeURIComponent('Assalamu alaikum! Sharing my biodata (attached).');
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener');
  };

  const downloadImage = async () => {
    logCreation();
    const canvas = await renderCanvas();
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = `${fileSlug()}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };

  const downloadPdf = async () => {
    logCreation();
    // Native print-to-PDF: zero bundle cost, perfect fidelity. We add a
    // print class that hides everything except the biodata card, trigger
    // the browser print dialog (user picks "Save as PDF"), then clean up.
    const node = previewRef.current;
    if (!node) return;
    // Ensure the preview is rendered at full size for print.
    const prevTransform = node.style.transform;
    node.style.transform = 'none';
    document.body.classList.add('printing-biodata');
    const cleanup = () => {
      document.body.classList.remove('printing-biodata');
      node.style.transform = prevTransform;
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    // Small delay so the print CSS applies before the dialog opens.
    await new Promise((r) => setTimeout(r, 100));
    window.print();
    // Fallback cleanup in case afterprint doesn't fire (e.g., dialog cancelled).
    setTimeout(cleanup, 5000);
  };

  const t = TEMPLATES.find(x => x.id === template) || TEMPLATES[0];

  return (
    <Layout>
      <style>{`
        @media print {
          body.printing-biodata * { visibility: hidden; }
          body.printing-biodata .biodata-print-area,
          body.printing-biodata .biodata-print-area * { visibility: visible; }
          body.printing-biodata .biodata-print-area {
            position: absolute; top: 0; left: 0; width: 100%;
            transform: none !important; margin: 0 !important;
          }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--color-ink)' }}>
            Marriage Biodata Maker
          </h1>
          <p className="text-sm max-w-xl mx-auto" style={{ color: 'var(--color-ink-secondary)' }}>
            Create a beautiful Shia marriage biodata in minutes — no account needed.
            Add a photo and details, pick a design, and download a polished biodata — free, with a discreet ShiaRishta credit.
          </p>
        </div>

        {/* Templates — grid on mobile (no truncation), row on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6 max-w-4xl mx-auto">
          {TEMPLATES.map(x => (
            <button key={x.id} onClick={() => { setTemplate(x.id); setSaved(false); }}
              aria-pressed={template === x.id}
              className="px-4 py-3 rounded-xl text-left transition-all w-full"
              style={{
                border: template === x.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: template === x.id ? 'var(--color-surface)' : 'var(--color-background)',
                boxShadow: template === x.id ? '0 2px 12px rgba(0,0,0,0.08)' : 'none',
              }}>
              <p className="text-sm font-bold" style={{ color: 'var(--color-ink)' }}>{x.name}</p>
              <p className="text-[11px] leading-snug mt-0.5" style={{ color: 'var(--color-ink-tertiary)' }}>{x.desc}</p>
            </button>
          ))}
        </div>

        {/* Language — stacked on mobile, inline on desktop */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 mb-8">
          <label htmlFor="biodata-lang" className="text-sm font-semibold" style={{ color: 'var(--color-ink-secondary)' }}>
            Biodata language:
          </label>
          <select
            id="biodata-lang"
            value={lang}
            onChange={e => { setLang(e.target.value); setSaved(false); }}
            className="input px-4 py-2.5 rounded-xl text-sm w-full sm:w-auto"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', minWidth: 180 }}
          >
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.name}</option>
            ))}
          </select>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Form */}
          <div className="space-y-6">
            <div className="card p-5">
              <h2 className="font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--color-ink)' }}>
                <ImagePlus className="w-4 h-4" /> Photo <span className="text-xs font-normal" style={{ color: 'var(--color-ink-tertiary)' }}>(optional)</span>
              </h2>
              <div className="flex items-center gap-4">
                {photo ? (
                  <img src={photo} alt="Biodata" className="w-20 h-24 object-cover rounded-lg" style={{ border: '1px solid var(--color-border)' }} />
                ) : (
                  <div className="w-20 h-24 rounded-lg flex items-center justify-center text-xs text-center px-1"
                    style={{ background: 'var(--color-canvas)', color: 'var(--color-ink-tertiary)', border: '1px dashed var(--color-border)' }}>
                    No photo
                  </div>
                )}
                <div className="flex-1">
                  <button onClick={() => fileRef.current?.click()}
                    className="btn btn-primary btn-sm flex items-center gap-2">
                    <Upload className="w-4 h-4" /> {photo ? 'Change photo' : 'Upload photo'}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
                  <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: 'var(--color-ink-tertiary)' }}>
                    Optional. Fits automatically into your biodata design.
                    {isLoggedIn ? ' Saved securely to your account.' : ' Stored only in this browser.'}
                  </p>
                  {photo && (
                    <button onClick={() => { setPhoto(null); setSaved(false); }}
                      className="text-[11px] mt-1 underline" style={{ color: 'var(--color-danger)' }}>
                      Remove photo
                    </button>
                  )}
                </div>
              </div>
            </div>

            {SECTIONS.map(s => (
              <div key={s.key} className="card p-5">
                <h2 className="font-bold mb-3" style={{ color: 'var(--color-ink)' }}>{I18N[lang].sections[s.key]}</h2>
                <div className="space-y-3">
                  {s.fields.map(f => (
                    <div key={f.key}>
                      <label htmlFor={`biodata-${f.key}`} className="text-xs font-semibold block mb-1" style={{ color: 'var(--color-ink-secondary)' }}>{I18N[lang].fields[f.key]}</label>
                      {f.type === 'textarea' ? (
                        <textarea id={`biodata-${f.key}`} value={data[f.key] || ''} onChange={e => set(f.key, e.target.value)} rows={2} className="input w-full text-sm" />
                      ) : (
                        <input id={`biodata-${f.key}`} value={data[f.key] || ''} onChange={e => set(f.key, e.target.value)} className="input w-full text-sm" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="flex gap-3 flex-wrap">
              <button onClick={saveDraft} disabled={saving} className="btn btn-ghost flex items-center gap-2">
                <Save className="w-4 h-4" /> {saving ? 'Saving…' : saved ? 'Draft saved ✓' : 'Save draft'}
              </button>
              <button onClick={downloadImage} className="btn btn-secondary flex items-center gap-2">
                <Download className="w-4 h-4" /> Save as Image
              </button>
              <button onClick={downloadPdf} className="btn btn-primary flex items-center gap-2">
                <Download className="w-4 h-4" /> Save as PDF
              </button>
              <button onClick={shareBiodata} className="btn btn-secondary flex items-center gap-2">
                <Share2 className="w-4 h-4" /> Share
              </button>
            </div>
            {isLoggedIn && (
              <p className="text-[11px] mt-2" style={{ color: 'var(--color-ink-tertiary)' }}>
                Drafts save securely to your account (encrypted) and sync across your devices.
              </p>
            )}
          </div>

          {/* Preview */}
          <div className="lg:sticky lg:top-4 self-start w-full min-w-0">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: 'var(--color-ink-tertiary)' }}>
                <Sparkles className="w-3.5 h-3.5" /> LIVE PREVIEW
              </p>
              <div className="flex items-center gap-1" role="toolbar" aria-label="Preview zoom">
                <button onClick={zoomOut} disabled={scale <= 0.25} aria-label="Zoom out"
                  className="btn btn-ghost btn-xs p-1.5">
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-semibold min-w-[44px] text-center" style={{ color: 'var(--color-ink-secondary)' }}>
                  {zoomPct}%
                </span>
                <button onClick={zoomIn} disabled={scale >= 2} aria-label="Zoom in"
                  className="btn btn-ghost btn-xs p-1.5">
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button onClick={zoomFit} aria-label="Fit to screen"
                  className={`btn btn-xs p-1.5 ${zoomMode === 'fit' ? 'btn-primary' : 'btn-ghost'}`}
                  title="Fit to screen">
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div ref={wrapRef} className="overflow-auto rounded-xl bg-white"
              style={{ border: '1px solid var(--color-border)', maxHeight: '82vh', touchAction: 'pan-x pan-y pinch-zoom' }}>
              <div style={{ width: Math.max(wrapWidth, PREVIEW_W * scale), display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: PREVIEW_W * scale, height: previewH * scale, position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: PREVIEW_W, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }} className="biodata-print-area">
                    <BiodataPreview ref={previewRef} template={t} data={data} photo={photo} lang={lang} />
                  </div>
                </div>
              </div>
            </div>
            <p className="text-[11px] mt-2 text-center" style={{ color: 'var(--color-ink-tertiary)' }}>
              Pinch or use the controls to zoom · preview fits your screen automatically
            </p>
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
  const gold = 'rgba(212,175,106,';
  return (
    <>
      {/* Single whisper-quiet footer credit — the only brand mark. No tiled
          pattern: a biodata is HER document, not our billboard. */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 48px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        pointerEvents: 'none', userSelect: 'none',
      }}>
        <span style={{
          fontSize: 9, letterSpacing: 2.5,
          color: dark ? `${gold}0.45)` : 'rgba(0,0,0,0.28)',
          fontFamily: 'Georgia, serif', fontStyle: 'italic', whiteSpace: 'nowrap',
        }}>
          Made with shiarishta.com
        </span>
      </div>
    </>
  );
}

// Forwarded ref so the download button can serialize this exact DOM.
const BiodataPreview = forwardRef(function BiodataPreview({ template: t, data, photo, lang = 'en' }, ref) {
  const dark = t.id === 'midnight';
  const hasName = !!data.name;
  const tr = I18N[lang] || I18N.en;
  const rtl = (LANGUAGES.find(l => l.code === lang)?.rtl) || false;
  const dir = rtl ? 'rtl' : 'ltr';

  const sections = SECTIONS.map(s => ({
    ...s,
    title: tr.sections[s.key],
    rows: s.fields.filter(f => data[f.key]).map(f => ({ ...f, label: tr.fields[f.key] })),
  })).filter(s => s.rows.length > 0);

  const bismillah = (
    <p style={{ fontSize: 20, margin: '0 0 6px', color: t.accent, fontFamily: 'Georgia, serif' }}>
      بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
    </p>
  );

  // ── ESSENTIAL: ultra-clean, minimal ──────────────────────────────
  if (t.id === 'essential') {
    return (
      <div ref={ref} dir={dir} style={{ width: 794, minHeight: 1123, background: t.bg, color: t.ink, padding: '64px 72px 90px', position: 'relative', fontFamily: '-apple-system, "Segoe UI", sans-serif' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          {bismillah}
          <h1 style={{ fontSize: 28, fontWeight: 300, letterSpacing: 8, textTransform: 'uppercase', margin: '8px 0 0', color: t.ink }}>{tr.biodata}</h1>
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
      <div ref={ref} dir={dir} style={{ width: 794, minHeight: 1123, background: t.bg, color: t.ink, position: 'relative', fontFamily: 'Georgia, serif' }}>
        <div style={{ height: 10, background: `linear-gradient(90deg, ${t.accent}, #1a7a52, ${t.accent})` }} />
        <div style={{ padding: '48px 64px 90px' }}>
          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            {bismillah}
            <div style={{ display: 'inline-block', border: `1px solid ${t.accent}`, padding: '10px 36px', marginTop: 8 }}>
              <h1 style={{ fontSize: 26, fontWeight: 400, letterSpacing: 6, margin: 0, color: t.accent }}>{tr.biodata}</h1>
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
      <div ref={ref} dir={dir} style={{ width: 794, minHeight: 1123, background: t.bg, color: t.ink, position: 'relative', fontFamily: 'Georgia, serif' }}>
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
  // ── WILAYAT: light Shia elegance — Ya Ali & Ya Fatima ──────────────────
  return (
    <div ref={ref} dir={dir} style={{ width: 794, minHeight: 1123, background: t.bg, color: t.ink, position: 'relative', fontFamily: 'Georgia, serif' }}>
      {/* Corner invocations */}
      <div style={{ position: 'absolute', top: 28, left: 36, textAlign: 'center', pointerEvents: 'none' }}>
        <p style={{ fontSize: 19, color: t.accent, margin: 0, fontWeight: 600 }}>یَا عَلِي</p>
        <p style={{ fontSize: 10, color: t.muted, margin: '2px 0 0', letterSpacing: 1 }}>Ya Ali (a.s.)</p>
      </div>
      <div style={{ position: 'absolute', top: 28, right: 36, textAlign: 'center', pointerEvents: 'none' }}>
        <p style={{ fontSize: 19, color: t.accent, margin: 0, fontWeight: 600 }}>یَا فَاطِمَة</p>
        <p style={{ fontSize: 10, color: t.muted, margin: '2px 0 0', letterSpacing: 1 }}>Ya Fatima (s.a.)</p>
      </div>
      {/* Soft double frame */}
      <div style={{ position: 'absolute', inset: 16, border: `1px solid ${t.accent}`, opacity: 0.35, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 22, border: `1px solid ${t.accent}`, opacity: 0.18, pointerEvents: 'none' }} />

      <div style={{ padding: '72px 72px 90px' }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <p style={{ fontSize: 21, color: t.accent, margin: '0 0 8px' }}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, marginTop: 6 }}>
            <div style={{ width: 44, height: 1, background: t.accent, opacity: 0.5 }} />
            <h1 style={{ fontSize: 27, fontWeight: 400, letterSpacing: 7, color: t.ink, margin: 0 }}>{tr.biodata}</h1>
            <div style={{ width: 44, height: 1, background: t.accent, opacity: 0.5 }} />
          </div>
          <p style={{ fontSize: 11, letterSpacing: 3, color: t.muted, margin: '10px 0 0', textTransform: 'uppercase' }}>
            In the name of Allah, the Most Gracious, the Most Merciful
          </p>
        </div>

        {photo && (
          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <img src={photo} alt="" style={{ width: 148, height: 178, objectFit: 'cover', borderRadius: 8, border: `2px solid ${t.accent}` }} />
          </div>
        )}
        {hasName && (
          <p style={{ textAlign: 'center', fontSize: 25, fontWeight: 600, margin: '0 0 6px', color: t.ink }}>{data.name}</p>
        )}
        {data.religion && (
          <p style={{ textAlign: 'center', fontSize: 12.5, letterSpacing: 2, color: t.muted, margin: '0 0 26px', textTransform: 'uppercase' }}>{data.religion}</p>
        )}

        {sections.map(s => (
          <div key={s.title} style={{ marginBottom: 24, background: '#ffffff', borderRadius: 10, padding: '18px 22px', border: '1px solid rgba(14,107,79,0.12)' }}>
            <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: t.accent, margin: '0 0 12px' }}>{s.title}</h2>
            {s.rows.filter(f => f.key !== 'name' && f.key !== 'religion').map(f => (
              <div key={f.key} style={{ display: 'flex', gap: 14, padding: '5px 0', fontSize: 13.5 }}>
                <span style={{ width: 150, flexShrink: 0, color: t.muted }}>{f.label}</span>
                <span style={{ fontWeight: 500 }}>{data[f.key]}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <Watermark dark={false} />
    </div>
  );
});
