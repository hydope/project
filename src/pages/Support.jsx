import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import Layout from '../layouts/LandingLayout';
import { useToast } from '../lib/useToast';
import { HelpCircle, MessageSquare, Send, ChevronDown, Search, BookOpen, Shield, Gift, UserCheck, Sparkles, CheckCircle, Clock, Mail } from 'lucide-react';

const FAQ_CATEGORIES = [
  { id: 'all', label: 'All Topics', icon: BookOpen },
  { id: 'getting-started', label: 'Getting Started', icon: Sparkles },
  { id: 'privacy', label: 'Privacy & Safety', icon: Shield },
  { id: 'matchmaking', label: 'Matchmaking', icon: UserCheck },
  // There is no pricing page or membership tier. The category is kept only to
  // answer "is this free?", which members still ask — it just stops implying
  // that a price list exists somewhere.
  { id: 'free', label: 'Free — Always', icon: Gift },
];

const FAQ_ITEMS = [
  { q: 'How do I create a profile?', a: 'Click "Get Started" or "Sign Up" from the homepage. Our 7-step onboarding wizard guides you through every detail — from basic info to faith, lineage, career, marriage intentions, and privacy controls. Progress is autosaved, so you can finish anytime.', cat: 'getting-started' },
  { q: 'Can I save my progress and come back?', a: 'Absolutely — every step of the onboarding wizard autosaves to your browser. If you leave and return, you\'ll resume exactly where you left off.', cat: 'getting-started' },
  { q: 'How does the matching system work?', a: 'Our compatibility score weighs shared values, religiosity, lifestyle alignment, and timeline compatibility. Results are ranked by a Compatibility Index (%). You can also use our Advanced Search with granular filters for sect, Marja\', education, and more.', cat: 'matchmaking' },
  { q: 'What is the Compatibility Index?', a: 'A percentage score (0–100%) that reflects how well two profiles align across faith, values, lifestyle, and intentions. It combines shared sect, religiosity level, prayer practice, timeline openness, and family involvement preferences.', cat: 'matchmaking' },
  { q: 'Is my information private?', a: 'Yes — privacy is a right here, not a premium feature. You control photo visibility (hidden until match / request-only / full access), profile visibility (discoverable / limited / private), and discreet browsing mode. Messages and identity uploads are encrypted at rest, so a stolen database cannot reveal them.', cat: 'privacy' },
  { q: 'How do I add a guardian or wali?', a: 'A family member or approved matchmaker can create a private introduction on your behalf and share it with you by a secure link. You stay in control: the introduction carries no photos, expires after 45 days, and you can claim it, decline it, or have it withdrawn at any time. Viewing a wali page is read-only and never exposes your email.', cat: 'privacy' },
  { q: 'Can a family member read my messages?', a: 'No. Only the two people in a conversation can read it. Family involvement happens through introductions and shared profile links — not by giving anyone else message access. We do not have a feature that puts a third party inside a private conversation.', cat: 'privacy' },
  { q: 'How do I report inappropriate behavior?', a: 'Click the "Report" button on any profile or conversation. Our Trust & Safety team reviews all reports within 24 hours and takes appropriate action — up to and including permanent removal.', cat: 'privacy' },
  { q: 'Is Shia Rishta really free?', a: 'Yes — entirely free, for everyone, with no paid tier. Creating a profile, browsing, expressing interest, messaging and identity verification are all included, and none of your privacy controls are a premium feature. There is nothing to buy.', cat: 'free' },
  { q: 'How do I verify my identity?', a: 'After publishing your profile, navigate to Settings → Verification to submit a government ID or a selfie. Verified members receive a prominent badge. Your document is encrypted before it is stored, is reviewed only by our verification team, and is never shown to other members.', cat: 'privacy' },
];

const TICKET_CATEGORIES = [
  { value: 'technical', label: 'Technical Issue' },
  { value: 'profile', label: 'Profile & Account' },
  { value: 'safety', label: 'Safety & Reporting' },
  { value: 'feedback', label: 'Feedback & Suggestions' },
  { value: 'other', label: 'Other' },
];

