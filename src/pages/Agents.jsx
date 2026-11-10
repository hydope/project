import { motion } from 'framer-motion';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../layouts/LandingLayout';
import { Sparkles, Brain, MessageCircle, UserCheck, Heart, Search, ArrowRight, CheckCircle, Shield } from 'lucide-react';

// These are the real, working parts of Shia Rishta. Earlier versions of this
// page advertised "AI agents" with invented accuracy/match/rating figures and a
// button that only fired a toast. None of that exists. Everything below is
// something you can actually use, and every card links to it.
const TOOLS = [
  {
    id: 'compatibility',
    name: 'Compatibility Score',
    tagline: 'See where you align',
    type: 'matchmaking',
    icon: Heart,
    color: 'from-rose-400 to-pink-500',
    description: 'A 0–100% score weighting shared faith practice, values, lifestyle, language and timeline. It is a transparent formula, not a black box — the breakdown shows exactly what raised or lowered it.',
    capabilities: ['Weighted across faith, values and timeline', 'Shows the full breakdown, not just a number', 'Never shared with other members'],
    href: '/profiles/',
    cta: 'Browse profiles',
  },
  {
    id: 'profile-coach',
    name: 'Profile Completeness',
    tagline: 'Make your profile work harder',
    type: 'profile',
    icon: UserCheck,
    color: 'from-violet-400 to-purple-500',
    description: 'A checklist that shows exactly which fields are missing and why each one helps. Complete profiles get meaningfully more interest — the dashboard tracks your percentage as you go.',
    capabilities: ['Live completeness percentage', 'Tells you which fields matter most', 'Autosaves as you go'],
    href: '/onboard',
    cta: 'Complete your profile',
  },
  {
    id: 'filters',
    name: 'Sect & Marja\' Filters',
    tagline: 'Match within your jamat',
    type: 'matchmaking',
    icon: Search,
    color: 'from-amber-400 to-orange-500',
    description: 'Filter by Ithna Ashari, Ismaili, Zaydi or Bohra, then narrow by Marja\' affiliation, practice level, location and language — before you ever start a conversation.',
    capabilities: ['Sect and sub-sect filtering', 'Marja\' affiliation', 'Verified-only filter'],
    href: '/profiles/',
    cta: 'Use the filters',
  },
  {
    id: 'introductions',
    name: 'Family Introductions',
    tagline: 'When family starts it',
    type: 'communication',
    icon: Shield,
    color: 'from-emerald-400 to-teal-500',
    description: 'A family member or approved matchmaker can create a private introduction for you and share it by secure link. It carries no photos, expires after 45 days, and you decide whether to claim it, decline it, or have it withdrawn.',
    capabilities: ['No photos attached to an introduction', '45-day expiry, plus short code', 'You keep control: claim, decline or withdraw'],
    href: '/drafts',
    cta: 'See introductions',
  },
  {
    id: 'gated-messaging',
    name: 'Mutual-Interest Messaging',
    tagline: 'No cold approaches',
    type: 'communication',
    icon: MessageCircle,
    color: 'from-sky-400 to-blue-500',
    description: 'Messaging only opens when interest runs both ways, and contact details are stripped from messages before they are stored. You are never contacted by someone who has not sought you out first.',
    capabilities: ['Conversation opens only on mutual interest', 'Phone, email and handles removed automatically', 'Block any member instantly'],
    href: '/messages',
    cta: 'Open messages',
  },
  {
    id: 'verification',
    name: 'Identity Verification',
    tagline: 'Earn the verified badge',
    type: 'profile',
    icon: Brain,
    color: 'from-slate-400 to-gray-500',
    description: 'Submit a government ID or a selfie. The file is encrypted before it is stored, read only by our review team, and never shown to another member. Verified members carry a badge.',
    capabilities: ['Encrypted at rest before storage', 'Reviewed by people, not a guess', 'Never shown to other members'],
    href: '/settings',
    cta: 'Start verification',
  },
];

const TABS = [
  { id: 'all', label: 'Everything', icon: Sparkles },
  { id: 'matchmaking', label: 'Matchmaking', icon: Heart },
  { id: 'profile', label: 'Profile', icon: UserCheck },
  { id: 'communication', label: 'Communication', icon: MessageCircle },
];

export default function Agents() {
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = TOOLS.filter(a => {
    const matchesTab = activeTab === 'all' || a.type === activeTab;
    const matchesSearch = searchQuery === '' || a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.tagline.toLowerCase().includes(searchQuery.toLowerCase()) || a.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  return (
    <Layout>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <span className="text-xs font-bold uppercase tracking-widest text-primary">What Shia Rishta actually does</span>
          <h1 className="text-3xl sm:text-4xl font-bold text-ink mt-2">Tools that work for you</h1>
          <p className="text-muted mt-2 max-w-xl mx-auto">No buzzwords — these are the real features behind your journey, from profile building to family introductions. Every card takes you straight to it.</p>
        </motion.div>

        {/* Search */}
        <div className="relative max-w-md mx-auto mb-6">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search agents…"
            className="w-full pl-11 pr-4 py-3 rounded-xl border border-line/30 bg-elevated text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
            aria-label="Search agents" />
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {TABS.map(tab => {
            const TabIcon = tab.icon;
            return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold border-2 transition-all ${activeTab === tab.id ? 'border-primary bg-primary text-white' : 'border-line/25 text-muted hover:border-line/50'}`}>
              <TabIcon className="w-3.5 h-3.5" /> {tab.label}
            </button>
            );
          })}
        </div>

        {/* Agent grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((agent, i) => (
            <motion.div key={agent.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
              className="bg-elevated rounded-2xl border border-line/20 overflow-hidden hover:shadow-md transition-all group">
              {/* Header gradient */}
              <div className={`h-2 bg-gradient-to-r ${agent.color}`} />
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <span className={`w-12 h-12 rounded-xl bg-gradient-to-br ${agent.color} flex items-center justify-center text-white shadow-sm`}>
                    <agent.icon className="w-6 h-6" />
                  </span>
                  <span className="text-xs font-semibold text-muted bg-hover px-2.5 py-1 rounded-full capitalize">{agent.type}</span>
                </div>
                <h3 className="text-lg font-bold text-ink">{agent.name}</h3>
                <p className="text-sm text-primary font-medium mb-2">{agent.tagline}</p>
                <p className="text-xs text-muted leading-relaxed mb-4">{agent.description}</p>

                {/* Capabilities */}
                <div className="space-y-1.5 mb-5">
                  {agent.capabilities.map(cap => (
                    <div key={cap} className="flex items-center gap-2 text-xs text-muted">
                      <CheckCircle className="w-3.5 h-3.5 text-success flex-shrink-0" /> {cap}
                    </div>
                  ))}
                </div>

                <Link to={agent.href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                  {agent.cta} <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-muted py-12">No tools match your search. Try different keywords.</p>
        )}
      </main>
    </Layout>
  );
}
