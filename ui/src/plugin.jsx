// Component-mode plugin bundle for aw-app-mobile's Health window.
//
// Built by `npm run build` -> ui/dist/mobile.js, the file aw-app.json's
// contributes.frontend.bundle points at. Dynamic-imported by aw-workspace-ui's
// loadComponentPlugin() once the app is installed with "ui:code" granted.
// Same register(host) shape as aw-app-architecture: every component is
// declared INSIDE register(host) and
// closes over `host`, so JSX compiles against the ONE shared React instance
// (react/react-dom stay external — a second React copy breaks hooks).
//
// ---------------------------------------------------------------------------
// WHAT THIS WINDOW IS FOR
//
// ~10M HealthKit samples going back to 2017, across 20 metric types, live in
// aw-backend's Postgres. They were effectively unreadable: the only read path
// was `GET /api/health/samples`, which orders DESC from now with a 1000-row
// cap and no upper bound — 1000 heart-rate readings is about 40 hours, and no
// parameter reached 2019.
//
// So the window never asks for samples first. It asks for the CATALOG (what
// metrics exist, how many rows, and the exact span each covers), then for
// SERVER-AGGREGATED BUCKETS over a chosen window. Raw samples are fetched
// only when you click into a single bucket. That ordering is the design: the
// wire payload is bounded by bucket count (nine years of months = 108 rows),
// never by sample count.
// ---------------------------------------------------------------------------
//
// SIZING AND COLOR ARE INLINE, ON PURPOSE — do not "tidy" them into Tailwind
// classes. An app bundle is loaded into the SPA at runtime, but the SPA's CSS
// was compiled long before, from ITS OWN source. Tailwind only emits the
// arbitrary-value utilities it saw while scanning that source, so a class this
// file invents is simply absent at runtime — silently, and the symptom reads
// as a layout bug (aw-app-architecture lost its whole 240px rail this way).
// Structural utilities (flex, gap-2, px-2, overflow-auto) and the
// [var(--color-*)] colour utilities are safe; core uses them everywhere.

const SLUG = 'mobile';
const WINDOW_ID = 'mobile.health';

const RAIL_WIDTH = 232;

const FS = { title: 14, nav: 13, tab: 12, row: 11.5, mono: 11, label: 10 };

