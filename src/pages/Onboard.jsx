import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, ChevronLeft, Check, User, Moon, Landmark, GraduationCap,
  Heart, Shield, ClipboardCheck, Globe, KeyRound, Lock, UserRound,
  Sparkles, AlertCircle, Save, HeartHandshake, Camera, X, Loader2
} from 'lucide-react';
import Layout from '../layouts/MainLayout';
import { useAuth } from '../lib/auth/AuthContext';
import { api } from '../lib/api/client';
import { apiUrl } from '../lib/api/transport';
import { saveMyProfile } from '../lib/storage';
import {
  SECTS, MARJA_OPTIONS, RELIGIOSITY_LEVELS, PRAYER_OPTIONS,
  MODESTY_OPTIONS_FEMALE, MODESTY_OPTIONS_MALE, DIET_OPTIONS, SYED_OPTIONS,
  MARITAL_STATUS_OPTIONS, TIMELINE_OPTIONS, RELOCATION_OPTIONS,
  FAMILY_INVOLVEMENT_OPTIONS, CHILDREN_OPTIONS, CHILDREN_PLANS_OPTIONS,
  PHOTO_ACCESS_OPTIONS, PROFILE_VISIBILITY_OPTIONS, MANAGEMENT_MODES,
  EDUCATION_OPTIONS, LANGUAGES, ETHNICITIES, COUNTRIES, HEIGHT_OPTIONS,
  computeProfileCompleteness, ONBOARDING_STEPS
} from '../lib/onboardingData';

const DRAFT_KEY = 'shiarishta_onboarding_draft';

// The draft key follows the signed-in account, never the bare browser.
// Two members sharing one device must never see each other's answers.
function sessionUid() {
  try {
    const raw = localStorage.getItem('sh_session');
    const uid = raw ? JSON.parse(raw).uid : null;
    return uid || 'signed-out';
  } catch { return 'signed-out'; }
}
const scopedDraftKey = () => `${DRAFT_KEY}::${sessionUid()}`;

const EMPTY_FORM = {
  // Step 1 — About you
  displayName: '', gender: '', seekingGender: '', age: '', city: '', country: '', height: '', maritalStatus: '',
  // Step 2 — Faith & practice
  sect: '', religiosity: '', prayer: '', marja: '', modesty: '', diet: '',
  // Step 3 — Background & lineage
  syedStatus: '', ethnicity: '', languages: [], citizenships: [],
  // Step 4 — Education & career
  educationLevel: '', profession: '', incomeRange: '',
  // Step 5 — Marriage intentions
  timeline: '', relocation: '', familyInvolvement: '', childrenStatus: '', childrenPlans: '',
  // Step 6 — Privacy & photos
  photoAccess: 'match', profileVisibility: 'public', incognito: false, managementMode: '', guardianName: '', guardianEmail: '',
  // Step 7 — Story
  bio: '', lookingFor: ''
};

// ── Per-step validation — returns a map of field → error message ────────────
function validateStep(step, d) {
  const e = {};
  if (step === 1) {
    if (!d.displayName.trim() || d.displayName.trim().length < 2) e.displayName = 'Please enter your display name (min 2 characters).';
    if (!d.gender) e.gender = 'Please select how you identify.';
    if (!d.seekingGender) e.seekingGender = 'Please select who you are looking for.';
    const age = parseInt(d.age, 10);
    if (!d.age || Number.isNaN(age) || age < 18 || age > 100) e.age = 'Age must be between 18 and 100.';
    if (!d.city.trim()) e.city = 'City is required.';
    if (!d.country) e.country = 'Country is required.';
  }
  if (step === 2) {
    if (!d.sect) e.sect = 'Please select your sect / community.';
    if (!d.religiosity) e.religiosity = 'Please select your religiosity level.';
    if (!d.prayer) e.prayer = 'Please select your prayer practice.';
  }
  if (step === 3) {
    if (!d.ethnicity) e.ethnicity = 'Please select your ethnicity / heritage.';
    if (d.languages.length === 0) e.languages = 'Select at least one language you speak.';
  }
  if (step === 4) {
    if (!d.educationLevel) e.educationLevel = 'Please select your education level.';
    if (!d.profession.trim()) e.profession = 'Profession is required.';
  }
  if (step === 5) {
    if (!d.timeline) e.timeline = 'Please select your nikah timeline.';
    if (!d.familyInvolvement) e.familyInvolvement = 'Please select your family involvement preference.';
  }
  if (step === 6) {
    if (!d.managementMode) e.managementMode = 'Please choose who manages this profile.';
    if (d.managementMode === 'guardian') {
      if (!d.guardianName.trim()) e.guardianName = 'Guardian name is required.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.guardianEmail)) e.guardianEmail = 'Enter a valid guardian email.';
    }
  }
  if (step === 7) {
    if (d.bio.trim().length < 30) e.bio = 'Your bio should be at least 30 characters — introduce yourself sincerely.';
    if (d.lookingFor.trim().length < 20) e.lookingFor = 'Describe what you are looking for (at least 20 characters).';
  }
  return e;
}