export default function Support() {
  const [activeTab, setActiveTab] = useState('faq');
  const [searchQuery, setSearchQuery] = useState('');
  const [faqCategory, setFaqCategory] = useState('all');
  const [openFaq, setOpenFaq] = useState(0);
  const [ticketForm, setTicketForm] = useState({ subject: '', category: '', description: '', email: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { addToast } = useToast();

  const filteredFaqs = FAQ_ITEMS.filter(item => {
    const matchesCat = faqCategory === 'all' || item.cat === faqCategory;
    const matchesSearch = searchQuery === '' || item.q.toLowerCase().includes(searchQuery.toLowerCase()) || item.a.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1200));
    setSubmitting(false);
    setSubmitted(true);
    setTicketForm({ subject: '', category: '', description: '', email: '' });
    addToast('Support ticket submitted!', 'success');
    setTimeout(() => setSubmitted(false), 5000);
  };

  const inputCls = 'w-full px-4 py-3 rounded-xl border border-line/30 bg-elevated text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all';

  return (
    <Layout>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <span className="text-xs font-bold uppercase tracking-widest text-primary">How can we help?</span>
          <h1 className="text-3xl sm:text-4xl font-bold text-ink mt-2">Help & Support</h1>
          <p className="text-muted mt-2 max-w-lg mx-auto">Find answers to common questions, or reach out to our team — we respond within hours.</p>
        </motion.div>

        {/* Tab switcher */}
        <div className="flex justify-center gap-2 mb-8">
          {[
            { id: 'faq', label: 'FAQ', icon: HelpCircle },
            { id: 'ticket', label: 'Submit Ticket', icon: MessageSquare },
          ].map(tab => {
            const TabIcon = tab.icon;
            return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === tab.id ? 'bg-primary text-white shadow-md' : 'bg-elevated border border-line/20 text-muted hover:bg-hover'}`}>
              <TabIcon className="w-4 h-4" /> {tab.label}
            </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'faq' && (
            <motion.div key="faq" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
              {/* Search */}
              <div className="relative max-w-md mx-auto mb-6">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search FAQs…"
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-line/30 bg-elevated text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
                  aria-label="Search FAQs" />
              </div>

              {/* Category chips */}
              <div className="flex flex-wrap justify-center gap-2 mb-8">
                {FAQ_CATEGORIES.map(cat => {
                  const CatIcon = cat.icon;
                  return (
                  <button key={cat.id} onClick={() => setFaqCategory(cat.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold border-2 transition-all ${faqCategory === cat.id ? 'border-primary bg-primary text-white' : 'border-line/25 text-muted hover:border-line/50'}`}>
                    <CatIcon className="w-3.5 h-3.5" /> {cat.label}
                  </button>
                  );
                })}
              </div>

              {/* FAQ list */}
              <div className="space-y-3 max-w-3xl mx-auto">
                {filteredFaqs.length === 0 ? (
                  <p className="text-center text-muted py-12">No matching FAQs. Try a different search or category.</p>
                ) : filteredFaqs.map((item, i) => (
                  <motion.div key={item.q} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                    className="bg-elevated rounded-xl border border-line/20 overflow-hidden">
                    <button onClick={() => setOpenFaq(openFaq === i ? -1 : i)} className="w-full flex items-center justify-between p-5 text-left">
                      <span className="font-medium text-ink text-sm pr-4">{item.q}</span>
                      <ChevronDown className={`w-5 h-5 text-muted flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence>
                      {openFaq === i && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="px-5 pb-5 text-sm text-muted leading-relaxed border-t border-line/10 pt-4">{item.a}</div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'ticket' && (
            <motion.div key="ticket" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              className="max-w-2xl mx-auto bg-elevated rounded-2xl border border-line/20 shadow-sm p-6 sm:p-8">
              {submitted ? (
                <div className="text-center py-10">
                  <CheckCircle className="w-14 h-14 text-success mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-ink">Ticket Submitted!</h3>
                  <p className="text-muted text-sm mt-2 flex items-center justify-center gap-1.5"><Clock className="w-4 h-4" /> We'll respond within 2–4 hours.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="flex items-center gap-3 mb-2">
                    <Mail className="w-5 h-5 text-primary" />
                    <div>
                      <h2 className="text-xl font-bold text-ink">Submit a Ticket</h2>
                      <p className="text-xs text-muted">Fill out the form and our team will get back to you.</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted mb-1 block">Your Email *</label>
                    <input type="email" value={ticketForm.email} onChange={e => setTicketForm(f => ({ ...f, email: e.target.value }))} required placeholder="you@email.com" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted mb-1 block">Category *</label>
                    <select value={ticketForm.category} onChange={e => setTicketForm(f => ({ ...f, category: e.target.value }))} required className={`${inputCls} appearance-none`}>
                      <option value="">Select category</option>
                      {TICKET_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted mb-1 block">Subject *</label>
                    <input type="text" value={ticketForm.subject} onChange={e => setTicketForm(f => ({ ...f, subject: e.target.value }))} required placeholder="Brief description" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted mb-1 block">Description *</label>
                    <textarea value={ticketForm.description} onChange={e => setTicketForm(f => ({ ...f, description: e.target.value }))} required rows={5} placeholder="Describe your issue in detail..." className={`${inputCls} resize-none`} />
                  </div>
                  <button type="submit" disabled={submitting} className="button primary px-8 py-3 font-semibold flex items-center gap-2 disabled:opacity-60">
                    {submitting ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Submitting…</> : <><Send className="w-4 h-4" /> Submit Ticket</>}
                  </button>
                </form>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </Layout>
  );
}
