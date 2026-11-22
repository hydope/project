import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from '../../lib/motion';
import { ShieldCheck, Mail, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';

export default function AdminLogin() {
  const { login, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [status, setStatus] = useState('idle'); // idle | loading | error
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');
    try {
      const { user } = await login(formData.email, formData.password);
      if (!user?.isAdmin) {
        setStatus('error');
        setErrorMessage('This account does not have admin access.');
        return;
      }
      navigate(location.state?.from ?? '/admin/dashboard', { replace: true });
    } catch (err) {
      setStatus('error');
      setErrorMessage(err.message || 'Invalid credentials. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-base px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <div className="bg-elevated rounded-3xl border border-line/20 shadow-xl p-8 sm:p-10">
          <div className="flex flex-col items-center text-center mb-8">
            <span className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <ShieldCheck className="w-7 h-7 text-primary" />
            </span>
            <h1 className="text-2xl font-bold text-ink">Admin Login</h1>
            <p className="text-sm text-muted mt-2">
              Sign in with an admin account to access the admin panel.
            </p>
          </div>

          {errorMessage && (
            <div className="flex items-start gap-2.5 bg-danger/10 border border-danger/20 text-danger rounded-xl px-4 py-3 mb-6 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p>{errorMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="adminEmail" className="block text-sm font-medium text-ink mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                <input
                  type="email"
                  id="adminEmail"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  autoComplete="email"
                  placeholder="admin@shiarishta.com"
                  className="w-full bg-base border border-line/30 rounded-xl pl-10 pr-4 py-3 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition"
                />
              </div>
            </div>

            <div>
              <label htmlFor="adminPassword" className="block text-sm font-medium text-ink mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                <input
                  type="password"
                  id="adminPassword"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full bg-base border border-line/30 rounded-xl pl-10 pr-4 py-3 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm transition flex items-center justify-center gap-2"
            >
              {status === 'loading' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {isAdmin && (
            <p className="text-xs text-muted text-center mt-6">
              You are signed in as an admin.
            </p>
          )}
        </div>

        <p className="text-xs text-muted text-center mt-6">
          Shia Rishta Admin Panel
        </p>
      </motion.div>
    </div>
  );
}