// ── Reusable form primitives ────────────────────────────────────────────────
function Field({ label, error, required, children, hint }) {
  return (
    <div>
      <label className="text-sm font-semibold text-ink mb-1.5 block">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {hint && <p className="text-xs text-muted mb-2 -mt-0.5">{hint}</p>}
      {children}
      {error && (
        <p className="mt-1.5 text-xs text-danger flex items-center gap-1" role="alert">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

const inputCls = 'w-full px-4 py-3 rounded-xl border bg-elevated text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all';

function TextInput({ error, ariaLabel, ...props }) {
  return <input className={`${inputCls} ${error ? 'border-danger' : 'border-line/30'}`} aria-label={ariaLabel} {...props} />;
}

function SelectInput({ value, onChange, options, placeholder = 'Select', error, ariaLabel, ...props }) {
  return (
    <div className="relative">
      <select value={value} onChange={onChange} aria-invalid={!!error} aria-label={ariaLabel}
        className={`${inputCls} appearance-none pr-10 ${error ? 'border-danger' : 'border-line/30'}`} {...props}>
        <option value="">{placeholder}</option>
        {options.map(o => {
          const val = typeof o === 'string' ? o : o.value;
          const lbl = typeof o === 'string' ? o : o.label;
          return <option key={val} value={val}>{lbl}</option>;
        })}
      </select>
      <ChevronRight className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 rotate-90 text-muted pointer-events-none" />
    </div>
  );
}

// Single-select card row — premium radio alternative
function OptionCards({ value, onChange, options, columns = 2 }) {
  return (
    <div className={`grid gap-2.5 ${columns === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
      {options.map(opt => {
        const val = typeof opt === 'string' ? opt : opt.value;
        const lbl = typeof opt === 'string' ? opt : opt.label;
        const desc = typeof opt === 'string' ? '' : opt.desc;
        const active = value === val;
        return (
          <button key={val} type="button" onClick={() => onChange(val)} aria-pressed={active}
            className={`text-left p-3.5 rounded-xl border-2 transition-all duration-200 ${active
              ? 'border-primary bg-primary/5 shadow-[0_0_0_4px_var(--primary-subtle)]'
              : 'border-line/20 bg-elevated hover:border-line/50 hover:-translate-y-0.5'}`}>
            <span className="flex items-center justify-between gap-2">
              <span className={`text-sm font-semibold ${active ? 'text-primary' : 'text-ink'}`}>{lbl}</span>
              <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${active ? 'border-primary bg-primary' : 'border-line'}`}>
                {active && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />}
              </span>
            </span>
            {desc && <span className="block text-xs text-muted mt-1 leading-relaxed">{desc}</span>}
          </button>
        );
      })}
    </div>
  );
}

// Multi-select chip group
function ChipGroup({ values, onToggle, options }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const active = values.includes(opt);
        return (
          <button key={opt} type="button" onClick={() => onToggle(opt)} aria-pressed={active}
            className={`px-3.5 py-2 rounded-full text-xs font-semibold border-2 transition-all duration-150 ${active
              ? 'border-primary bg-primary text-white shadow-sm'
              : 'border-line/30 bg-elevated text-muted hover:border-primary/40 hover:text-ink'}`}>
            {active && <Check className="w-3 h-3 inline mr-1 -mt-0.5" strokeWidth={3} />}{opt}
          </button>
        );
      })}
    </div>
  );
}

// Accessible toggle switch
function Toggle({ checked, onChange, label, desc }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-4 p-4 rounded-xl border border-line/20 bg-elevated text-left hover:border-line/40 transition-all">
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {desc && <span className="block text-xs text-muted mt-0.5">{desc}</span>}
      </span>
      <span className={`h-6 w-11 rounded-full relative flex-shrink-0 transition-colors ${checked ? 'bg-primary' : 'bg-line/40'}`}>
        <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
          style={{ transform: checked ? 'translateX(1.25rem)' : 'translateX(0)' }} />
      </span>
    </button>
  );
}

// ── Main wizard ─────────────────────────────────────────────────────────────
const STEP_ICONS = [User, Moon, Landmark, GraduationCap, Heart, Shield, ClipboardCheck];

