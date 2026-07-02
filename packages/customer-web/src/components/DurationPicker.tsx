import { estimateCostCents } from '../lib/pricing';

export interface DurationRange {
  startTime: string;
  endTime: string;
}

interface DurationPreset {
  label: string;
  minutes: number;
}

const PRESETS: DurationPreset[] = [
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
  { label: '4h', minutes: 240 },
  { label: '8h', minutes: 480 },
];

interface DurationPickerProps {
  hourlyRateCents: number;
  startTime: string;
  endTime: string;
  onChange: (range: DurationRange) => void;
  /**
   * Server-authoritative quote total for the current window, once it has
   * resolved. When present it replaces the local estimate for display (the
   * two can differ under pricing rules); `null`/`undefined` keeps the
   * instant local estimate on screen.
   */
  quotedCostCents?: number | null;
}

/**
 * Converts a `datetime-local` input value (which has no timezone — it's
 * whatever the browser's locale is) into a UTC ISO string, and back again,
 * so the rest of the app can keep working in ISO strings end to end.
 */
function localInputToIso(localValue: string): string {
  const local = new Date(localValue);
  return Number.isNaN(local.getTime()) ? '' : local.toISOString();
}

function isoToLocalInput(iso: string): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function matchesPreset(startTime: string, endTime: string, minutes: number): boolean {
  if (!startTime || !endTime) {
    return false;
  }
  const actualMinutes = (new Date(endTime).getTime() - new Date(startTime).getTime()) / (1000 * 60);
  return actualMinutes === minutes;
}

export function DurationPicker({
  hourlyRateCents,
  startTime,
  endTime,
  onChange,
  quotedCostCents,
}: DurationPickerProps) {
  const localEstimateCents = estimateCostCents(hourlyRateCents, startTime, endTime);
  const isConfirmed = quotedCostCents != null;
  const costCents = quotedCostCents ?? localEstimateCents;

  function selectPreset(minutes: number) {
    const start = new Date();
    const end = new Date(start.getTime() + minutes * 60_000);
    onChange({ startTime: start.toISOString(), endTime: end.toISOString() });
  }

  function handleCustomStartChange(value: string) {
    onChange({ startTime: localInputToIso(value), endTime });
  }

  function handleCustomEndChange(value: string) {
    onChange({ startTime, endTime: localInputToIso(value) });
  }

  return (
    <div className="duration-picker">
      <div className="duration-picker-presets" role="group" aria-label="Duration presets">
        {PRESETS.map((preset) => {
          const selected = matchesPreset(startTime, endTime, preset.minutes);
          return (
            <button
              key={preset.label}
              type="button"
              className={`duration-preset-chip${selected ? ' duration-preset-chip-selected' : ''}`}
              aria-pressed={selected}
              onClick={() => selectPreset(preset.minutes)}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="duration-picker-custom">
        <label className="duration-picker-field">
          Start
          <input
            type="datetime-local"
            value={isoToLocalInput(startTime)}
            onChange={(event) => handleCustomStartChange(event.target.value)}
          />
        </label>
        <label className="duration-picker-field">
          End
          <input
            type="datetime-local"
            value={isoToLocalInput(endTime)}
            onChange={(event) => handleCustomEndChange(event.target.value)}
          />
        </label>
      </div>

      {costCents !== null && (
        <p
          className={`duration-picker-cost${isConfirmed ? ' duration-picker-cost-confirmed' : ''}`}
          data-testid="duration-cost-preview"
        >
          Estimated total: <strong>{formatCurrency(costCents)}</strong>
          {isConfirmed && <span className="duration-picker-cost-badge"> (confirmed)</span>}
        </p>
      )}
    </div>
  );
}
