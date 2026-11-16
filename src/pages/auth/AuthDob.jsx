import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck } from 'lucide-react';
import Layout from '../../layouts/MainLayout';
import { useAuth } from '../../lib/auth/AuthContext';
import { usePageTitle } from '../../lib/usePageTitle';
import { api } from '../../lib/api/client';
import { daysInMonth, applyDobPart, dobIso, emptyDobParts } from '../../lib/dobParts';

// The post-social-sign-in DOB step (2026-11-16). A Google/Meta signup
// completes with one tap and NO form; the account is created with
// date_of_birth NULL and needsDob set, RequireAuth locks the member to
// this page, and profile saves refuse server-side until the DOB is on
// file. An under-18 date deletes the just-created account (server-side)
// and this page signs the member out with the refusal explained.
//
// The segmented selects hold each part as independent state and DERIVE
// the ISO value (lib/dobParts) — the standing rule for compound inputs.
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

export default function AuthDob() {
  usePageTitle('Date of Birth');
  const { user, loading, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [parts, setParts] = useState(emptyDobParts);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState('');

  // Someone with a DOB already on file has no business here.
  useEffect(() => {
    if (!loading && user && !user.needsDob) navigate('/dashboard', { replace: true });
  }, [loading, user, navigate]);

  const maxDay = daysInMonth(parts.year, parts.month);
  const handleChange = (part) => (e) => {
    setError('');
    setParts((p) => applyDobPart(p, part, e.target.value));
  };

  const submit = async (e) => {
    e.preventDefault();
    const iso = dobIso(parts);
    if (!iso) {
      setError('Please pick your full date of birth — day, month and year.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/dob', { dateOfBirth: iso });
      await refreshUser();
      navigate('/onboard', { replace: true });
    } catch (err) {
      if (err?.status === 403) {
        // Under-18: the server removed the account. Sign out locally and
        // explain — there is nothing to go back to.
        setRefused(err.message || 'You must be 18 or older to create an account on Shia Rishta.');
        logout();
      } else {
        setError(err.message || 'Could not save your date of birth. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (refused) {
    return (
      <Layout>
        <main className="max-w-md mx-auto px-6 py-12 sm:py-16 text-center">
          <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: 'var(--color-ink)' }}>
            You must be 18 or older
          </h1>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--color-ink-secondary)' }}>
            {refused}
          </p>
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="btn mt-6 px-5 py-2.5 text-sm font-semibold"
          >
            Back to home
          </button>
        </main>
      </Layout>
    );
  }

  return (
    <Layout>
      <main className="max-w-md mx-auto px-6 py-12 sm:py-16">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ background: 'linear-gradient(135deg,#10b981,#d4af69)', color: '#fff' }}
        >
          <CalendarCheck className="w-6 h-6" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-center" style={{ color: 'var(--color-ink)' }}>
          One quick step
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-center" style={{ color: 'var(--color-ink-secondary)' }}>
          You signed in — welcome. Every member confirms their date of birth
          so we can keep Shia Rishta 18+. Your exact date is never shown on
          your profile; only your age is.
        </p>

        <form onSubmit={submit} className="mt-8">
          <span id="authdob-label" className="block mb-1.5 text-sm font-medium" style={{ color: 'var(--color-ink-secondary)' }}>
            Date of Birth
          </span>
          <div className="grid grid-cols-[0.85fr_1.35fr_1fr] gap-2" role="group" aria-labelledby="authdob-label">
            <div>
              <label htmlFor="authDobDay" className="sr-only">Day of birth</label>
              <select id="authDobDay" value={parts.day} onChange={handleChange('day')} required className="input w-full" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                <option value="">Day</option>
                {Array.from({ length: maxDay }, (_, i) => String(i + 1).padStart(2, '0')).map((d) => (
                  <option key={d} value={d}>{Number(d)}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="authDobMonth" className="sr-only">Month of birth</label>
              <select id="authDobMonth" value={parts.month} onChange={handleChange('month')} required className="input w-full" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                <option value="">Month</option>
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="authDobYear" className="sr-only">Year of birth</label>
              <select id="authDobYear" value={parts.year} onChange={handleChange('year')} required className="input w-full" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                <option value="">Year</option>
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--color-ink-faint)' }}>
            You must be 18 or older to join. We store your date of birth only to enforce this.
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-center" style={{ color: 'var(--color-danger)' }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="btn w-full mt-5 py-3 text-sm font-semibold"
          >
            {busy ? 'Saving…' : 'Continue to profile setup'}
          </button>
        </form>
      </main>
    </Layout>
  );
}
