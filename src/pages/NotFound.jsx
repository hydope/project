import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Home, Users, MessageCircle, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../lib/auth/AuthContext';

export default function NotFound() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { isLoggedIn } = useAuth();

  const handleSearch = (e) => {
    e.preventDefault();
    if (search.trim()) navigate(`/profiles?search=${encodeURIComponent(search.trim())}`);
  };

  const quickLinks = [
    { to: '/', icon: Home, label: 'Homepage', desc: 'Return to the main page' },
    { to: '/profiles', icon: Users, label: 'Browse profiles', desc: 'Find your match' },
    ...(isLoggedIn ? [{ to: '/messages', icon: MessageCircle, label: 'Messages', desc: 'Check conversations' }] : []),
    { to: '/onboard', icon: Sparkles, label: 'Create profile', desc: 'Get started today' }
  ];

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-16" style={{ background: 'var(--bg)' }}>
      <div className="text-center max-w-2xl w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* 404 display */}
          <div className="relative inline-block mb-8">
            <span className="text-[7rem] sm:text-[9rem] font-black leading-none tracking-tighter" style={{ color: 'transparent', WebkitTextStroke: '2px var(--primary)' }}>
              404
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: 'var(--text)' }}>
            This page took a wrong turn
          </h1>
          <p className="text-sm sm:text-base mb-8 max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
            The page you're looking for has moved, doesn't exist, or is temporarily unavailable. Let's get you back on track.
          </p>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="max-w-md mx-auto mb-10">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-ink-tertiary)' }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search for members, topics, or pages..."
                className="w-full pl-11 pr-24 py-3.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition-all"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
              <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90" style={{ background: 'var(--primary)' }}>
                Search
              </button>
            </div>
          </form>

          {/* Quick links grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {quickLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border transition-all hover:-translate-y-0.5 hover:shadow-md group"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
              >
                <link.icon className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{link.label}</span>
                <span className="text-[10px]" style={{ color: 'var(--color-ink-tertiary)' }}>{link.desc}</span>
              </Link>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
