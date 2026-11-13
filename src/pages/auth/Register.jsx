import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthContext';
import { analytics } from '../../lib/analytics';
import { useRemote } from '../../lib/api/transport';
import { Eye, EyeOff, Mail, Lock, User, Sparkles, X } from 'lucide-react';
import SocialLogin from '../../components/SocialLogin';

// ── In-progress signup draft (2026-11-13 fix) ─────────────────────────────
// A reload used to wipe the whole form and force a full retype. The four
// non-secret fields are kept in sessionStorage — session-scoped on purpose:
// the draft dies with the tab and never outlives the browsing session.
// Passwords are NEVER written to storage, in any form.
const DRAFT_KEY = 'sr-register-draft';

function loadDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object') return null;
    // Whitelist: restore only the four non-secret fields, whatever was saved.
    return {
      displayName: typeof d.displayName === 'string' ? d.displayName : '',
      email: typeof d.email === 'string' ? d.email : '',
      sect: typeof d.sect === 'string' ? d.sect : '',
      dateOfBirth: typeof d.dateOfBirth === 'string' ? d.dateOfBirth : '',
    };
  } catch {
    return null;
  }
}

function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ }
}

// ── Segmented date-of-birth options (2026-11-13 fix) ──────────────────────
// The native date input forced ~28 years of month-by-month scrolling for a
// normal adult birth date. Three dropdowns (day / named month / year)
// assemble the same ISO YYYY-MM-DD string the API expects, so the client
// validation below and the server 18+ gate are untouched. Years span from
// 18 years ago down to 100 years ago, newest first — exactly the range that
// can pass the 18+ gate.
const MONTH_OPTIONS = [
  { value: '01', label: 'January' }, { value: '02', label: 'February' },
  { value: '03', label: 'March' }, { value: '04', label: 'April' },
  { value: '05', label: 'May' }, { value: '06', label: 'June' },
  { value: '07', label: 'July' }, { value: '08', label: 'August' },
  { value: '09', label: 'September' }, { value: '10', label: 'October' },
  { value: '11', label: 'November' }, { value: '12', label: 'December' },
];
const THIS_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [];
for (let y = THIS_YEAR - 18; y >= THIS_YEAR - 100; y--) YEAR_OPTIONS.push(String(y));

