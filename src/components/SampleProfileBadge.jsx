import { Sparkles } from 'lucide-react';
import Tooltip from './Tooltip.jsx';

/**
 * Marks illustrative sample content as such.
 *
 * The seeder in scripts/ creates fully-written profiles so the browse pages are
 * never empty, which is genuinely useful for showing how a complete profile
 * reads. The risk is that a polished sample gets mistaken for a person — a
 * member could invest real feeling in someone who does not exist. So this badge
 * travels with the data: every place a sample profile renders, it says so.
 *
 * Renders nothing for real members, which is the overwhelming majority.
 */
export default function SampleProfileBadge({ className = '' }) {
  return (
    <Tooltip
      content="Sample profile — written by our team to show what a complete profile looks like. This is not a real member and cannot receive messages."
      className={className}
    >
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide"
        style={{
          background: 'rgba(212,175,105,0.18)',
          border: '1px solid rgba(212,175,105,0.55)',
          color: 'var(--color-gold, #d4af37)',
        }}
      >
        <Sparkles className="w-3 h-3" />
        Sample profile
      </span>
    </Tooltip>
  );
}