export default function Onboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [data, setData] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  // Role selection (member/guardian/matchmaker) — asked right after account
  // creation, before the profile steps. Defaults to member.
  const [role, setRole] = useState('member');
  const [roleChosen, setRoleChosen] = useState(false);
  const [roleSaving, setRoleSaving] = useState(false);

  const totalSteps = ONBOARDING_STEPS.length;

  // Restore an in-progress draft exactly where the member left off
  useEffect(() => {
    try {
      const raw = localStorage.getItem(scopedDraftKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        setData(prev => ({ ...prev, ...parsed.data, languages: parsed.data?.languages || [], citizenships: parsed.data?.citizenships || [] }));
        setStep(Math.min(Math.max(parsed.step || 1, 1), totalSteps));
        setDraftRestored(true);
      }
    } catch { /* corrupted draft — start fresh */ }
    setDraftReady(true);
  }, [totalSteps]);

  // Pre-fill from the server profile so republishing never wipes existing data
  // (e.g. a bio saved in Settings). Draft values take precedence when present.
  useEffect(() => {
    if (!draftReady) return;
    let cancelled = false;
    api.getProfile('me').then(p => {
      if (cancelled || !p || p.error) return;
      setData(prev => {
        // Only fill fields the wizard doesn't already have (from draft or user input)
        const filled = { ...prev };
        const map = {
          displayName: p.displayName, age: p.age, gender: p.gender, city: p.city,
          country: p.country, maritalStatus: p.maritalStatus, sect: p.sect,
          religiosity: p.religiosity, prayer: p.prayer, marja: p.marja,
          modesty: p.modesty, diet: p.diet, ethnicity: p.ethnicity,
          educationLevel: p.educationLevel, profession: p.profession,
          incomeRange: p.incomeRange, timeline: p.timeline, relocation: p.relocation,
          familyInvolvement: p.familyInvolvement, bio: p.bio, lookingFor: p.expectations,
        };
        for (const [k, v] of Object.entries(map)) {
          if ((filled[k] === '' || filled[k] == null) && v) filled[k] = v;
        }
        if (typeof p.languages === 'string' && p.languages && filled.languages.length === 0) {
          filled.languages = p.languages.split(',').map(s => s.trim()).filter(Boolean);
        }
        return filled;
      });
    }).catch(() => { /* no existing profile — start fresh */ });
    return () => { cancelled = true; };
  }, [draftReady]);

  // Autosave the draft on every change (post-restore only)
  useEffect(() => {
    if (!draftReady) return;
    try { localStorage.setItem(scopedDraftKey(), JSON.stringify({ data, step })); } catch { /* storage full — non-fatal */ }
  }, [data, step, draftReady]);

  const update = useCallback((field, value) => {
    setData(prev => ({ ...prev, [field]: value }));
    setErrors(prev => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }, []);

  const toggleIn = useCallback((field, val) => {
    setData(prev => ({
      ...prev,
      [field]: prev[field].includes(val) ? prev[field].filter(x => x !== val) : [...prev[field], val]
    }));
    setErrors(prev => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }, []);

  const completeness = useMemo(() => computeProfileCompleteness(data), [data]);

  const goNext = () => {
    const e = validateStep(step, data);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    if (step < totalSteps) { setStep(s => s + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else publish();
  };

  const goBack = () => {
    setErrors({});
    if (step > 1) { setStep(s => s - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  };

  const goTo = (id) => { // jump back only — moving forward requires validation
    if (id < step) { setErrors({}); setStep(id); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  };

  const publish = async () => {
    setPublishing(true);
    setPublishError('');
    try {
      // Map the wizard's form fields to the backend profile columns.
      // Previously this only wrote to localStorage, so onboarding answers
      // never reached the database and other members saw an empty profile.
      const heightMatch = /(\d+)\s*cm/i.exec(data.height || '');
      const payload = {
        displayName: data.displayName,
        age: data.age === '' ? null : parseInt(data.age, 10),
        gender: data.gender,
        seekingGender: data.seekingGender,
        city: data.city,
        country: data.country,
        heightCm: heightMatch ? parseInt(heightMatch[1], 10) : null,
        maritalStatus: data.maritalStatus,
        sect: data.sect,
        religiosity: data.religiosity,
        prayer: data.prayer,
        marja: data.marja,
        modesty: data.modesty,
        diet: data.diet,
        ethnicity: data.ethnicity,
        languages: Array.isArray(data.languages) ? data.languages.join(', ') : data.languages,
        educationLevel: data.educationLevel,
        profession: data.profession,
        incomeRange: data.incomeRange,
        timeline: data.timeline,
        relocation: data.relocation,
        familyInvolvement: data.familyInvolvement,
        children: data.childrenStatus,
        childrenPlans: data.childrenPlans,
        photosVisibility: data.photoAccess,
        visibility: data.profileVisibility,
        bio: data.bio,
        expectations: data.lookingFor,
        syedStatus: data.syedStatus,
      };
      const clean = {};
      for (const [k, v] of Object.entries(payload)) {
        if (v === '' || v === null || v === undefined) continue;
        if (Number.isNaN(v)) continue;
        clean[k] = v;
      }
      await api.updateProfile(user?.uid || 'me', clean);
      const profile = {
        ...data,
        age: parseInt(data.age, 10),
        uid: user?.uid || 'self',
        completeness,
        publishedAt: new Date().toISOString()
      };
      // Write the published profile to the member-scoped key that getMyProfile()
      // reads. A bare global key here is invisible to the dashboard and leaks
      // across accounts on shared devices.
      saveMyProfile(profile);
      try { localStorage.removeItem('shiarishta_my_profile'); } catch { /* legacy bare key */ }
      localStorage.removeItem(scopedDraftKey());
      navigate('/dashboard');
    } catch (e) {
      setPublishError(e?.message || 'Could not save your profile. Please try again.');
    } finally {
      setPublishing(false);
    }
  };

  const stepProps = { data, update, errors, toggleIn };

  // ── Role selection: shown once, right after account creation ──────────────
  const chooseRole = async (r) => {
    setRole(r);
    setRoleSaving(true);
    try {
      await api.post('/users/me/role', { role: r });
    } catch {
      // Non-fatal — the role defaults to member server-side; the user can
      // change it later in Settings.
    } finally {
      setRoleSaving(false);
      setRoleChosen(true);
    }
  };

  if (draftReady && !roleChosen && user?.role === 'member') {
    const options = [
      { v: 'member', icon: User, title: 'I\'m looking for myself', desc: 'Create your own marriage profile' },
      { v: 'guardian', icon: Shield, title: 'I\'m a parent / guardian', desc: 'Managing a profile for my child or ward' },
      { v: 'matchmaker', icon: HeartHandshake, title: 'I\'m a matchmaker', desc: 'I help families find rishtas (female profiles only)' },
    ];
    return (
      <Layout>
        <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-ink">Who is this account for?</h1>
            <p className="text-sm text-muted mt-2">You can change this later in Settings.</p>
          </div>
          <div className="space-y-3">
            {options.map(o => (
              <button
                key={o.v}
                onClick={() => chooseRole(o.v)}
                disabled={roleSaving}
                className="w-full flex items-center gap-4 p-5 rounded-2xl border text-left transition-all hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-elevated)' }}
              >
                <span className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>
                  <o.icon className="w-6 h-6" />
                </span>
                <span>
                  <span className="block font-semibold text-ink">{o.title}</span>
                  <span className="block text-sm text-muted mt-0.5">{o.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </main>
      </Layout>
    );
  }

  return (
    <Layout>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary mb-2">
            <Sparkles className="w-3.5 h-3.5" /> Profile setup
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-ink">Build a profile that truly represents you</h1>
              <p className="text-sm text-muted mt-1">Step {step} of {totalSteps} — {ONBOARDING_STEPS[step - 1].subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
              {draftRestored && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-full">
                  <Save className="w-3 h-3" /> Draft restored
                </span>
              )}
              <CompletenessRing value={completeness} />
            </div>
          </div>
          {/* Mobile progress bar */}
          <div className="lg:hidden mt-4 h-1.5 rounded-full bg-line/20 overflow-hidden">
            <motion.div className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
              initial={false} animate={{ width: `${(step / totalSteps) * 100}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
          </div>
        </div>

        <div className="grid lg:grid-cols-[240px_1fr] gap-8">
          {/* Desktop step rail */}
          <aside>
            <div className="hidden lg:block sticky top-24 space-y-1">
              {ONBOARDING_STEPS.map(s => {
                const Icon = STEP_ICONS[s.id - 1];
                const done = s.id < step;
                const active = s.id === step;
                return (
                  <button key={s.id} onClick={() => goTo(s.id)} disabled={s.id > step}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${active ? 'bg-primary/10 ring-1 ring-primary/20' : done ? 'hover:bg-paper-dark cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}>
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${active ? 'bg-primary text-white' : done ? 'bg-success/15 text-success' : 'bg-line/20 text-muted'}`}>
                      {done ? <Check className="w-4 h-4" strokeWidth={3} /> : <Icon className="w-4 h-4" />}
                    </span>
                    <span>
                      <span className={`block text-sm font-semibold ${active ? 'text-primary' : done ? 'text-ink' : 'text-muted'}`}>{s.title}</span>
                      <span className="block text-[11px] text-muted">{s.subtitle}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Step card */}
          <div>
            <div className="bg-elevated rounded-2xl border border-line/20 shadow-sm p-6 sm:p-8 min-h-[420px]">
              <AnimatePresence mode="wait">
                <motion.div key={step}
                  initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}>
                  {step === 1 && <StepAbout {...stepProps} />}
                  {step === 2 && <StepFaith {...stepProps} />}
                  {step === 3 && <StepLineage {...stepProps} />}
                  {step === 4 && <StepCareer {...stepProps} />}
                  {step === 5 && <StepIntentions {...stepProps} />}
                  {step === 6 && <StepPrivacy {...stepProps} />}
                  {step === 7 && <StepReview data={data} goTo={goTo} update={update} errors={errors} />}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between mt-6">
              <button onClick={goBack} disabled={step === 1}
                className="flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink disabled:opacity-0 transition-all px-2 py-2">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline text-xs text-muted">Progress autosaves automatically</span>
                {publishError && (
                  <span className="text-xs font-medium" style={{ color: 'var(--color-danger)' }}>{publishError}</span>
                )}
                <button onClick={goNext} disabled={publishing} className="button primary px-7 py-3 font-semibold flex items-center gap-2 disabled:opacity-70">
                  {publishing ? (
                    <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Publishing…</>
                  ) : step === totalSteps ? (
                    <><Check className="w-4 h-4" /> Publish profile</>
                  ) : (
                    <>Continue <ChevronRight className="w-4 h-4" /></>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}

// Circular completeness indicator
function CompletenessRing({ value }) {
  return (
    <div className="relative w-14 h-14" role="status" aria-label={`Profile ${value}% complete`}>
      <div className="w-full h-full rounded-full"
        style={{ background: `conic-gradient(var(--primary) ${value * 3.6}deg, var(--border-subtle) 0deg)` }} />
      <div className="absolute inset-[3px] rounded-full bg-elevated flex items-center justify-center">
        <span className="text-xs font-bold text-ink">{value}%</span>
      </div>
    </div>
  );
}

// ── Step 1: About you ───────────────────────────────────────────────────────
function StepAbout({ data, update, errors }) {
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-ink">The essentials</h2>
      <Field label="Display name" required error={errors.displayName} hint="What other members see — first name & initial is common, e.g. 'Zainab H.'">
        <TextInput value={data.displayName} onChange={e => update('displayName', e.target.value)} placeholder="Your display name" ariaLabel="Display name" error={errors.displayName} maxLength={40} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="I am a" required error={errors.gender}>
          <SelectInput value={data.gender} onChange={e => { update('gender', e.target.value); if (data.modesty) update('modesty', ''); }} error={errors.gender} placeholder="Select" options={[{ value: 'female', label: 'Woman' }, { value: 'male', label: 'Man' }]} ariaLabel="Gender" />
        </Field>
        <Field label="Looking for a" required error={errors.seekingGender}>
          <SelectInput value={data.seekingGender} onChange={e => update('seekingGender', e.target.value)} error={errors.seekingGender} placeholder="Select" options={[{ value: 'female', label: 'Woman' }, { value: 'male', label: 'Man' }]} ariaLabel="Looking for" />
        </Field>
        <Field label="Age" required error={errors.age}>
          <TextInput type="number" min="18" max="100" value={data.age} onChange={e => update('age', e.target.value)} placeholder="e.g. 27" ariaLabel="Age" error={errors.age} />
        </Field>
        <Field label="Height">
          <SelectInput value={data.height} onChange={e => update('height', e.target.value)} options={HEIGHT_OPTIONS} placeholder="Optional" ariaLabel="Height" />
        </Field>
        <Field label="City" required error={errors.city}>
          <TextInput value={data.city} onChange={e => update('city', e.target.value)} placeholder="e.g. Chicago" ariaLabel="City" error={errors.city} />
        </Field>
        <Field label="Country" required error={errors.country}>
          <SelectInput value={data.country} onChange={e => update('country', e.target.value)} options={COUNTRIES} error={errors.country} ariaLabel="Country" />
        </Field>
      </div>
      <Field label="Marital status">
        <SelectInput value={data.maritalStatus} onChange={e => update('maritalStatus', e.target.value)} options={MARITAL_STATUS_OPTIONS} placeholder="Select" ariaLabel="Marital status" />
      </Field>
    </div>
  );
}

// ── Step 2: Faith & practice ────────────────────────────────────────────────
function StepFaith({ data, update, errors }) {
  const modestyOptions = data.gender === 'male' ? MODESTY_OPTIONS_MALE : MODESTY_OPTIONS_FEMALE;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-ink">Your deen, your way</h2>
        <p className="text-sm text-muted mt-1">These answers power faithful, like-for-like matching — answer with honesty, not aspiration.</p>
      </div>
        <Field label="Sect / community" required error={errors.sect}>
          <SelectInput value={data.sect} onChange={e => update('sect', e.target.value)} options={SECTS} error={errors.sect} ariaLabel="Sect" />
        </Field>
      <Field label="Religiosity" required error={errors.religiosity}>
        <OptionCards value={data.religiosity} onChange={v => update('religiosity', v)} options={RELIGIOSITY_LEVELS} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Daily prayers" required error={errors.prayer}>
          <SelectInput value={data.prayer} onChange={e => update('prayer', e.target.value)} options={PRAYER_OPTIONS} error={errors.prayer} ariaLabel="Daily prayers" />
        </Field>
        <Field label="Marja' followed" hint="The scholar you do taqleed of, if any">
          <SelectInput value={data.marja} onChange={e => update('marja', e.target.value)} options={MARJA_OPTIONS} placeholder="Select / not yet" ariaLabel="Marja followed" />
        </Field>
        <Field label={data.gender === 'male' ? 'Modesty practice' : 'Hijab & modesty'}>
          <SelectInput value={data.modesty} onChange={e => update('modesty', e.target.value)} options={modestyOptions} placeholder="Optional" ariaLabel="Modesty practice" />
        </Field>
        <Field label="Dietary practice">
          <SelectInput value={data.diet} onChange={e => update('diet', e.target.value)} options={DIET_OPTIONS} placeholder="Optional" ariaLabel="Dietary practice" />
        </Field>
      </div>
    </div>
  );
}

// ── Step 3: Background & lineage ────────────────────────────────────────────
function StepLineage({ data, update, errors, toggleIn }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-ink">Heritage & identity</h2>
        <p className="text-sm text-muted mt-1">Family background matters in our community — share what you're comfortable with.</p>
      </div>
      <Field label="Syed / Sadat status" hint="Lineage status — many families consider this in matchmaking">
        <OptionCards value={data.syedStatus} onChange={v => update('syedStatus', v)} options={SYED_OPTIONS} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Ethnicity / heritage" required error={errors.ethnicity}>
          <SelectInput value={data.ethnicity} onChange={e => update('ethnicity', e.target.value)} options={ETHNICITIES} error={errors.ethnicity} ariaLabel="Ethnicity" />
        </Field>
        <Field label="Citizenships" hint="Select all that apply — dual citizens welcome">
          <CitizenshipPicker values={data.citizenships} onToggle={v => toggleIn('citizenships', v)} />
        </Field>
      </div>
      <Field label="Languages you speak" required error={errors.languages}>
        <ChipGroup values={data.languages} onToggle={v => toggleIn('languages', v)} options={LANGUAGES} ariaLabel="Languages" />
      </Field>
    </div>
  );
}

// Compact dual-citizenship picker with selected-state chips
function CitizenshipPicker({ values, onToggle }) {
  return (
    <div>
      <div className="flex flex-wrap gap-2 min-h-[3.25rem] p-2 rounded-xl border border-line/30 bg-elevated">
        {values.length === 0 && <span className="text-xs text-muted self-center px-2">Tap a country below to add…</span>}
        {values.map(c => (
          <button key={c} type="button" onClick={() => onToggle(c)} aria-label={`Remove ${c}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold">
            {c} <span aria-hidden>×</span>
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
        {COUNTRIES.map(c => (
          <button key={c} type="button" onClick={() => onToggle(c)} aria-pressed={values.includes(c)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${values.includes(c) ? 'bg-primary text-white border-primary' : 'border-line/30 text-muted hover:border-primary/40'}`}>
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Step 4: Education & career ──────────────────────────────────────────────
function StepCareer({ data, update, errors }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink">Work & study</h2>
        <p className="text-sm text-muted mt-1">Stability and ambition are attractive — share your path.</p>
      </div>
      <Field label="Education" required error={errors.educationLevel}>
        <SelectInput value={data.educationLevel} onChange={e => update('educationLevel', e.target.value)} options={EDUCATION_OPTIONS} error={errors.educationLevel} ariaLabel="Education" />
      </Field>
      <Field label="Profession" required error={errors.profession} hint="What you do — 'Student', 'Software Engineer', 'Homemaker' all welcome">
          <TextInput value={data.profession} onChange={e => update('profession', e.target.value)} placeholder="Your profession or field of study" ariaLabel="Profession" error={errors.profession} maxLength={60} />
      </Field>
      <Field label="Income range" hint="Optional — some families ask, others prefer it stays private. You control visibility.">
          <SelectInput value={data.incomeRange} onChange={e => update('incomeRange', e.target.value)}
           options={['Prefer not to say', 'Under $40k', '$40k – $75k', '$75k – $120k', '$120k – $200k', '$200k+']}
           placeholder="Optional" ariaLabel="Income range" />
      </Field>
    </div>
  );
}

// ── Step 5: Marriage intentions ─────────────────────────────────────────────
function StepIntentions({ data, update, errors }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-ink">Timeline & family</h2>
        <p className="text-sm text-muted mt-1">Aligned timelines prevent heartbreak — be clear about where you stand.</p>
      </div>
      <Field label="Nikah timeline" required error={errors.timeline}>
        <OptionCards value={data.timeline} onChange={v => update('timeline', v)} options={TIMELINE_OPTIONS} />
      </Field>
      <Field label="Relocation openness">
        <OptionCards value={data.relocation} onChange={v => update('relocation', v)} options={RELOCATION_OPTIONS} />
      </Field>
      <Field label="Family involvement" required error={errors.familyInvolvement}>
        <OptionCards value={data.familyInvolvement} onChange={v => update('familyInvolvement', v)} options={FAMILY_INVOLVEMENT_OPTIONS} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Current children status">
          <SelectInput value={data.childrenStatus} onChange={e => update('childrenStatus', e.target.value)} options={CHILDREN_OPTIONS} placeholder="Select" ariaLabel="Children status" />
        </Field>
        <Field label="Views on children">
          <SelectInput value={data.childrenPlans} onChange={e => update('childrenPlans', e.target.value)} options={CHILDREN_PLANS_OPTIONS} placeholder="Select" ariaLabel="Views on children" />
        </Field>
      </div>
    </div>
  );
}

// ── Step 6 photo upload ──────────────────────────────────────────────────────
// M5 fix: onboarding had NO way to add a photo — "Privacy & photos" was
// visibility settings only. Uploads via POST /api/profiles/me/photo (the same
// endpoint Settings uses) so the photo exists before publish. Optional: the
// member can skip it and add one later from Settings.
function StepPhotoUpload() {
  const [photo, setPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  // Returning member re-doing onboarding: show the photo they already have.
  useEffect(() => {
    api.getProfile('me').then(me => {
      if (me?.photo) setPhoto(me.photo);
    }).catch(() => {});
  }, []);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const res = await api.uploadPhoto(file);
      // Verify persistence before showing the photo: the backend returns the
      // photo path on success; re-fetch to confirm it stuck.
      const saved = res?.photo || (await api.getProfile('me').catch(() => null))?.photo || null;
      if (saved) {
        setPhoto(saved);
      } else {
        setError('The upload reached the server but the photo did not save. Please try again.');
      }
    } catch (err) {
      setError(err?.message || 'Could not upload that photo.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async () => {
    setError('');
    try {
      await api.deletePhoto();
      setPhoto(null);
    } catch (err) {
      setError(err?.message || 'Could not remove the photo.');
    }
  };

  return (
    <Field label="Your photo" hint="Optional — add one now or later from Settings. It follows the visibility rules you pick below.">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} aria-label="Upload a profile photo" />
      {photo ? (
        <div className="flex items-center gap-4">
          <img src={apiUrl(photo)} alt="Your profile photo" className="w-20 h-20 rounded-xl object-cover"
            style={{ border: '1px solid var(--color-border)' }} />
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="btn btn-secondary btn-sm">Change</button>
            <button type="button" onClick={remove} disabled={uploading} className="btn btn-ghost btn-sm">Remove</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="w-full flex items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed transition-all disabled:opacity-60"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
          <span className="text-sm font-medium">{uploading ? 'Uploading…' : 'Upload a photo'}</span>
        </button>
      )}
      {error && <p className="mt-2 text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>}
    </Field>
  );
}

// ── Step 6: Privacy & photos — the platform's signature control ─────────────
const PHOTO_ICONS = { globe: Globe, key: KeyRound, lock: Lock };

function StepPrivacy({ data, update, errors }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-ink">You control everything</h2>
        <p className="text-sm text-muted mt-1">Privacy is a right, not a premium feature. These settings can be changed anytime.</p>
      </div>

      <StepPhotoUpload />

      <Field label="Photo visibility" hint="Your photos, your rules — you decide who can open them, and you can change this any time.">
        <div className="grid gap-2.5">
          {PHOTO_ACCESS_OPTIONS.map(opt => {
            const Icon = PHOTO_ICONS[opt.icon];
            const active = data.photoAccess === opt.value;
            return (
              <button key={opt.value} type="button" onClick={() => update('photoAccess', opt.value)} aria-pressed={active}
                className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all duration-200 ${active
                  ? 'border-primary bg-primary/5 shadow-[0_0_0_4px_var(--primary-subtle)]'
                  : 'border-line/20 bg-elevated hover:border-line/50'}`}>
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${active ? 'bg-primary text-white' : 'bg-line/15 text-muted'}`}>
                  <Icon className="w-4 h-4" />
                </span>
                <span className="flex-1">
                  <span className={`block text-sm font-semibold ${active ? 'text-primary' : 'text-ink'}`}>{opt.label}</span>
                  <span className="block text-xs text-muted mt-0.5">{opt.desc}</span>
                </span>
                {active && <Check className="w-5 h-5 text-primary flex-shrink-0" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Profile visibility">
        <OptionCards value={data.profileVisibility} onChange={v => update('profileVisibility', v)} options={PROFILE_VISIBILITY_OPTIONS} />
      </Field>

      <Toggle checked={data.incognito} onChange={v => update('incognito', v)}
        label="Discreet browsing (Incognito)"
        desc="View profiles without appearing in anyone's visitor list or online status." />

      <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/15 flex items-start gap-2.5">
        <Lock className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted leading-relaxed">
          <strong className="text-ink font-semibold">You stay in control:</strong> photos stay blurred until you choose to reveal them, and you can hide them again at any time from Settings.
        </p>
      </div>

      <Field label="Profile management" required error={errors.managementMode}>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {MANAGEMENT_MODES.map(mode => {
            const Icon = mode.value === 'self' ? UserRound : Shield;
            const active = data.managementMode === mode.value;
            return (
              <button key={mode.value} type="button" onClick={() => update('managementMode', mode.value)} aria-pressed={active}
                className={`p-4 rounded-xl border-2 text-left transition-all duration-200 ${active
                  ? 'border-primary bg-primary/5 shadow-[0_0_0_4px_var(--primary-subtle)]'
                  : 'border-line/20 bg-elevated hover:border-line/50'}`}>
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${active ? 'bg-primary text-white' : 'bg-line/15 text-muted'}`}>
                  <Icon className="w-4 h-4" />
                </span>
                <span className={`block text-sm font-semibold ${active ? 'text-primary' : 'text-ink'}`}>{mode.label}</span>
                <span className="block text-xs text-muted mt-0.5">{mode.desc}</span>
              </button>
            );
          })}
        </div>
      </Field>

      <AnimatePresence>
        {data.managementMode === 'guardian' && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <Field label="Guardian's name" required error={errors.guardianName}>
                <TextInput value={data.guardianName} onChange={e => update('guardianName', e.target.value)} placeholder="e.g. Muhammad H. (father)" error={errors.guardianName} ariaLabel="Guardian's name" />
              </Field>
              <Field label="Guardian's email" required error={errors.guardianEmail} hint="They'll receive a secure invite to co-manage">
                <TextInput type="email" value={data.guardianEmail} onChange={e => update('guardianEmail', e.target.value)} placeholder="guardian@email.com" error={errors.guardianEmail} ariaLabel="Guardian's email" />
              </Field>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Step 7: Review & publish ────────────────────────────────────────────────
const REVIEW_SECTIONS = [
  { step: 1, title: 'About you', fields: [['displayName', 'Name'], ['gender', 'I am a'], ['seekingGender', 'Seeking'], ['age', 'Age'], ['city', 'City'], ['country', 'Country'], ['maritalStatus', 'Marital status']] },
  { step: 2, title: 'Faith & practice', fields: [['sect', 'Sect'], ['religiosity', 'Religiosity'], ['prayer', 'Prayers'], ['marja', "Marja'"], ['modesty', 'Modesty'], ['diet', 'Diet']] },
  { step: 3, title: 'Background & lineage', fields: [['syedStatus', 'Syed status'], ['ethnicity', 'Ethnicity'], ['citizenships', 'Citizenships'], ['languages', 'Languages']] },
  { step: 4, title: 'Education & career', fields: [['educationLevel', 'Education'], ['profession', 'Profession'], ['incomeRange', 'Income']] },
  { step: 5, title: 'Marriage intentions', fields: [['timeline', 'Timeline'], ['relocation', 'Relocation'], ['familyInvolvement', 'Family involvement'], ['childrenStatus', 'Children'], ['childrenPlans', 'Views on children']] },
  { step: 6, title: 'Privacy & management', fields: [['photoAccess', 'Photo visibility'], ['profileVisibility', 'Profile visibility'], ['managementMode', 'Managed by']] }
];

const FIELD_LABELS = {
  female: 'Woman', male: 'Man',
  'sadat-both': 'Syed — both sides', 'syed-paternal': 'Syed — paternal', 'non-syed': 'No', prefer: 'Private',
  'very-practicing': 'Very practicing', practicing: 'Practicing', moderately: 'Moderately practicing', learning: 'Reconnecting', cultural: 'Culturally connected',
  now: 'Ready for nikah now', '6m': 'Within 6 months', '1y': 'Within 6–12 months', '2y': 'Within 1–2 years', exploring: 'Exploring openly',
  anywhere: 'Anywhere', 'same-country': 'Same country', 'same-city': 'Same city', discuss: 'Open to discuss',
  'from-start': 'From the start', 'after-match': 'After compatibility', 'wali-required': 'Wali in all talks', 'couple-first': 'Couple first',
  public: 'All members', request: 'Request only', match: 'Blurred until match',
  discoverable: 'Discoverable', limited: 'Limited', hidden: 'Incognito',
  self: 'Self-managed', guardian: 'Guardian-managed',
  'Prefer not to say': 'Private'
};

function fmt(field, value) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (!value) return '—';
  return FIELD_LABELS[value] || value;
}

function StepReview({ data, goTo, update, errors }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-ink">Final check</h2>
        <p className="text-sm text-muted mt-1">Review everything, then publish. Tap "Edit" on any section to jump back.</p>
      </div>

      {REVIEW_SECTIONS.map(section => (
        <div key={section.step} className="rounded-xl border border-line/20 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-primary/5 border-b border-line/15">
            <h3 className="text-sm font-bold text-ink">{section.title}</h3>
            <button onClick={() => goTo(section.step)} className="text-xs font-semibold text-primary hover:underline">Edit</button>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 p-4">
            {section.fields.map(([key, label]) => (
              <div key={key} className="flex items-baseline justify-between gap-3 py-1 border-b border-line/10 last:border-0">
                <dt className="text-xs text-muted flex-shrink-0">{label}</dt>
                <dd className="text-xs font-semibold text-ink text-right truncate">{fmt(key, data[key])}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      <Field label="About you" required error={errors.bio} hint={`${data.bio.trim().length}/30 characters minimum`}>
        <textarea rows={4} value={data.bio} onChange={e => update('bio', e.target.value)}
          placeholder="Tell others about yourself, your values, and what a peaceful home looks like to you…"
          className={`${inputCls} resize-none ${errors.bio ? 'border-danger' : 'border-line/30'}`} maxLength={1200} aria-label="About you" />
      </Field>
      <Field label="What you're looking for" required error={errors.lookingFor} hint={`${data.lookingFor.trim().length}/20 characters minimum`}>
        <textarea rows={3} value={data.lookingFor} onChange={e => update('lookingFor', e.target.value)}
          placeholder="Describe the partner and marriage you're hoping for…"
          className={`${inputCls} resize-none ${errors.lookingFor ? 'border-danger' : 'border-line/30'}`} maxLength={800} aria-label="What you are looking for" />
      </Field>

      <div className="p-3.5 rounded-xl bg-success/5 border border-success/15 flex items-start gap-2.5">
        <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted leading-relaxed">
          By publishing you confirm your details are truthful. Profiles are reviewed for community safety — misrepresentation may result in removal. Your <strong className="text-ink">photo and contact details stay protected</strong> under the privacy settings above.
        </p>
      </div>
    </div>
  );
}








