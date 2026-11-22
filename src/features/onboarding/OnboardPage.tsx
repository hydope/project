// ── Onboarding wizard shell ──────────────────────────────────────────────────
// ~150 lines instead of 900. Owns navigation + publish only; all form logic
// lives in useOnboardingDraft, all validation in validation.ts, all step UI in
// steps/. Memoized children mean only the active step re-renders on keystrokes.

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from '../../lib/motion';
import {
  Check, ChevronLeft, ChevronRight, ClipboardCheck, GraduationCap, Heart,
  Landmark, Moon, Save, Shield, Sparkles, User,
} from 'lucide-react';
import Layout from '../../layouts/MainLayout';
import { useAuth } from '../../lib/auth/AuthContext';
import { api } from '../../lib/api/client';
import { saveMyProfile } from '../../lib/storage';
import { computeProfileCompleteness, ONBOARDING_STEPS } from '../../lib/onboardingData';
import { STEP_COMPONENTS } from './steps/steps';
import { useOnboardingDraft } from './useOnboardingDraft';

const NAV_ICONS = [User, Moon, Landmark, GraduationCap, Heart, Shield, ClipboardCheck];

function CompletenessRing({ value }: { value: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-2" role="status" aria-label={`Profile ${value}% complete`}>
      <svg viewBox="0 0 36 36" className="h-9 w-9" aria-hidden="true">
        <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" className="text-line/30" strokeWidth="3" />
        <circle
          cx="18" cy="18" r={r} fill="none" className="text-primary" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (value / 100) * c}
          transform="rotate(-90 18 18)" style={{ transition: 'stroke-dashoffset 300ms ease' }}
        />
        <text x="18" y="22" textAnchor="middle" className="fill-ink text-[9px] font-bold">{value}%</text>
      </svg>
      <span className="text-xs font-semibold text-muted">Complete</span>
    </div>
  );
}

export default function OnboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const draft = useOnboardingDraft();
  const { step, totalSteps, data, errors } = draft;

  const completeness = useMemo(() => computeProfileCompleteness(data), [data]);
  const ActiveStep = STEP_COMPONENTS[step];
  if (!ActiveStep) return null; // unreachable — steps registry covers 1..7

  const publish = async () => {
    // Persist to the server first. This used to be a local-storage write only
    // (with a TODO to wire the HTTP adapter), which meant every answer the
    // member gave across the 7 steps — religiosity, education, Marja', prayer,
    // modesty, diet — was thrown away the moment they closed the tab, and the
    // browse filters that match on those fields had nothing to match against.
    const age = Number.parseInt(data.age, 10);
    const payload = { ...data, age: Number.isNaN(age) ? null : age };
    delete payload.uid;
    delete payload.completeness;
    delete payload.publishedAt;

    let saved = true;
    try {
      await api.updateProfile('me', payload);
    } catch (err) {
      // Surface it: a silent local-only save is what hid this bug for so long.
      saved = false;
      console.error('[onboard] could not save profile to the server:', err);
    }

    const profile = { ...payload, completeness, publishedAt: new Date().toISOString() };
    saveMyProfile(profile);
    draft.reset();
    navigate(saved ? '/dashboard' : '/settings?saveFailed=1');
  };

  const stepProps = { data, errors, update: draft.update, toggleIn: draft.toggleIn };

  return (
    <Layout>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8 sm:mb-10">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Profile setup
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-ink sm:text-3xl">Build a profile that truly represents you</h1>
              <p className="mt-1 text-sm text-muted" aria-live="polite">
                Step {step} of {totalSteps} — {ONBOARDING_STEPS[step - 1]?.subtitle}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {draft.draftRestored && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                  <Save className="h-3 w-3" aria-hidden="true" /> Draft restored
                </span>
              )}
              <CompletenessRing value={completeness} />
            </div>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-line/20 lg:hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
              initial={false}
              animate={{ width: `${(step / totalSteps) * 100}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            />
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <nav aria-label="Onboarding steps">
            <ol className="hidden space-y-1 lg:sticky lg:top-24 lg:block">
              {ONBOARDING_STEPS.map((s, i) => {
                const Icon = NAV_ICONS[i] ?? User;
                const done = s.id < step;
                const active = s.id === step;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => draft.goTo(s.id)}
                      disabled={s.id > step}
                      aria-current={active ? 'step' : undefined}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                        active ? 'bg-primary/10 ring-1 ring-primary/20' : done ? 'hover:bg-paper-dark' : 'opacity-50'
                      }`}
                    >
                      <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                        active ? 'bg-primary text-white' : done ? 'bg-success/15 text-success' : 'bg-line/20 text-muted'
                      }`}>
                        {done ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
                      </span>
                      <span>
                        <span className={`block text-sm font-semibold ${active ? 'text-primary' : 'text-ink'}`}>{s.title}</span>
                        <span className="block text-xs text-muted">{s.subtitle}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <section>
            <div className="rounded-2xl border border-line/20 bg-surface p-6 sm:p-8">
              <ActiveStep {...stepProps} />
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={draft.back}
                disabled={step === 1}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line/20 px-4 py-2.5 text-sm font-semibold text-ink transition-all hover:border-line/50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back
              </button>
              {step === totalSteps ? (
                <button
                  type="button"
                  onClick={publish}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-dark"
                >
                  Publish profile <Check className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => draft.next(() => void publish())}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-dark"
                >
                  Continue <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </section>
        </div>
      </main>
    </Layout>
  );
}