// --- chart palette ---------------------------------------------------------
//
// Fixed hexes rather than var(--color-accent): the accent is theme-dependent
// (amber in the default dark theme, blue in light, something else again in
// dracula) so a chart built on it would change hue per theme and could not be
// validated once. These are slots 1-3 of the reference categorical palette,
// each mode's own steps, and both sets were run through the palette validator
// against this workspace's actual surfaces (#111118 dark / #f1f5f9 light):
// all six checks pass, all-pairs, in both modes.
//
// Only the light mode carries a contrast WARN on slots 2/3, which obligates
// visible labels or a table view — both ship (the Places tab direct-labels
// every source, and every chart has a Table toggle). Slot 1, the hue the main
// single-series chart uses, clears 3:1 in both modes on its own.
const PALETTE = {
  dark:  { s1: '#3987e5', s2: '#d95926', s3: '#199e70' },
  light: { s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a' },
};

const ICON = {
  // Inline SVG only. The container's font stack has no glyph for ⟳ ▶ ▾ ✕ — a
  // unicode symbol renders as a tofu box here, and a *stroked* square reads as
  // tofu too, so anything meant as a dot is filled.
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  close: 'M18 6L6 18M6 6l12 12',
  refresh: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  table: 'M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18',
  chart: 'M3 3v18h18 M7 15l4-6 4 3 5-8',
};

const S = {
  label: { fontSize: FS.label, textTransform: 'uppercase', letterSpacing: '.06em' },
  mono: { fontSize: FS.mono, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
  th: {
    fontSize: FS.label, textTransform: 'uppercase', letterSpacing: '.06em',
    fontWeight: 500, textAlign: 'left', padding: '5px 8px',
    color: 'var(--color-text-muted)',
    borderBottom: '1px solid var(--color-border)',
  },
  td: { fontSize: FS.row, padding: '5px 8px', borderBottom: '1px solid var(--color-border)' },
  btn: {
    fontSize: FS.label, padding: '3px 9px', borderRadius: 6,
    border: '1px solid var(--color-border)', color: 'var(--color-text-muted)',
    background: 'transparent', lineHeight: 1.6, whiteSpace: 'nowrap', cursor: 'pointer',
  },
};

// --- metric knowledge ------------------------------------------------------
//
// The one place that encodes what a metric MEANS, because the aggregate to
// chart is genuinely per-metric and the server has no business guessing: 70
// is a sensible average heart rate, while the average of a day's step-count
// samples is a meaningless number and only their sum is real. Anything not
// listed falls back to `avg` — and a metric with no numeric value at all
// (sleep_analysis, workout: the meaning is in text_value + duration) falls
// back to `duration` from the catalog's numeric_samples count, so a new
// HealthKit type charts sensibly on the day it first syncs rather than
// waiting for this table to be updated.
const METRICS = {
  heart_rate:                  { label: 'Heart rate',        group: 'Heart',     agg: 'avg', decimals: 0 },
  resting_heart_rate:          { label: 'Resting HR',        group: 'Heart',     agg: 'avg', decimals: 0 },
  heart_rate_variability_sdnn: { label: 'HRV (SDNN)',        group: 'Heart',     agg: 'avg', decimals: 0 },
  walking_heart_rate_avg:      { label: 'Walking HR',        group: 'Heart',     agg: 'avg', decimals: 0 },
  step_count:                  { label: 'Steps',             group: 'Activity',  agg: 'sum', decimals: 0 },
  distance_walking_running:    { label: 'Distance',          group: 'Activity',  agg: 'sum', decimals: 1 },
  active_energy_burned:        { label: 'Active energy',     group: 'Activity',  agg: 'sum', decimals: 0 },
  basal_energy_burned:         { label: 'Basal energy',      group: 'Activity',  agg: 'sum', decimals: 0 },
  exercise_time:               { label: 'Exercise time',     group: 'Activity',  agg: 'sum', decimals: 0 },
  stand_time:                  { label: 'Stand time',        group: 'Activity',  agg: 'sum', decimals: 0 },
  flights_climbed:             { label: 'Flights climbed',   group: 'Activity',  agg: 'sum', decimals: 0 },
  workout:                     { label: 'Workouts',          group: 'Activity',  agg: 'duration', decimals: 1 },
  sleep_analysis:              { label: 'Sleep',             group: 'Rest',      agg: 'duration', decimals: 1 },
  mindful_session:             { label: 'Mindful minutes',   group: 'Rest',      agg: 'duration', decimals: 0 },
  respiratory_rate:            { label: 'Respiratory rate',  group: 'Vitals',    agg: 'avg', decimals: 1 },
  oxygen_saturation:           { label: 'Blood oxygen',      group: 'Vitals',    agg: 'avg', decimals: 1 },
  vo2_max:                     { label: 'VO₂ max',           group: 'Vitals',    agg: 'avg', decimals: 1 },
  body_mass:                   { label: 'Weight',            group: 'Body',      agg: 'avg', decimals: 1 },
  body_mass_index:             { label: 'BMI',               group: 'Body',      agg: 'avg', decimals: 1 },
  body_fat_percentage:         { label: 'Body fat',          group: 'Body',      agg: 'avg', decimals: 1 },
};

const GROUP_ORDER = ['Heart', 'Activity', 'Rest', 'Vitals', 'Body', 'Other'];

function metaFor(m) {
  const known = METRICS[m.metric_type];
  if (known) return known;
  return {
    label: m.metric_type.replace(/_/g, ' '),
    group: 'Other',
    // No numeric column at all -> the only quantity it has is elapsed time.
    agg: m.numeric_samples === 0 ? 'duration' : 'avg',
    decimals: 1,
  };
}

const DAY = 86400;
const BUCKET_SPAN = { hour: 3600, day: DAY, week: 7 * DAY, month: 30.44 * DAY };

const RANGES = [
  { id: '7d',  label: '7d',  days: 7 },
  { id: '30d', label: '30d', days: 30 },
  { id: '90d', label: '90d', days: 90 },
  { id: '1y',  label: '1y',  days: 365 },
  { id: '5y',  label: '5y',  days: 365 * 5 },
  { id: 'all', label: 'All', days: null },
];

// A range of 9 years bucketed hourly is 79k points nobody can render or read.
// Picking the bucket from the span means changing the range never produces an
// unusable chart, and the explicit bucket buttons stay available for override.
function autoBucket(spanSeconds) {
  if (spanSeconds <= 3 * DAY) return 'hour';
  if (spanSeconds <= 120 * DAY) return 'day';
  if (spanSeconds <= 3 * 365 * DAY) return 'week';
  return 'month';
}

export function register(host) {
  const { useState, useEffect, useCallback, useMemo, useRef } = host.React;

  const api = (sub, init) => host.sdk.api.fetch(`/api/apps/${SLUG}${sub}`, init);

  const getJson = async (sub) => {
    const r = await api(sub);
    let body = null;
    try { body = await r.json(); } catch { /* non-JSON error page */ }
    if (!r.ok) {
      // The app's routes pass aw-backend's status through, so a 403 from the
      // tenant gate and a 503 from a missing credential arrive distinguishable
      // — worth keeping, because they need different answers from the reader.
      const e = new Error((body && (body.detail || body.error)) || `HTTP ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return body;
  };

  const qs = (params) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== null && v !== undefined && v !== '') p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  // -- formatting ---------------------------------------------------------

  const fmtNum = (v, decimals = 1) => {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    if (Math.abs(v) >= 10000) return Math.round(v).toLocaleString();
    return v.toFixed(decimals);
  };

  const fmtDate = (ts, bucket) => {
    const d = new Date(ts * 1000);
    if (bucket === 'hour') {
      return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    if (bucket === 'month') {
      return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Axis labels are chosen by how much time is ON SCREEN, not by the bucket.
  // Weekly buckets over six years produced "Aug 16 · Jun 16 · Apr 17", which
  // reads as days of the month and hides the years entirely — the same trap a
  // 2-digit year falls into ("Aug 21" for August 2021). Past roughly a year of
  // span, month + four-digit year is both unambiguous and enough resolution.
  const fmtAxisDate = (ts, bucket, spanDays) => {
    const d = new Date(ts * 1000);
    if (bucket === 'hour') return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (bucket === 'month' || spanDays > 300) {
      return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const fmtTime = (ts) =>
    new Date(ts * 1000).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

  const fmtCount = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

  // -- theme-aware palette ------------------------------------------------
  //
  // The workspace ships light themes as well as dark ones, and the reference
  // palette's two modes are SELECTED steps, not an automatic flip — so the
  // right set has to be chosen from the surface actually in effect rather
  // than assumed. Reading the computed --color-bg-primary and taking its
  // relative luminance works for every theme, including ones added later.
  function usePalette() {
    const [mode, setMode] = useState('dark');
    useEffect(() => {
      const read = () => {
        try {
          const raw = getComputedStyle(document.documentElement)
            .getPropertyValue('--color-bg-primary').trim();
          const m = raw.match(/^#([0-9a-f]{6})$/i);
          if (!m) return;
          const n = parseInt(m[1], 16);
          const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
          setMode(lum > 0.5 ? 'light' : 'dark');
        } catch { /* keep the dark default */ }
      };
      read();
      const obs = new MutationObserver(read);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      return () => obs.disconnect();
    }, []);
    return PALETTE[mode];
  }

  // -- shared bits --------------------------------------------------------

  function Icon({ d, size = 12, color = 'currentColor', style }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
           style={{ flexShrink: 0, ...style }}>
        <path d={d} />
      </svg>
    );
  }

  function Empty({ children }) {
    return (
      <div style={{
        padding: '28px 16px', textAlign: 'center', fontSize: FS.row,
        color: 'var(--color-text-muted)', lineHeight: 1.7,
      }}>{children}</div>
    );
  }

  function Toggle({ active, onClick, children, title }) {
    return (
      <button onClick={onClick} title={title}
        style={{
          ...S.btn,
          color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
          borderColor: active ? 'var(--color-border-active)' : 'var(--color-border)',
          background: active ? 'rgba(127,127,160,.12)' : 'transparent',
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>{children}</button>
    );
  }

  // A CALLBACK ref, not useRef + an effect. The measured element is rendered
  // conditionally (there is no plot until the first series arrives), so an
  // effect with [] deps runs once while the ref is still null, observes
  // nothing, and never runs again — the size stays 0 forever and the chart
  // silently keeps its fallback height. A callback ref fires on every attach
  // and detach, so it cannot miss the element appearing later.
  function useMeasure() {
    const [size, setSize] = useState({ width: 0, height: 0 });
    const observer = useRef(null);
    const ref = useCallback((node) => {
      if (observer.current) { observer.current.disconnect(); observer.current = null; }
      if (!node) return;
      const ro = new ResizeObserver((entries) => {
        const r = entries[0].contentRect;
        setSize({ width: r.width, height: r.height });
      });
      ro.observe(node);
      observer.current = ro;
    }, []);
    return [ref, size];
  }

  // -- the chart ----------------------------------------------------------
  //
  // Hand-rolled SVG rather than a charting dependency: the marks needed here
  // are a line, a band and a bar, and a library would arrive with its own
  // stylesheet to fight the workspace's CSS variables over.
  //
  // The x scale is TIME, not bucket index. Buckets with no samples come back
  // absent (a gap is not a zero — charting 0 bpm for a day the watch was off
  // would be a lie), so an index scale would silently close every gap and
  // draw a continuous nine-year line over data that has holes in it.

  // `top` is generous because the newest-value callout is drawn ABOVE the plot
  // area rather than beside the last mark. Anchored to the mark it collided
  // with the data on every bar chart — the last bucket is usually short (a
  // partial month), so an end-anchored label ran left straight across the
  // taller bars behind it.
  const PAD = { top: 26, right: 16, bottom: 24, left: 52 };

  function niceTicks(min, max, count = 4) {
    if (!(max > min)) return [min];
    const raw = (max - min) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
    const out = [];
    for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) out.push(t);
    return out;
  }

  function Chart({ points, bucket, meta, unit, palette, onPick, picked, height: wantHeight }) {
    const [wrapRef, { width }] = useMeasure();
    const [hover, setHover] = useState(null);
    const svgRef = useRef(null);

    // Fills whatever the tab gives it (see ChartTab), clamped so it stays
    // readable in a short window and doesn't become a strip in a tall one.
    const height = Math.max(180, Math.min(wantHeight || 240, 520));
    const W = Math.max(width, 240);
    const innerW = W - PAD.left - PAD.right;
    const innerH = height - PAD.top - PAD.bottom;

    const kind = meta.agg === 'avg' ? 'line' : 'bar';

    const model = useMemo(() => {
      if (!points || points.length === 0) return null;
      const valueOf = (p) => (
        meta.agg === 'sum' ? p.sum
          : meta.agg === 'duration' ? (p.duration_s === null ? null : p.duration_s / 3600)
            : p.avg
      );
      const rows = points.map((p) => ({ ...p, v: valueOf(p) })).filter((p) => p.v !== null);
      if (rows.length === 0) return null;

      const t0 = rows[0].bucket_ts;
      const span = BUCKET_SPAN[bucket] || DAY;
      // The last bucket covers time up to its own end, so the domain has to
      // include it — otherwise the final bar is drawn off the right edge.
      const t1 = rows[rows.length - 1].bucket_ts + span;

      let lo;
      let hi;
      if (kind === 'line') {
        lo = Math.min(...rows.map((r) => (r.min === null ? r.v : r.min)));
        hi = Math.max(...rows.map((r) => (r.max === null ? r.v : r.max)));
        // A flat series (one reading, or a constant) has zero range and would
        // divide by zero; give it a visible band around the value instead.
        if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
        const pad = (hi - lo) * 0.08;
        lo -= pad; hi += pad;
      } else {
        // Bars are read as areas, so their baseline must be zero — starting a
        // bar axis anywhere else exaggerates differences by construction.
        lo = 0;
        hi = Math.max(...rows.map((r) => r.v)) * 1.08 || 1;
      }
      return { rows, t0, t1, lo, hi, span };
    }, [points, bucket, meta.agg, kind]);

    if (!model) {
      return <div ref={wrapRef}><Empty>No samples in this range.</Empty></div>;
    }

    const { rows, t0, t1, lo, hi, span } = model;
    const x = (ts) => PAD.left + ((ts - t0) / (t1 - t0)) * innerW;
    const y = (v) => PAD.top + innerH - ((v - lo) / (hi - lo)) * innerH;

    // 5, not 4: the "nice step" rounding turns a 45-unit range asked for in 4
    // into a step of 20, which leaves a chart with two gridlines on it and no
    // way to read a value off. Asking for 5 lands on 10 and gives four.
    const yTicks = niceTicks(lo, hi, 5);
    // ~1 label per 90px, so the axis never collides with itself at any width.
    const xTickCount = Math.max(2, Math.min(6, Math.floor(innerW / 90)));
    const xTicks = Array.from({ length: xTickCount + 1 }, (_, i) => t0 + ((t1 - t0) * i) / xTickCount);

    const linePath = rows
      .map((r, i) => `${i === 0 ? 'M' : 'L'}${x(r.bucket_ts + span / 2).toFixed(2)},${y(r.v).toFixed(2)}`)
      .join(' ');

    const bandPath = kind === 'line' && rows.some((r) => r.min !== null && r.max !== null)
      ? `${rows.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(r.bucket_ts + span / 2).toFixed(2)},${y(r.max ?? r.v).toFixed(2)}`).join(' ')} `
        + `${rows.slice().reverse().map((r) => `L${x(r.bucket_ts + span / 2).toFixed(2)},${y(r.min ?? r.v).toFixed(2)}`).join(' ')} Z`
      : null;

    // 2px of surface between adjacent bars — the spacer that keeps two bars
    // from reading as one wide mark.
    const barW = Math.max(1, (innerW / ((t1 - t0) / span)) - 2);

    const nearest = (clientX) => {
      const rect = svgRef.current.getBoundingClientRect();
      const px = clientX - rect.left;
      let best = null;
      let bestD = Infinity;
      for (const r of rows) {
        const d = Math.abs(x(r.bucket_ts + span / 2) - px);
        if (d < bestD) { bestD = d; best = r; }
      }
      return best;
    };

    const last = rows[rows.length - 1];

    return (
      <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
        <svg
          ref={svgRef} data-chart="series"
          width="100%" height={height} viewBox={`0 0 ${W} ${height}`}
          style={{ display: 'block', overflow: 'visible' }}
          onMouseMove={(e) => setHover(nearest(e.clientX))}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => { const r = nearest(e.clientX); if (r && onPick) onPick(r); }}
        >
          {/* Recessive grid — present enough to read a value off, never
              competing with the data. */}
          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)}
                    stroke="var(--color-border)" strokeWidth="1" opacity="0.55" />
              <text x={PAD.left - 8} y={y(t) + 3} textAnchor="end"
                    fontSize={FS.label} fill="var(--color-text-muted)">{fmtNum(t, t >= 100 ? 0 : 1)}</text>
            </g>
          ))}

          {xTicks.map((t, i) => (
            <text key={`x${i}`} x={x(t)} y={height - 6}
                  textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
                  fontSize={FS.label} fill="var(--color-text-muted)">
              {fmtAxisDate(t, bucket, (t1 - t0) / DAY)}
            </text>
          ))}

          {bandPath && (
            <path d={bandPath} fill={palette.s1} opacity="0.16" stroke="none" />
          )}

          {kind === 'bar' && rows.map((r) => {
            const isPicked = picked && picked.bucket_ts === r.bucket_ts;
            const isHover = hover && hover.bucket_ts === r.bucket_ts;
            const h = Math.max(1, PAD.top + innerH - y(r.v));
            return (
              <rect key={r.bucket_ts}
                x={x(r.bucket_ts) + 1} y={y(r.v)} width={barW} height={h}
                rx={Math.min(4, barW / 2)}
                fill={palette.s1}
                opacity={isPicked ? 1 : isHover ? 0.92 : 0.78} />
            );
          })}

          {kind === 'line' && (
            <path d={linePath} fill="none" stroke={palette.s1} strokeWidth="2"
                  strokeLinejoin="round" strokeLinecap="round" />
          )}

          {/* Selective direct label: the newest bucket only. A number on every
              point is noise, and this is the one the eye goes to first. It
              sits in the padding above the plot, never over the marks, with a
              swatch tying it to the series — the text itself stays in the
              text token, never the series colour. */}
          <circle cx={W - PAD.right - 4} cy={11} r="4" fill={palette.s1} />
          <text x={W - PAD.right - 13} y={15} textAnchor="end"
                fontSize={FS.mono} fontWeight="600" fill="var(--color-text-primary)">
            {fmtNum(last.v, meta.decimals)}{unit ? ` ${unit}` : ''}
          </text>
          <text x={PAD.left} y={15} textAnchor="start"
                fontSize={FS.label} fill="var(--color-text-muted)"
                style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>
            latest {bucket}
          </text>

          {hover && (
            <g pointerEvents="none">
              <line x1={x(hover.bucket_ts + span / 2)} x2={x(hover.bucket_ts + span / 2)}
                    y1={PAD.top} y2={PAD.top + innerH}
                    stroke="var(--color-text-muted)" strokeWidth="1" opacity="0.5"
                    strokeDasharray="3 3" />
              {kind === 'line' && (
                <circle cx={x(hover.bucket_ts + span / 2)} cy={y(hover.v)} r="4.5"
                        fill={palette.s1} stroke="var(--color-bg-primary)" strokeWidth="2" />
              )}
            </g>
          )}
        </svg>

        {hover && (
          <div style={{
            position: 'absolute', pointerEvents: 'none',
            left: Math.min(Math.max(x(hover.bucket_ts + span / 2) - 70, 0), Math.max(W - 150, 0)),
            top: 4, width: 150,
            background: 'var(--color-bg-header)', border: '1px solid var(--color-border-active)',
            borderRadius: 6, padding: '6px 8px', zIndex: 5,
          }}>
            <div style={{ ...S.label, color: 'var(--color-text-muted)', marginBottom: 3 }}>
              {fmtDate(hover.bucket_ts, bucket)}
            </div>
            <div style={{ fontSize: FS.row, color: 'var(--color-text-primary)', fontWeight: 600 }}>
              {fmtNum(hover.v, meta.decimals)}{unit ? ` ${unit}` : ''}
            </div>
            {hover.min !== null && hover.max !== null && meta.agg === 'avg' && (
              <div style={{ ...S.mono, color: 'var(--color-text-muted)' }}>
                {fmtNum(hover.min, meta.decimals)} – {fmtNum(hover.max, meta.decimals)}
              </div>
            )}
            <div style={{ ...S.mono, color: 'var(--color-text-muted)' }}>
              {hover.samples.toLocaleString()} samples
            </div>
          </div>
        )}
      </div>
    );
  }

  // -- the metric rail ----------------------------------------------------

  function MetricRail({ metrics, selected, onSelect }) {
    const groups = useMemo(() => {
      const by = new Map();
      for (const m of metrics) {
        const g = metaFor(m).group;
        if (!by.has(g)) by.set(g, []);
        by.get(g).push(m);
      }
      return GROUP_ORDER
        .filter((g) => by.has(g))
        .map((g) => [g, by.get(g).sort((a, b) => metaFor(a).label.localeCompare(metaFor(b).label))]);
    }, [metrics]);

    return (
      <div className="overflow-auto" style={{ padding: '6px 6px 12px' }}>
        {groups.map(([group, items]) => (
          <div key={group} style={{ marginBottom: 8 }}>
            <div style={{ ...S.label, color: 'var(--color-text-muted)', padding: '4px 6px' }}>{group}</div>
            {items.map((m) => {
              const isSel = selected === m.metric_type;
              return (
                <div key={m.metric_type} onClick={() => onSelect(m.metric_type)}
                  className="flex items-center gap-2 cursor-pointer"
                  style={{
                    padding: '4px 6px', borderRadius: 5, fontSize: FS.row,
                    background: isSel ? 'rgba(127,127,160,.16)' : 'transparent',
                    color: isSel ? 'var(--color-text-primary)' : 'var(--color-text-primary)',
                    fontWeight: isSel ? 600 : 400,
                  }}>
                  <span className="truncate" style={{ flex: 1 }}>{metaFor(m).label}</span>
                  <span style={{ ...S.mono, color: 'var(--color-text-muted)' }}>
                    {fmtCount(m.samples)}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  // -- drill-down ---------------------------------------------------------

  function BucketDetail({ metricType, bucket, point, meta, onClose }) {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
      let live = true;
      setRows(null); setError(null);
      const span = BUCKET_SPAN[bucket] || DAY;
      // The whole reason the backend route grew an upper bound: this is a
      // window deep in the archive, and asking for it by from/until is the
      // only way to reach it. The old DESC-from-now read could not.
      getJson(`/health/samples${qs({
        metric_type: metricType,
        from_ts: point.bucket_ts,
        until_ts: point.bucket_ts + span,
        order: 'asc',
        limit: 500,
      })}`)
        .then((d) => { if (live) setRows(d.samples || []); })
        .catch((e) => { if (live) setError(e.message); });
      return () => { live = false; };
    }, [metricType, bucket, point.bucket_ts]);

    return (
      <div style={{
        border: '1px solid var(--color-border)', borderRadius: 8,
        background: 'var(--color-bg-secondary)', marginTop: 10, overflow: 'hidden',
      }}>
        <div className="flex items-center gap-2" style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-border)' }}>
          <span style={{ fontSize: FS.tab, color: 'var(--color-text-primary)', fontWeight: 600 }}>
            {fmtDate(point.bucket_ts, bucket)}
          </span>
          <span style={{ ...S.mono, color: 'var(--color-text-muted)' }}>
            {point.samples.toLocaleString()} samples
          </span>
          <button onClick={onClose} style={{ ...S.btn, marginLeft: 'auto', padding: '2px 6px' }}>
            <Icon d={ICON.close} size={11} />
          </button>
        </div>
        <div className="overflow-auto" style={{ maxHeight: 220 }}>
          {error && <Empty>Couldn’t load samples — {error}</Empty>}
          {!error && rows === null && <Empty>Loading…</Empty>}
          {rows && rows.length === 0 && <Empty>No individual samples in this bucket.</Empty>}
          {rows && rows.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={S.th}>When</th>
                  <th style={S.th}>Value</th>
                  <th style={S.th}>Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ ...S.td, ...S.mono, whiteSpace: 'nowrap' }}>{fmtTime(r.start_ts)}</td>
                    <td style={{ ...S.td, color: 'var(--color-text-primary)' }}>
                      {r.value !== null ? `${fmtNum(r.value, meta.decimals)} ${r.unit || ''}` : (r.text_value || '—')}
                    </td>
                    <td style={{ ...S.td, ...S.mono, color: 'var(--color-text-muted)' }}>
                      {(r.source_bundle || '').split('.').pop() || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // -- the chart tab ------------------------------------------------------

  function ChartTab({ metrics, selected, onSelect, palette }) {
    const [rangeId, setRangeId] = useState('90d');
    const [bucketOverride, setBucketOverride] = useState(null);
    const [points, setPoints] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [picked, setPicked] = useState(null);
    const [asTable, setAsTable] = useState(false);
    const [plotRef, plotSize] = useMeasure();

    const metric = metrics.find((m) => m.metric_type === selected);
    const meta = metric ? metaFor(metric) : null;

    // Anchor every range on the metric's LAST sample, not on now. A phone that
    // stopped syncing three months ago would otherwise open on an empty chart
    // and read as "no data", when the truth is "no recent data".
    const window_ = useMemo(() => {
      if (!metric) return null;
      const range = RANGES.find((r) => r.id === rangeId);
      const until = (metric.last_ts || Date.now() / 1000) + 1;
      const from = range.days === null ? metric.first_ts : Math.max(metric.first_ts, until - range.days * DAY);
      return { from, until };
    }, [metric, rangeId]);

    const bucket = useMemo(() => {
      if (!window_) return 'day';
      return bucketOverride || autoBucket(window_.until - window_.from);
    }, [window_, bucketOverride]);

    useEffect(() => { setBucketOverride(null); setPicked(null); }, [selected, rangeId]);

    useEffect(() => {
      if (!metric || !window_) return undefined;
      let live = true;
      setLoading(true); setError(null);
      getJson(`/health/series${qs({
        metric_type: metric.metric_type,
        bucket,
        from_ts: window_.from,
        until_ts: window_.until,
        tz_offset_minutes: -new Date().getTimezoneOffset(),
      })}`)
        .then((d) => { if (live) { setPoints(d.points || []); setLoading(false); } })
        .catch((e) => { if (live) { setError(e.message); setLoading(false); } });
      return () => { live = false; };
    }, [metric && metric.metric_type, bucket, window_ && window_.from, window_ && window_.until]);

    if (!metric) return <Empty>Pick a metric on the left.</Empty>;

    const unit = meta.agg === 'duration' ? 'h' : (metric.unit || '');
    const aggLabel = { avg: 'average', sum: 'total', duration: 'hours' }[meta.agg];

    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Filters in one row above the chart. */}
        <div className="flex items-center gap-2 shrink-0" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
          {RANGES.map((r) => (
            <Toggle key={r.id} active={rangeId === r.id} onClick={() => setRangeId(r.id)}>{r.label}</Toggle>
          ))}
          <span style={{ width: 1, height: 16, background: 'var(--color-border)', margin: '0 2px' }} />
          {['hour', 'day', 'week', 'month'].map((b) => (
            <Toggle key={b} active={bucket === b} onClick={() => setBucketOverride(b)}
                    title={`Group by ${b}`}>{b}</Toggle>
          ))}
          <Toggle active={asTable} onClick={() => setAsTable(!asTable)} title="Table view">
            <Icon d={asTable ? ICON.chart : ICON.table} size={11} />
            {asTable ? 'Chart' : 'Table'}
          </Toggle>
        </div>

        {/* The title names the single series, which is why there is no legend
            box — a one-series legend is a label pretending to be a key. */}
        <div className="shrink-0" style={{ marginBottom: 2 }}>
          <span style={{ fontSize: FS.title, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {meta.label}
          </span>
          <span style={{ fontSize: FS.row, color: 'var(--color-text-muted)', marginLeft: 8 }}>
            {aggLabel} per {bucket}{unit ? ` · ${unit}` : ''}
          </span>
        </div>
        <div className="shrink-0" style={{ ...S.mono, color: 'var(--color-text-muted)', marginBottom: 8 }}>
          {metric.samples.toLocaleString()} samples · {fmtDate(metric.first_ts, 'day')} → {fmtDate(metric.last_ts, 'day')}
          {metric.units_vary && ' · mixed units'}
        </div>

        {error && <Empty>Couldn’t load this metric — {error}</Empty>}
        {!error && loading && points === null && <Empty>Loading…</Empty>}

        {!error && points && asTable && (
          <div className="flex-1 min-h-0 overflow-auto">
            <SeriesTable points={points} bucket={bucket} meta={meta} unit={unit} />
          </div>
        )}

        {!error && points && !asTable && (
          // The plot takes whatever vertical space is left and reports it back
          // to the chart, instead of the chart being a fixed 240px strip with
          // half the window empty under it. `overflow: hidden` stops the
          // measure→render→measure loop a scrolling parent would create.
          <div className="flex flex-col flex-1 min-h-0">
            <div ref={plotRef} className="flex-1 min-h-0" style={{ overflow: 'hidden' }}>
              <Chart points={points} bucket={bucket} meta={meta} unit={unit}
                     palette={palette} onPick={setPicked} picked={picked}
                     height={plotSize.height} />
            </div>
            {points.length > 0 && (
              <div className="shrink-0" style={{ ...S.mono, color: 'var(--color-text-muted)', marginTop: 4 }}>
                Click a {bucket} to see its individual readings.
              </div>
            )}
            {picked && (
              <div className="shrink-0">
                <BucketDetail metricType={metric.metric_type} bucket={bucket} point={picked}
                              meta={meta} onClose={() => setPicked(null)} />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // The table view is not a fallback — it is the accessible equivalent of the
  // chart, and it is what discharges the light-mode contrast WARN on the
  // palette. Same numbers, same order, no colour needed to read them.
  function SeriesTable({ points, bucket, meta, unit }) {
    if (!points.length) return <Empty>No samples in this range.</Empty>;
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={S.th}>{bucket}</th>
            <th style={S.th}>samples</th>
            <th style={S.th}>min</th>
            <th style={S.th}>avg</th>
            <th style={S.th}>max</th>
            <th style={S.th}>{meta.agg === 'duration' ? `hours` : `total${unit ? ` (${unit})` : ''}`}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.bucket_ts}>
              <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{fmtDate(p.bucket_ts, bucket)}</td>
              <td style={{ ...S.td, ...S.mono }}>{p.samples.toLocaleString()}</td>
              <td style={{ ...S.td, ...S.mono }}>{fmtNum(p.min, meta.decimals)}</td>
              <td style={{ ...S.td, ...S.mono }}>{fmtNum(p.avg, meta.decimals)}</td>
              <td style={{ ...S.td, ...S.mono }}>{fmtNum(p.max, meta.decimals)}</td>
              <td style={{ ...S.td, ...S.mono, color: 'var(--color-text-primary)' }}>
                {meta.agg === 'duration'
                  ? fmtNum(p.duration_s === null ? null : p.duration_s / 3600, 1)
                  : fmtNum(p.sum, meta.decimals)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // -- places -------------------------------------------------------------

  function PlacesTab({ palette }) {
    const [days, setDays] = useState(7);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
      let live = true;
      setData(null); setError(null);
      const until = Date.now() / 1000;
      getJson(`/health/locations${qs({ from_ts: until - days * DAY, until_ts: until, limit: 2000 })}`)
        .then((d) => { if (live) setData(d); })
        .catch((e) => { if (live) setError(e.message); });
      return () => { live = false; };
    }, [days]);

    const model = useMemo(() => {
      if (!data || !data.points.length) return null;
      const pts = data.points;
      const lats = pts.map((p) => p.latitude);
      const lons = pts.map((p) => p.longitude);
      const bounds = {
        minLat: Math.min(...lats), maxLat: Math.max(...lats),
        minLon: Math.min(...lons), maxLon: Math.max(...lons),
      };
      const sources = [...new Set(pts.map((p) => p.source))];
      return { pts, bounds, sources };
    }, [data]);

    if (error) return <Empty>Couldn’t load locations — {error}</Empty>;
    if (!data) return <Empty>Loading…</Empty>;

    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center gap-2 shrink-0" style={{ marginBottom: 10 }}>
          {[1, 7, 30, 365].map((d) => (
            <Toggle key={d} active={days === d} onClick={() => setDays(d)}>
              {d === 1 ? '24h' : d === 365 ? '1y' : `${d}d`}
            </Toggle>
          ))}
          <span style={{ ...S.mono, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
            {data.total.toLocaleString()} fixes
            {data.total > data.points.length && ` · showing first ${data.points.length.toLocaleString()}`}
          </span>
        </div>
        {!model ? <Empty>No location fixes in this range.</Empty> : (
          <div className="flex-1 min-h-0 overflow-auto">
            {/* No basemap: this window has no map tile budget and no tile
                credential. A plain lat/lon scatter still answers "did I stay
                put or move around", which is the question the data can
                honestly support here. */}
            <ScatterMap model={model} palette={palette} />
            <div style={{ ...S.mono, color: 'var(--color-text-muted)', marginTop: 8 }}>
              {model.bounds.minLat.toFixed(4)}, {model.bounds.minLon.toFixed(4)}
              {'  →  '}
              {model.bounds.maxLat.toFixed(4)}, {model.bounds.maxLon.toFixed(4)}
            </div>
          </div>
        )}
      </div>
    );
  }

  function ScatterMap({ model, palette }) {
    const [wrapRef, { width }] = useMeasure();
    const height = 300;
    const W = Math.max(width, 240);
    const pad = 16;
    const { bounds, pts, sources } = model;
    const spanLat = Math.max(bounds.maxLat - bounds.minLat, 1e-4);
    const spanLon = Math.max(bounds.maxLon - bounds.minLon, 1e-4);
    const x = (lon) => pad + ((lon - bounds.minLon) / spanLon) * (W - pad * 2);
    // Latitude grows north, screen y grows down.
    const y = (lat) => height - pad - ((lat - bounds.minLat) / spanLat) * (height - pad * 2);

    const colorOf = (src) => [palette.s1, palette.s2, palette.s3][sources.indexOf(src) % 3];

    return (
      <div ref={wrapRef}>
        <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`}
             style={{ display: 'block', border: '1px solid var(--color-border)', borderRadius: 8 }}>
          {pts.map((p, i) => (
            <circle key={i} cx={x(p.longitude)} cy={y(p.latitude)} r="3.2"
                    fill={colorOf(p.source)} opacity="0.7">
              <title>{`${p.source} · ${fmtTime(p.ts)}`}</title>
            </circle>
          ))}
        </svg>
        {/* Two or more sources means a legend is mandatory — identity must
            never be carried by colour alone. */}
        {sources.length >= 2 && (
          <div className="flex items-center gap-3" style={{ marginTop: 6 }}>
            {sources.map((s) => (
              <span key={s} className="flex items-center gap-1" style={{ fontSize: FS.row, color: 'var(--color-text-muted)' }}>
                <svg width="9" height="9" viewBox="0 0 9 9"><circle cx="4.5" cy="4.5" r="4.5" fill={colorOf(s)} /></svg>
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // -- notes --------------------------------------------------------------

  function NotesTab() {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState(null);
    useEffect(() => {
      let live = true;
      getJson(`/health/log${qs({ limit: 200 })}`)
        .then((d) => { if (live) setRows(d.entries || []); })
        .catch((e) => { if (live) setError(e.message); });
      return () => { live = false; };
    }, []);

    if (error) return <Empty>Couldn’t load notes — {error}</Empty>;
    if (!rows) return <Empty>Loading…</Empty>;
    if (!rows.length) return <Empty>No log entries yet. These are the free-text notes logged from chat or the watch.</Empty>;

    return (
      <div className="overflow-auto h-full">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={S.th}>When</th>
              <th style={S.th}>Category</th>
              <th style={S.th}>Note</th>
              <th style={S.th}>Where</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={{ ...S.td, ...S.mono, whiteSpace: 'nowrap' }}>{fmtTime(r.ts)}</td>
                <td style={{ ...S.td, ...S.label, color: 'var(--color-text-muted)' }}>{r.category}</td>
                <td style={{ ...S.td, color: 'var(--color-text-primary)' }}>{r.text}</td>
                <td style={{ ...S.td, color: 'var(--color-text-muted)' }}>
                  {r.location_label || (r.latitude !== null ? `${r.latitude.toFixed(3)}, ${r.longitude.toFixed(3)}` : '—')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // -- the window ---------------------------------------------------------

  const TABS = [
    { id: 'chart', label: 'Metrics' },
    { id: 'places', label: 'Places' },
    { id: 'notes', label: 'Notes' },
  ];

  function HealthWindow() {
    const palette = usePalette();
    const [tab, setTab] = useState('chart');
    const [metrics, setMetrics] = useState(null);
    const [selected, setSelected] = useState(null);
    const [error, setError] = useState(null);
    const [status, setStatus] = useState(null);

    const load = useCallback(() => {
      setError(null);
      getJson('/health/status')
        .then((s) => {
          setStatus(s);
          if (!s.configured) return null;
          return getJson('/health/metrics');
        })
        .then((d) => {
          if (!d) return;
          const list = d.metrics || [];
          setMetrics(list);
          setSelected((cur) => cur || (
            // Open on heart rate when it exists — it is the densest series and
            // the one that makes the window immediately look like something.
            list.find((m) => m.metric_type === 'heart_rate') ? 'heart_rate'
              : (list[0] && list[0].metric_type) || null
          ));
        })
        .catch((e) => setError(e));
    }, []);

    useEffect(load, [load]);

    if (error) {
      return (
        <Empty>
          <div style={{ color: 'var(--color-text-primary)', marginBottom: 6 }}>
            Couldn’t reach the health data.
          </div>
          <div>{error.message}</div>
          {error.status === 403 && (
            <div style={{ marginTop: 8 }}>
              This workspace doesn’t own the health dataset — it lives with the
              workspace on the legacy schema.
            </div>
          )}
          {/* A 404 is not "your data is missing" — it is aw-backend answering
              that the route itself is not there, which happens for exactly one
              reason: that service is still running a build without it. Left as
              a bare "Not Found" this reads as a bug in the window, and the
              person seeing it has no way to know the fix is a deploy. */}
          {error.status === 404 && (
            <div style={{ marginTop: 8 }}>
              aw-backend has no
              <span style={{ ...S.mono }}> /api/workspaces/&lt;slug&gt;/health </span>
              route — it is running a build from before this feature. The data
              is fine; the service needs deploying.
            </div>
          )}
          <button onClick={load} style={{ ...S.btn, marginTop: 12 }}>
            <Icon d={ICON.refresh} size={11} /> Retry
          </button>
        </Empty>
      );
    }

    if (status && !status.configured) {
      return (
        <Empty>
          <div style={{ color: 'var(--color-text-primary)', marginBottom: 6 }}>
            No route to the health data.
          </div>
          <div>
            The samples live in aw-backend, and this workspace has no
            <span style={{ ...S.mono }}> AW_WORKSPACE_HOST_TOKEN </span>
            to reach it with — that credential is minted by the aw-remote-host
            <span style={{ ...S.mono }}> /link </span> handshake.
          </div>
        </Empty>
      );
    }

    if (!metrics) return <Empty>Loading…</Empty>;
    if (!metrics.length) return <Empty>No health samples have been synced yet.</Empty>;

    return (
      <div className="flex h-full min-h-0" style={{ background: 'var(--color-bg-primary)' }}>
        <div className="flex flex-col min-h-0"
             style={{ width: RAIL_WIDTH, flexShrink: 0, borderRight: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2 shrink-0"
               style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)' }}>
            <Icon d={ICON.activity} size={13} color="var(--color-text-muted)" />
            <span style={{ fontSize: FS.title, fontWeight: 600, color: 'var(--color-text-primary)' }}>Health</span>
          </div>
          <MetricRail metrics={metrics} selected={selected} onSelect={setSelected} />
        </div>

        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <div className="flex items-center gap-1 shrink-0"
               style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-border)' }}>
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  ...S.btn, borderColor: 'transparent',
                  color: tab === t.id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  fontSize: FS.tab, fontWeight: tab === t.id ? 600 : 400,
                  background: tab === t.id ? 'rgba(127,127,160,.14)' : 'transparent',
                }}>{t.label}</button>
            ))}
          </div>
          <div className="flex-1 min-h-0" style={{ padding: 12 }}>
            {tab === 'chart' && (
              <ChartTab metrics={metrics} selected={selected} onSelect={setSelected} palette={palette} />
            )}
            {tab === 'places' && <PlacesTab palette={palette} />}
            {tab === 'notes' && <NotesTab />}
          </div>
        </div>
      </div>
    );
  }

  host.registerWindow(WINDOW_ID, HealthWindow);
  // Health lives in the Apps grid only (contributes.windows below), not in
  // the Workspace popover — the core.nav.workspace registration this used to
  // do here was removed on 2026-08-18.
}

export default register;
