import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import Layout from '../layouts/LandingLayout';
import { Mail, Clock, Send, CheckCircle2, AlertCircle, Loader2, MessageSquareHeart } from 'lucide-react';

const CONTACT_METHODS = [
  { icon: Mail, title: 'Email Support', desc: 'Send us a message', links: [
    { label: 'Use the form below', href: '#contact-form' },
  ]},
  { icon: Clock, title: 'Response Time', desc: 'We read every message', links: [
    { label: 'We reply as soon as we can', href: '#contact-form' },
  ]},
];

const inputCls = 'w-full px-4 py-3 rounded-xl border border-line/30 bg-base text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-all';

export default function Contact() {
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState('');

  const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    setError('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setError(err.message);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', email: '', subject: '', message: '' });
    setStatus('idle');
    setError('');
  };

  return (
    <Layout>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 rounded-full px-4 py-1.5">
            <MessageSquareHeart className="w-3.5 h-3.5" />
            We're here for you
          </span>
          <h1 className="text-3xl sm:text-5xl font-bold text-ink mt-4 tracking-tight">Get in Touch</h1>
          <p className="text-muted mt-3 max-w-xl mx-auto text-base">
            Have a question about privacy, need help with your profile, or want to share feedback? Our team listens.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-[1fr_1.25fr] gap-8 lg:gap-12 items-start">
          <div className="space-y-4">
            {CONTACT_METHODS.map((m, i) => (
              <motion.div key={m.title}
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}
                className="flex items-start gap-4 p-5 rounded-2xl border border-line/20 bg-elevated hover:border-primary/30 hover:shadow-md transition-all">
                <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
                  <m.icon className="w-5 h-5 text-primary" />
                </span>
                <div>
                  <h3 className="font-semibold text-ink text-sm">{m.title}</h3>
                  <p className="text-xs text-muted mt-0.5 mb-1.5">{m.desc}</p>
                  {m.links.map(l => (
                    <a key={l.label} href={l.href} className="block text-xs text-primary hover:underline font-medium">{l.label}</a>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="bg-elevated rounded-3xl border border-line/20 shadow-lg p-6 sm:p-10 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-emerald-400 to-amber-300" />

            <AnimatePresence mode="wait">
              {status === 'sent' ? (
                <motion.div key="sent" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-10">
                  <span className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5">
                    <CheckCircle2 className="w-8 h-8 text-primary" />
                  </span>
                  <h2 className="text-2xl font-bold text-ink">Message received</h2>
                  <p className="text-muted text-sm mt-2 max-w-sm mx-auto">
                    Thank you, {formData.name.split(' ')[0] || 'friend'}. Our team will get back to you at {formData.email} shortly.
                  </p>
                  <button onClick={resetForm}
                    className="mt-6 text-sm font-semibold text-primary hover:underline">
                    Send another message
                  </button>
                </motion.div>
              ) : (
                <motion.form key="form" exit={{ opacity: 0 }} onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <h2 className="text-xl font-bold text-ink">Send us a message</h2>
                    <p className="text-sm text-muted mt-1">We usually reply within a few hours.</p>
                  </div>

                  {status === 'error' && (
                    <div className="flex items-start gap-2.5 bg-danger/10 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <p>{error}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="contactName" className="text-xs font-semibold text-ink mb-1.5 block">Full Name *</label>
                      <input id="contactName" name="name" value={formData.name} onChange={handleChange} required
                        placeholder="Your name" className={inputCls} disabled={status === 'sending'} />
                    </div>
                    <div>
                      <label htmlFor="contactEmail" className="text-xs font-semibold text-ink mb-1.5 block">Email *</label>
                      <input id="contactEmail" name="email" type="email" value={formData.email} onChange={handleChange} required
                        placeholder="you@email.com" className={inputCls} disabled={status === 'sending'} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="contactSubject" className="text-xs font-semibold text-ink mb-1.5 block">Subject *</label>
                    <input id="contactSubject" name="subject" value={formData.subject} onChange={handleChange} required
                      placeholder="How can we help?" className={inputCls} disabled={status === 'sending'} />
                  </div>
                  <div>
                    <label htmlFor="contactMessage" className="text-xs font-semibold text-ink mb-1.5 block">Message *</label>
                    <textarea id="contactMessage" name="message" value={formData.message} onChange={handleChange} required
                      rows={5} placeholder="Tell us more..." className={`${inputCls} resize-none`} disabled={status === 'sending'} />
                  </div>
                  <button type="submit" disabled={status === 'sending'}
                    className="w-full sm:w-auto bg-primary hover:bg-primary/90 disabled:opacity-60 text-white px-8 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition shadow-md shadow-primary/20">
                    {status === 'sending' ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                    ) : (
                      <><Send className="w-4 h-4" /> Send Message</>
                    )}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </main>
    </Layout>
  );
}
