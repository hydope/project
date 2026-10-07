import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthContext';
import { Eye, EyeOff, Mail, Lock, Sparkles, X } from 'lucide-react';
import SocialLogin from '../../components/SocialLogin';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(formData.email, formData.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-6 py-12 overflow-hidden bg-canvas" style={{ background: 'var(--color-canvas)' }}>
      {/* Ambient glows */}
      <div className="absolute top-0 left-0 w-64 h-64 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #d4af69, transparent 65%)', filter: 'blur(40px)' }} />
      <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #10b981, transparent 65%)', filter: 'blur(40px)' }} />

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
            Welcome <span className="text-gradient">back</span>
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-ink-secondary)' }}>
            Sign in to continue your journey.
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
              <label htmlFor="email" className="block mb-1.5 text-sm font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--color-ink-faint)' }} />
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder="you@example.com"
                  className="input w-full input-with-icon"
                  style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block mb-1.5 text-sm font-medium" style={{ color: 'var(--color-ink-secondary)' }}>Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--color-ink-faint)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  className="input w-full input-with-icon input-with-action"
                  style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                />
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

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full py-3.5 text-base"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <SocialLogin mode="signin" />

          <p className="text-center text-sm">
            <Link to="/auth/forgot" className="link-primary font-medium">Forgot password?</Link>
          </p>
          <p className="text-center text-sm" style={{ color: 'var(--color-ink-secondary)' }}>
            Don&apos;t have an account?{' '}
            <Link to="/auth/register" className="link-primary font-semibold">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
