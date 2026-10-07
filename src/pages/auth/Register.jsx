import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthContext';
import { analytics } from '../../lib/analytics';
import { useRemote } from '../../lib/api/transport';
import { Eye, EyeOff, Mail, Lock, User, Sparkles, X } from 'lucide-react';
import SocialLogin from '../../components/SocialLogin';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ displayName: '', email: '', password: '', confirmPassword: '', sect: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await register({ email: formData.email, password: formData.password, displayName: formData.displayName, sect: formData.sect });
      analytics.track('account_created', { browser_local: true });
      navigate('/onboard');
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

            <div>
              <label htmlFor="email" className="block mb-1.5 text-sm font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--color-ink-faint)' }} />
                <input type="email" id="email" name="email" value={formData.email} onChange={handleChange} required placeholder="you@example.com" className={inputClass} style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }} />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block mb-1.5 text-sm font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--color-ink-faint)' }} />
                <input type={showPassword ? 'text' : 'password'} id="password" name="password" value={formData.password} onChange={handleChange} required minLength={6} placeholder="Min 6 characters" className={`${inputClass} input-with-action`} style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }} />
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
                <input type={showPassword ? 'text' : 'password'} id="confirmPassword" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required minLength={6} placeholder="Repeat password" className={inputClass} style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }} />
              </div>
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
            </div>

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