// Days that exist in the chosen month. With no month chosen allow 31; with a
// month but no year yet, February allows 29 — the year pick re-clamps below.
function daysInMonth(year, month) {
  if (!month) return 31;
  if (!year) return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][Number(month) - 1];
  return new Date(Number(year), Number(month), 0).getDate();
}

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState(() => {
    const draft = loadDraft();
    return {
      displayName: draft ? draft.displayName : '',
      email: draft ? draft.email : '',
      password: '',
      confirmPassword: '',
      sect: draft ? draft.sect : '',
      dateOfBirth: draft ? draft.dateOfBirth : '',
    };
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [tosAccepted, setTosAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  // Persist the draft as the member types (non-secret fields only). When all
  // four are empty the key is removed instead, so a cleared form stays clear.
  const { displayName, email, sect, dateOfBirth } = formData;
  useEffect(() => {
    try {
      if (!displayName && !email && !sect && !dateOfBirth) clearDraft();
      else sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ displayName, email, sect, dateOfBirth }));
    } catch { /* storage unavailable — the form still works, just without restore */ }
  }, [displayName, email, sect, dateOfBirth]);

  // Segmented DOB: parts are derived from the assembled ISO string so the
  // draft, validation and the API payload all share one source of truth.
  const dobMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(formData.dateOfBirth || '');
  const dobYear = dobMatch ? dobMatch[1] : '';
  const dobMonth = dobMatch ? dobMatch[2] : '';
  const dobDay = dobMatch ? dobMatch[3] : '';
  const maxDobDay = daysInMonth(dobYear, dobMonth);

  const handleDobChange = (part) => (e) => {
    let y = dobYear, m = dobMonth, d = dobDay;
    if (part === 'year') y = e.target.value;
    else if (part === 'month') m = e.target.value;
    else d = e.target.value;
    // Clamp the day into the chosen month/year so an impossible date
    // (31 February, 29 Feb in a non-leap year) can never be assembled.
    if (d && Number(d) > daysInMonth(y, m)) d = String(daysInMonth(y, m)).padStart(2, '0');
    const iso = y && m && d ? `${y}-${m}-${d}` : '';
    setFormData(prev => ({ ...prev, dateOfBirth: iso }));
    setError('');
    setFieldErrors(prev => ({ ...prev, dateOfBirth: '' }));
  };

  const passwordChecks = {
    length: formData.password.length >= 8,
    match: formData.password !== '' && formData.password === formData.confirmPassword,
  };

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
    setFieldErrors(prev => ({ ...prev, [e.target.name]: '' }));
  };

  const validate = () => {
    const errs = {};
    if (!formData.displayName.trim()) errs.displayName = 'Please enter your full name.';
    if (!formData.email.trim()) errs.email = 'Please enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) errs.email = 'That email address does not look valid.';
    if (formData.password.length < 8) errs.password = 'Password must be at least 8 characters.';
    if (formData.confirmPassword !== formData.password) errs.confirmPassword = 'Passwords do not match.';
    if (!formData.sect) errs.sect = 'Please select your sect.';
    // 18+ enforcement (2026-11-10, external-audit fixes): the Terms require
    // members to be 18 or older. The server re-checks this — the client
    // check is the friendly message, not the enforcement.
    if (!formData.dateOfBirth) errs.dateOfBirth = 'Please enter your date of birth.';
    else {
      const dob = new Date(formData.dateOfBirth + 'T00:00:00');
      const today = new Date();
      if (Number.isNaN(dob.getTime())) errs.dateOfBirth = 'Enter a valid date of birth.';
      else if (dob > today) errs.dateOfBirth = 'Your date of birth cannot be in the future.';
      else {
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
        if (age < 18) errs.dateOfBirth = 'You must be 18 or older to create an account on Shia Rishta.';
      }
    }
    if (!tosAccepted) errs.tos = 'Please accept the Terms and Privacy Policy to create an account.';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      setError('Please fix the highlighted fields below.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await register({ email: formData.email, password: formData.password, displayName: formData.displayName, sect: formData.sect, dateOfBirth: formData.dateOfBirth });
      // Signup succeeded — the draft has served its purpose.
      clearDraft();
      analytics.track('account_created', { browser_local: true });
      // 2026-11-01 stuck-signup fix: show the verify step FIRST. Before this
      // we went straight to /onboard and 69% of real members never verified,
      // so they stayed hidden and locked out of messaging. The pending screen
      // always offers "Continue to profile setup", so onboarding is never blocked.
      navigate('/verify-pending');
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'input w-full input-with-icon';

  return (
    <div className="relative min-h-screen flex items-center justify-center px-6 py-12 overflow-hidden" style={{ background: 'var(--color-canvas)' }}>
      {/* Ambient glows */}
      {/* Ambient glows */}
      <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #d4af69, transparent 65%)', filter: 'blur(40px)' }} />
      <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #10b981, transparent 65%)', filter: 'blur(40px)' }} />

      <div className="relative w-full max-w-md">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="Go back"
          title="Close and go back to home"
          className="absolute -top-2 right-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:scale-105 cursor-pointer"
          style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-ink-secondary)', zIndex: 10 }}
        >
          <X className="w-4 h-4" />
        </button>
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'linear-gradient(135deg,#10b981,#d4af69)', color: '#fff', boxShadow: '0 10px 30px rgba(16,185,129,0.4)' }}
          >
            <Sparkles className="w-5 h-5" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--color-ink)' }}>
            Create your <span className="text-gradient">account</span>
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-ink-secondary)' }}>
            {useRemote
              ? 'Your account is stored securely on our servers. We never sell your data.'
              : 'Demo build: accounts and sessions live in this browser only — not a production identity system.'}
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8 space-y-5"
          style={{
            background: 'color-mix(in srgb, var(--color-elevated) 82%, transparent)',
            border: '1px solid var(--color-border)',
            backdropFilter: 'blur(18px)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {error && (
            <div className="p-4 rounded-xl text-sm" style={{ background: 'var(--color-danger-subtle)', border: '1px solid color-mix(in srgb, var(--color-danger) 25%, transparent)', color: 'var(--color-danger)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="displayName" className="block mb-1.5 text-sm font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Full Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--color-ink-faint)' }} />
                <input type="text" id="displayName" name="displayName" value={formData.displayName} onChange={handleChange} required placeholder="Your full name" className={inputClass} style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }} />
              </div>
            </div>
              {fieldErrors.displayName && <p role="alert" className="mt-1 text-xs" style={{ color: 'var(--color-danger)' }}>{fieldErrors.displayName}</p>}

            <div>
              <label htmlFor="email" className="block mb-1.5 text-sm font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--color-ink-faint)' }} />
                <input type="email" id="email" name="email" value={formData.email} onChange={handleChange} required placeholder="you@example.com" className={inputClass} style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }} />
              </div>
            </div>
              {fieldErrors.email && <p role="alert" className="mt-1 text-xs" style={{ color: 'var(--color-danger)' }}>{fieldErrors.email}</p>}

            <div>
              <label htmlFor="password" className="block mb-1.5 text-sm font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--color-ink-faint)' }} />
                <input type={showPassword ? 'text' : 'password'} id="password" name="password" value={formData.password} onChange={handleChange} required minLength={8} placeholder="Min 8 characters" className={`${inputClass} input-with-action`} style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }} />
              <p className="mt-1 text-xs" style={{ color: passwordChecks.length ? 'var(--color-success, #1a7f4e)' : 'var(--color-ink-faint)' }}>
                {passwordChecks.length ? '✓ At least 8 characters' : 'At least 8 characters'}
              </p>
              {fieldErrors.password && <p role="alert" className="mt-1 text-xs" style={{ color: 'var(--color-danger)' }}>{fieldErrors.password}</p>}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--color-ink-faint)' }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block mb-1.5 text-sm font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--color-ink-faint)' }} />
                <input type={showPassword ? 'text' : 'password'} id="confirmPassword" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required minLength={8} placeholder="Repeat password" className={inputClass} style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }} />
              {formData.confirmPassword && (
                <p className="mt-1 text-xs" style={{ color: passwordChecks.match ? 'var(--color-success, #1a7f4e)' : 'var(--color-danger)' }}>
                  {passwordChecks.match ? '✓ Passwords match' : 'Passwords do not match yet'}
                </p>
              )}
              {fieldErrors.confirmPassword && <p role="alert" className="mt-1 text-xs" style={{ color: 'var(--color-danger)' }}>{fieldErrors.confirmPassword}</p>}
              </div>
            </div>

            <div>
              <span id="dob-label" className="block mb-1.5 text-sm font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Date of Birth</span>
              <div className="grid grid-cols-[0.85fr_1.35fr_1fr] gap-2" role="group" aria-labelledby="dob-label">
                <div>
                  <label htmlFor="dobDay" className="sr-only">Day of birth</label>
                  <select id="dobDay" name="dobDay" value={dobDay} onChange={handleDobChange('day')} required className="input w-full" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                    <option value="">Day</option>
                    {Array.from({ length: maxDobDay }, (_, i) => String(i + 1).padStart(2, '0')).map(d => (
                      <option key={d} value={d}>{Number(d)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="dobMonth" className="sr-only">Month of birth</label>
                  <select id="dobMonth" name="dobMonth" value={dobMonth} onChange={handleDobChange('month')} required className="input w-full" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                    <option value="">Month</option>
                    {MONTH_OPTIONS.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="dobYear" className="sr-only">Year of birth</label>
                  <select id="dobYear" name="dobYear" value={dobYear} onChange={handleDobChange('year')} required className="input w-full" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                    <option value="">Year</option>
                    {YEAR_OPTIONS.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="mt-1 text-xs" style={{ color: 'var(--color-ink-faint)' }}>
                You must be 18 or older to join. We store your date of birth only to enforce this.
              </p>
              {fieldErrors.dateOfBirth && <p role="alert" className="mt-1 text-xs" style={{ color: 'var(--color-danger)' }}>{fieldErrors.dateOfBirth}</p>}
            </div>

            <div>
              <label htmlFor="sect" className="block mb-1.5 text-sm font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Sect</label>
              <select
                id="sect"
                name="sect"
                value={formData.sect}
                onChange={handleChange}
                required
                className="input w-full"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
              >
                <option value="">Select your sect…</option>
                <option value="Ithna Ashari (Twelver)">Ithna Ashari (Twelver)</option>
                <option value="Ismaili">Ismaili</option>
                <option value="Bohra (Dawoodi)">Bohra (Dawoodi)</option>
                <option value="Zaydi">Zaydi</option>
                <option value="Alevi">Alevi</option>
                <option value="Other / Prefer not to say">Other / Prefer not to say</option>
              </select>
              <p className="mt-1 text-xs" style={{ color: 'var(--color-ink-faint)' }}>
                Shia Rishta is a Shia matrimonial platform.
              </p>
              {fieldErrors.sect && <p role="alert" className="mt-1 text-xs" style={{ color: 'var(--color-danger)' }}>{fieldErrors.sect}</p>}
            </div>

            <label className="flex items-start gap-3 text-sm cursor-pointer" style={{ color: 'var(--color-ink-secondary)' }}>
              <input type="checkbox" checked={tosAccepted} onChange={e => { setTosAccepted(e.target.checked); setFieldErrors(prev => ({ ...prev, tos: '' })); }}
                className="mt-1 w-4 h-4 flex-shrink-0" style={{ accentColor: 'var(--color-primary)' }} aria-describedby="tos-error" />
              <span>I agree to the <Link to="/terms" className="link-primary font-medium">Terms of Service</Link> and <Link to="/privacy" className="link-primary font-medium">Privacy Policy</Link>.</span>
            </label>
            {fieldErrors.tos && <p id="tos-error" role="alert" className="-mt-3 text-xs" style={{ color: 'var(--color-danger)' }}>{fieldErrors.tos}</p>}

            <button type="submit" disabled={loading} className="btn btn-primary w-full py-3.5 text-base">
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <SocialLogin mode="signup" />

          <p className="text-center text-sm" style={{ color: 'var(--color-ink-secondary)' }}>
            Already have an account?{' '}
            <Link to="/auth/login" className="link-primary font-semibold">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
