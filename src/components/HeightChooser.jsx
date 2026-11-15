import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cmToFeetInches, cmToHeightParts, heightPartsToCm } from '../lib/height';

// Height chooser (2026-11-14) — pickers, not typing. The free-text field
// it replaces rejected valid heights on phones: iOS/Android smart
// punctuation rewrites 5'10" with curly quotes the parser refused.
// Parts ({ feet, inches }) are the form's own state, held independently
// and never derived back from an assembled string (the DOB lesson);
// cm is derived only when read. A centimetres mode serves members who
// know their height metrically — its options are labelled with the
// feet/inches form profiles actually display.
const FEET_OPTIONS = [3, 4, 5, 6, 7];
const INCH_OPTIONS = Array.from({ length: 12 }, (_, i) => i);
const CM_OPTIONS = Array.from({ length: 101 }, (_, i) => 120 + i);

const selectCls = (compact) =>
  `w-full ${compact ? 'px-3 py-2 text-[13px]' : 'px-4 py-3 text-sm'} rounded-xl border border-line/30 bg-elevated text-ink focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all appearance-none pr-9`;

function Picker({ value, onChange, ariaLabel, placeholder, options, compact }) {
  return (
    <div className="relative flex-1">
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={ariaLabel}
        className={selectCls(compact)}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronRight className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-muted pointer-events-none" />
    </div>
  );
}

export default function HeightChooser({ parts, onChange, ariaLabel = 'Height', compact = false }) {
  const [unit, setUnit] = useState('ft');
  const cm = heightPartsToCm(parts);
  const anyPicked = Boolean(parts?.feet || parts?.inches);

  const setPart = (key, v) => onChange({ feet: parts?.feet || '', inches: parts?.inches || '', [key]: v });
  const setCm = (v) => onChange(v === '' ? { feet: '', inches: '' } : cmToHeightParts(Number(v)));
  const clear = () => onChange({ feet: '', inches: '' });

  return (
    <div>
      <div className="flex items-start gap-2">
        {unit === 'ft' ? (
          <>
            <Picker value={parts?.feet || ''} onChange={v => setPart('feet', v)} compact={compact}
              ariaLabel={`${ariaLabel} — feet`} placeholder="Feet"
              options={FEET_OPTIONS.map(f => ({ value: String(f), label: `${f} ft` }))} />
            <Picker value={parts?.inches || ''} onChange={v => setPart('inches', v)} compact={compact}
              ariaLabel={`${ariaLabel} — inches`} placeholder="Inches"
              options={INCH_OPTIONS.map(i => ({ value: String(i), label: `${i} in` }))} />
          </>
        ) : (
          <Picker value={cm === null ? '' : String(cm)} onChange={setCm} compact={compact}
            ariaLabel={`${ariaLabel} — centimetres`} placeholder="Centimetres"
            options={CM_OPTIONS.map(c => ({ value: String(c), label: `${c} cm · ${cmToFeetInches(c)}` }))} />
        )}
        <div className="flex flex-col gap-1 pt-0.5" role="group" aria-label={`${ariaLabel} — units`}>
          {['ft', 'cm'].map(u => (
            <button key={u} type="button" onClick={() => setUnit(u)} aria-pressed={unit === u}
              className={`${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} rounded-lg font-semibold border transition-colors ${unit === u ? 'bg-primary text-white border-primary' : 'border-line/30 text-muted hover:border-primary/40'}`}>
              {u === 'ft' ? 'ft / in' : 'cm'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between mt-1.5 min-h-[1rem]">
        <p className="text-xs text-muted">
          {cm !== null
            ? <>Shows on profiles as <span className="font-semibold text-ink">{cmToFeetInches(cm)}</span></>
            : anyPicked
              ? 'Pick both feet and inches'
              : ''}
        </p>
        {anyPicked && (
          <button type="button" onClick={clear} className="text-xs font-semibold text-primary hover:underline">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
