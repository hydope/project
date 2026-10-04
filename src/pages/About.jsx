import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import Layout from '../layouts/LandingLayout';
import { Heart, Shield, Users, Sparkles, Globe, Eye, ArrowRight } from 'lucide-react';

const VALUES = [
  { icon: Shield, title: 'Privacy by Default', desc: 'Your photos, your profile, your rules. Hidden-until-match by default, encrypted message storage, and discreet browsing come standard — not as premium add-ons.' },
  { icon: Heart, title: 'Intention First', desc: 'We built Shia Rishta for one purpose: serious nikah-seeking. No swiping culture, no casual browsing — just verified, intentional members.' },
  { icon: Users, title: 'Family-Centered', desc: 'Wali workflows and family-managed introductions aren\'t afterthoughts. They\'re built into the platform from day one.' },
  { icon: Globe, title: 'Community-Driven', desc: 'From Ithna Ashari to Ismaili, Bohra to Zaydi — we serve the full diversity of Shia Islam with granular sect and Marja\' filters.' },
  { icon: Sparkles, title: 'Values-Matched', desc: 'Our compatibility score weighs faith practice, values, lifestyle and timeline alignment — surfacing matches that genuinely matter.' },
  { icon: Eye, title: 'Transparent', desc: 'No hidden paywalls behind basic navigation. The platform is entirely free, matching is honest, and a team of people responds within hours.' },
];

const TEAM = [
  { name: 'Mitchell', role: 'Founder & Lead Engineer', initial: 'M' },
  { name: 'The Shia Rishta Team', role: 'Community & Support', initial: 'S' },
];

export default function About() {
  return (
    <Layout>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-14">
          <span className="text-xs font-bold uppercase tracking-widest text-primary">Our mission</span>
          <h1 className="text-3xl sm:text-5xl font-bold text-ink mt-2">Built for a sacred purpose</h1>
          <p className="text-muted mt-3 max-w-2xl mx-auto text-lg">
            Shia Rishta exists to help Shia singles and families find life partners with dignity, privacy, and faith at the center.
          </p>
        </motion.div>

        {/* Story */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-elevated rounded-2xl border border-line/20 p-6 sm:p-10 mb-14">
          <div className="grid md:grid-cols-[1fr_2fr] gap-8 items-center">
            <div className="text-center">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4">S</div>
              <h2 className="text-xl font-bold text-ink">Shia Rishta</h2>
              <p className="text-sm text-muted mt-1">Where intention meets introduction</p>
            </div>
            <div className="space-y-4 text-sm text-muted leading-relaxed">
              <p>Shia Rishta was born from a simple observation: existing matrimonial platforms didn't serve the Shia community well. They lacked granular sect filters, ignored the importance of wali involvement, treated privacy as a premium feature, and felt more like social media than a sacred search.</p>
              <p>We set out to build something different. A platform where privacy is a right. Where family involvement is a feature, not an afterthought. Where AI serves serious intentions — not engagement metrics. Where every design decision is guided by Islamic values and cultural respect.</p>
              <p>Shia Rishta is in early access, welcoming founding members who are helping shape a thoughtful, faith-centered way to meet.</p>
            </div>
          </div>
        </motion.div>

        {/* Values */}
        <div className="mb-14">
          <h2 className="text-2xl font-bold text-ink text-center mb-8">What we stand for</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {VALUES.map((v, i) => (
              <motion.div key={v.title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.07 }}
                className="p-6 rounded-2xl bg-elevated border border-line/20 hover:shadow-sm transition-all">
                <span className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-3"><v.icon className="w-5 h-5 text-primary" /></span>
                <h3 className="font-bold text-ink mb-1">{v.title}</h3>
                <p className="text-sm text-muted">{v.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Team */}
        <div className="mb-14">
          <h2 className="text-2xl font-bold text-ink text-center mb-8">Built with care</h2>
          <div className="flex flex-wrap justify-center gap-8">
            {TEAM.map((member, i) => (
              <motion.div key={member.name} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 + i * 0.1 }}
                className="text-center">
                <div className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center text-primary text-2xl font-bold mx-auto mb-3">{member.initial}</div>
                <h3 className="font-bold text-ink">{member.name}</h3>
                <p className="text-sm text-muted">{member.role}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="text-center bg-gradient-to-br from-primary/10 via-accent/5 to-primary/10 rounded-2xl border border-primary/15 p-8 sm:p-12">
          <Sparkles className="w-8 h-8 text-primary mx-auto mb-3" />
          <h2 className="text-2xl sm:text-3xl font-bold text-ink mb-3">Begin your journey</h2>
          <p className="text-muted max-w-lg mx-auto mb-6">Join a community of verified Shia singles and families finding marriage with intention, privacy, and faith.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/auth/register" className="button primary px-7 py-3 font-semibold inline-flex items-center gap-2">
              Create Your Profile <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/success-stories" className="button secondary px-7 py-3 font-semibold">Read Success Stories</Link>
          </div>
        </motion.div>
      </main>
    </Layout>
  );
}
