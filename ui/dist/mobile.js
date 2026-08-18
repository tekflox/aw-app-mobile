const Te = "mobile", $e = "mobile.health";
const _ = { title: 14, tab: 12, row: 11.5, mono: 11, label: 10 }, Re = {
  dark: { s1: "#3987e5", s2: "#d95926", s3: "#199e70" },
  light: { s1: "#2a78d6", s2: "#eb6834", s3: "#1baf7a" }
}, K = {
  // Inline SVG only. The container's font stack has no glyph for ⟳ ▶ ▾ ✕ — a
  // unicode symbol renders as a tofu box here, and a *stroked* square reads as
  // tofu too, so anything meant as a dot is filled.
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  close: "M18 6L6 18M6 6l12 12",
  refresh: "M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  table: "M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18",
  chart: "M3 3v18h18 M7 15l4-6 4 3 5-8"
}, o = {
  label: { fontSize: _.label, textTransform: "uppercase", letterSpacing: ".06em" },
  mono: { fontSize: _.mono, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  th: {
    fontSize: _.label,
    textTransform: "uppercase",
    letterSpacing: ".06em",
    fontWeight: 500,
    textAlign: "left",
    padding: "5px 8px",
    color: "var(--color-text-muted)",
    borderBottom: "1px solid var(--color-border)"
  },
  td: { fontSize: _.row, padding: "5px 8px", borderBottom: "1px solid var(--color-border)" },
  btn: {
    fontSize: _.label,
    padding: "3px 9px",
    borderRadius: 6,
    border: "1px solid var(--color-border)",
    color: "var(--color-text-muted)",
    background: "transparent",
    lineHeight: 1.6,
    whiteSpace: "nowrap",
    cursor: "pointer"
  }
}, Ce = {
  heart_rate: { label: "Heart rate", group: "Heart", agg: "avg", decimals: 0 },
  resting_heart_rate: { label: "Resting HR", group: "Heart", agg: "avg", decimals: 0 },
  heart_rate_variability_sdnn: { label: "HRV (SDNN)", group: "Heart", agg: "avg", decimals: 0 },
  walking_heart_rate_avg: { label: "Walking HR", group: "Heart", agg: "avg", decimals: 0 },
  step_count: { label: "Steps", group: "Activity", agg: "sum", decimals: 0 },
  distance_walking_running: { label: "Distance", group: "Activity", agg: "sum", decimals: 1 },
  active_energy_burned: { label: "Active energy", group: "Activity", agg: "sum", decimals: 0 },
  basal_energy_burned: { label: "Basal energy", group: "Activity", agg: "sum", decimals: 0 },
  exercise_time: { label: "Exercise time", group: "Activity", agg: "sum", decimals: 0 },
  stand_time: { label: "Stand time", group: "Activity", agg: "sum", decimals: 0 },
  flights_climbed: { label: "Flights climbed", group: "Activity", agg: "sum", decimals: 0 },
  workout: { label: "Workouts", group: "Activity", agg: "duration", decimals: 1 },
  sleep_analysis: { label: "Sleep", group: "Rest", agg: "duration", decimals: 1 },
  mindful_session: { label: "Mindful minutes", group: "Rest", agg: "duration", decimals: 0 },
  respiratory_rate: { label: "Respiratory rate", group: "Vitals", agg: "avg", decimals: 1 },
  oxygen_saturation: { label: "Blood oxygen", group: "Vitals", agg: "avg", decimals: 1 },
  vo2_max: { label: "VO₂ max", group: "Vitals", agg: "avg", decimals: 1 },
  body_mass: { label: "Weight", group: "Body", agg: "avg", decimals: 1 },
  body_mass_index: { label: "BMI", group: "Body", agg: "avg", decimals: 1 },
  body_fat_percentage: { label: "Body fat", group: "Body", agg: "avg", decimals: 1 }
}, We = ["Heart", "Activity", "Rest", "Vitals", "Body", "Other"];
function X(e) {
  const p = Ce[e.metric_type];
  return p || {
    label: e.metric_type.replace(/_/g, " "),
    group: "Other",
    // No numeric column at all -> the only quantity it has is elapsed time.
    agg: e.numeric_samples === 0 ? "duration" : "avg",
    decimals: 1
  };
}
const B = 86400, ce = { hour: 3600, day: B, week: 7 * B, month: 30.44 * B }, de = [
  { id: "7d", label: "7d", days: 7 },
  { id: "30d", label: "30d", days: 30 },
  { id: "90d", label: "90d", days: 90 },
  { id: "1y", label: "1y", days: 365 },
  { id: "5y", label: "5y", days: 365 * 5 },
  { id: "all", label: "All", days: null }
];
function Ae(e) {
  return e <= 3 * B ? "hour" : e <= 120 * B ? "day" : e <= 3 * 365 * B ? "week" : "month";
}
function Be(e) {
  const { useState: p, useEffect: O, useCallback: ae, useMemo: j, useRef: ne } = e.React, ue = (t, l) => e.sdk.api.fetch(`/api/apps/${Te}${t}`, l), V = async (t) => {
    const l = await ue(t);
    let a = null;
    try {
      a = await l.json();
    } catch {
    }
    if (!l.ok) {
      const n = new Error(a && (a.detail || a.error) || `HTTP ${l.status}`);
      throw n.status = l.status, n;
    }
    return a;
  }, q = (t) => {
    const l = new URLSearchParams();
    for (const [n, r] of Object.entries(t))
      r != null && r !== "" && l.set(n, String(r));
    const a = l.toString();
    return a ? `?${a}` : "";
  }, C = (t, l = 1) => t == null || Number.isNaN(t) ? "—" : Math.abs(t) >= 1e4 ? Math.round(t).toLocaleString() : t.toFixed(l), G = (t, l) => {
    const a = new Date(t * 1e3);
    return l === "hour" ? a.toLocaleString(void 0, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : l === "month" ? a.toLocaleDateString(void 0, { month: "short", year: "numeric" }) : a.toLocaleDateString(void 0, { month: "short", day: "numeric", year: "numeric" });
  }, me = (t, l, a) => {
    const n = new Date(t * 1e3);
    return l === "hour" ? n.toLocaleTimeString(void 0, { hour: "2-digit", minute: "2-digit" }) : l === "month" || a > 300 ? n.toLocaleDateString(void 0, { month: "short", year: "numeric" }) : n.toLocaleDateString(void 0, { month: "short", day: "numeric" });
  }, te = (t) => new Date(t * 1e3).toLocaleString(void 0, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }), he = (t) => t >= 1e3 ? `${(t / 1e3).toFixed(t >= 1e4 ? 0 : 1)}k` : String(t);
  function ge() {
    const [t, l] = p("dark");
    return O(() => {
      const a = () => {
        try {
          const i = getComputedStyle(document.documentElement).getPropertyValue("--color-bg-primary").trim().match(/^#([0-9a-f]{6})$/i);
          if (!i) return;
          const c = parseInt(i[1], 16), d = (0.2126 * (c >> 16 & 255) + 0.7152 * (c >> 8 & 255) + 0.0722 * (c & 255)) / 255;
          l(d > 0.5 ? "light" : "dark");
        } catch {
        }
      };
      a();
      const n = new MutationObserver(a);
      return n.observe(document.documentElement, { attributes: !0, attributeFilter: ["class", "data-theme", "style"] }), () => n.disconnect();
    }, []), Re[t];
  }
  function J({ d: t, size: l = 12, color: a = "currentColor", style: n }) {
    return /* @__PURE__ */ e.h(
      "svg",
      {
        width: l,
        height: l,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: a,
        strokeWidth: "2",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        style: { flexShrink: 0, ...n }
      },
      /* @__PURE__ */ e.h("path", { d: t })
    );
  }
  function k({ children: t }) {
    return /* @__PURE__ */ e.h("div", { style: {
      padding: "28px 16px",
      textAlign: "center",
      fontSize: _.row,
      color: "var(--color-text-muted)",
      lineHeight: 1.7
    } }, t);
  }
  function Y({ active: t, onClick: l, children: a, title: n }) {
    return /* @__PURE__ */ e.h(
      "button",
      {
        onClick: l,
        title: n,
        style: {
          ...o.btn,
          color: t ? "var(--color-text-primary)" : "var(--color-text-muted)",
          borderColor: t ? "var(--color-border-active)" : "var(--color-border)",
          background: t ? "rgba(127,127,160,.12)" : "transparent",
          display: "inline-flex",
          alignItems: "center",
          gap: 5
        }
      },
      a
    );
  }
  function le() {
    const [t, l] = p({ width: 0, height: 0 }), a = ne(null);
    return [ae((r) => {
      if (a.current && (a.current.disconnect(), a.current = null), !r) return;
      const i = new ResizeObserver((c) => {
        const d = c[0].contentRect;
        l({ width: d.width, height: d.height });
      });
      i.observe(r), a.current = i;
    }, []), t];
  }
  const S = { top: 26, right: 16, bottom: 24, left: 52 };
  function pe(t, l, a = 4) {
    if (!(l > t)) return [t];
    const n = (l - t) / a, r = Math.pow(10, Math.floor(Math.log10(n))), i = n / r, c = (i >= 5 ? 10 : i >= 2 ? 5 : i >= 1 ? 2 : 1) * r, d = [];
    for (let u = Math.ceil(t / c) * c; u <= l + 1e-9; u += c) d.push(u);
    return d;
  }
  function fe({ points: t, bucket: l, meta: a, unit: n, palette: r, onPick: i, picked: c, height: d }) {
    const [u, { width: g }] = le(), [m, w] = p(null), x = ne(null), b = Math.max(180, Math.min(d || 240, 520)), M = Math.max(g, 240), f = M - S.left - S.right, $ = b - S.top - S.bottom, E = a.agg === "avg" ? "line" : "bar", Z = j(() => {
      if (!t || t.length === 0) return null;
      const s = (T) => a.agg === "sum" ? T.sum : a.agg === "duration" ? T.duration_s === null ? null : T.duration_s / 3600 : T.avg, v = t.map((T) => ({ ...T, v: s(T) })).filter((T) => T.v !== null);
      if (v.length === 0) return null;
      const U = v[0].bucket_ts, P = ce[l] || B, ee = v[v.length - 1].bucket_ts + P;
      let D, H;
      if (E === "line") {
        D = Math.min(...v.map((I) => I.min === null ? I.v : I.min)), H = Math.max(...v.map((I) => I.max === null ? I.v : I.max)), H - D < 1e-9 && (D -= 1, H += 1);
        const T = (H - D) * 0.08;
        D -= T, H += T;
      } else
        D = 0, H = Math.max(...v.map((T) => T.v)) * 1.08 || 1;
      return { rows: v, t0: U, t1: ee, lo: D, hi: H, span: P };
    }, [t, l, a.agg, E]);
    if (!Z)
      return /* @__PURE__ */ e.h("div", { ref: u }, /* @__PURE__ */ e.h(k, null, "No samples in this range."));
    const { rows: z, t0: y, t1: W, lo: L, hi: A, span: N } = Z, R = (s) => S.left + (s - y) / (W - y) * f, h = (s) => S.top + $ - (s - L) / (A - L) * $, F = pe(L, A, 5), re = Math.max(2, Math.min(6, Math.floor(f / 90))), Q = Array.from({ length: re + 1 }, (s, v) => y + (W - y) * v / re), Le = z.map((s, v) => `${v === 0 ? "M" : "L"}${R(s.bucket_ts + N / 2).toFixed(2)},${h(s.v).toFixed(2)}`).join(" "), oe = E === "line" && z.some((s) => s.min !== null && s.max !== null) ? `${z.map((s, v) => `${v === 0 ? "M" : "L"}${R(s.bucket_ts + N / 2).toFixed(2)},${h(s.max ?? s.v).toFixed(2)}`).join(" ")} ${z.slice().reverse().map((s) => `L${R(s.bucket_ts + N / 2).toFixed(2)},${h(s.min ?? s.v).toFixed(2)}`).join(" ")} Z` : null, ie = Math.max(1, f / ((W - y) / N) - 2), se = (s) => {
      const v = x.current.getBoundingClientRect(), U = s - v.left;
      let P = null, ee = 1 / 0;
      for (const D of z) {
        const H = Math.abs(R(D.bucket_ts + N / 2) - U);
        H < ee && (ee = H, P = D);
      }
      return P;
    }, Ne = z[z.length - 1];
    return /* @__PURE__ */ e.h("div", { ref: u, style: { position: "relative", width: "100%" } }, /* @__PURE__ */ e.h(
      "svg",
      {
        ref: x,
        "data-chart": "series",
        width: "100%",
        height: b,
        viewBox: `0 0 ${M} ${b}`,
        style: { display: "block", overflow: "visible" },
        onMouseMove: (s) => w(se(s.clientX)),
        onMouseLeave: () => w(null),
        onClick: (s) => {
          const v = se(s.clientX);
          v && i && i(v);
        }
      },
      F.map((s) => /* @__PURE__ */ e.h("g", { key: `y${s}` }, /* @__PURE__ */ e.h(
        "line",
        {
          x1: S.left,
          x2: M - S.right,
          y1: h(s),
          y2: h(s),
          stroke: "var(--color-border)",
          strokeWidth: "1",
          opacity: "0.55"
        }
      ), /* @__PURE__ */ e.h(
        "text",
        {
          x: S.left - 8,
          y: h(s) + 3,
          textAnchor: "end",
          fontSize: _.label,
          fill: "var(--color-text-muted)"
        },
        C(s, s >= 100 ? 0 : 1)
      ))),
      Q.map((s, v) => /* @__PURE__ */ e.h(
        "text",
        {
          key: `x${v}`,
          x: R(s),
          y: b - 6,
          textAnchor: v === 0 ? "start" : v === Q.length - 1 ? "end" : "middle",
          fontSize: _.label,
          fill: "var(--color-text-muted)"
        },
        me(s, l, (W - y) / B)
      )),
      oe && /* @__PURE__ */ e.h("path", { d: oe, fill: r.s1, opacity: "0.16", stroke: "none" }),
      E === "bar" && z.map((s) => {
        const v = c && c.bucket_ts === s.bucket_ts, U = m && m.bucket_ts === s.bucket_ts, P = Math.max(1, S.top + $ - h(s.v));
        return /* @__PURE__ */ e.h(
          "rect",
          {
            key: s.bucket_ts,
            x: R(s.bucket_ts) + 1,
            y: h(s.v),
            width: ie,
            height: P,
            rx: Math.min(4, ie / 2),
            fill: r.s1,
            opacity: v ? 1 : U ? 0.92 : 0.78
          }
        );
      }),
      E === "line" && /* @__PURE__ */ e.h(
        "path",
        {
          d: Le,
          fill: "none",
          stroke: r.s1,
          strokeWidth: "2",
          strokeLinejoin: "round",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ e.h("circle", { cx: M - S.right - 4, cy: 11, r: "4", fill: r.s1 }),
      /* @__PURE__ */ e.h(
        "text",
        {
          x: M - S.right - 13,
          y: 15,
          textAnchor: "end",
          fontSize: _.mono,
          fontWeight: "600",
          fill: "var(--color-text-primary)"
        },
        C(Ne.v, a.decimals),
        n ? ` ${n}` : ""
      ),
      /* @__PURE__ */ e.h(
        "text",
        {
          x: S.left,
          y: 15,
          textAnchor: "start",
          fontSize: _.label,
          fill: "var(--color-text-muted)",
          style: { textTransform: "uppercase", letterSpacing: ".06em" }
        },
        "latest ",
        l
      ),
      m && /* @__PURE__ */ e.h("g", { pointerEvents: "none" }, /* @__PURE__ */ e.h(
        "line",
        {
          x1: R(m.bucket_ts + N / 2),
          x2: R(m.bucket_ts + N / 2),
          y1: S.top,
          y2: S.top + $,
          stroke: "var(--color-text-muted)",
          strokeWidth: "1",
          opacity: "0.5",
          strokeDasharray: "3 3"
        }
      ), E === "line" && /* @__PURE__ */ e.h(
        "circle",
        {
          cx: R(m.bucket_ts + N / 2),
          cy: h(m.v),
          r: "4.5",
          fill: r.s1,
          stroke: "var(--color-bg-primary)",
          strokeWidth: "2"
        }
      ))
    ), m && /* @__PURE__ */ e.h("div", { style: {
      position: "absolute",
      pointerEvents: "none",
      left: Math.min(Math.max(R(m.bucket_ts + N / 2) - 70, 0), Math.max(M - 150, 0)),
      top: 4,
      width: 150,
      background: "var(--color-bg-header)",
      border: "1px solid var(--color-border-active)",
      borderRadius: 6,
      padding: "6px 8px",
      zIndex: 5
    } }, /* @__PURE__ */ e.h("div", { style: { ...o.label, color: "var(--color-text-muted)", marginBottom: 3 } }, G(m.bucket_ts, l)), /* @__PURE__ */ e.h("div", { style: { fontSize: _.row, color: "var(--color-text-primary)", fontWeight: 600 } }, C(m.v, a.decimals), n ? ` ${n}` : ""), m.min !== null && m.max !== null && a.agg === "avg" && /* @__PURE__ */ e.h("div", { style: { ...o.mono, color: "var(--color-text-muted)" } }, C(m.min, a.decimals), " – ", C(m.max, a.decimals)), /* @__PURE__ */ e.h("div", { style: { ...o.mono, color: "var(--color-text-muted)" } }, m.samples.toLocaleString(), " samples")));
  }
  function ye({ metrics: t, selected: l, onSelect: a }) {
    const n = j(() => {
      const r = /* @__PURE__ */ new Map();
      for (const i of t) {
        const c = X(i).group;
        r.has(c) || r.set(c, []), r.get(c).push(i);
      }
      return We.filter((i) => r.has(i)).map((i) => [i, r.get(i).sort((c, d) => X(c).label.localeCompare(X(d).label))]);
    }, [t]);
    return /* @__PURE__ */ e.h("div", { className: "overflow-auto", style: { padding: "6px 6px 12px" } }, n.map(([r, i]) => /* @__PURE__ */ e.h("div", { key: r, style: { marginBottom: 8 } }, /* @__PURE__ */ e.h("div", { style: { ...o.label, color: "var(--color-text-muted)", padding: "4px 6px" } }, r), i.map((c) => {
      const d = l === c.metric_type;
      return /* @__PURE__ */ e.h(
        "div",
        {
          key: c.metric_type,
          onClick: () => a(c.metric_type),
          className: "flex items-center gap-2 cursor-pointer",
          style: {
            padding: "4px 6px",
            borderRadius: 5,
            fontSize: _.row,
            background: d ? "rgba(127,127,160,.16)" : "transparent",
            color: "var(--color-text-primary)",
            fontWeight: d ? 600 : 400
          }
        },
        /* @__PURE__ */ e.h("span", { className: "truncate", style: { flex: 1 } }, X(c).label),
        /* @__PURE__ */ e.h("span", { style: { ...o.mono, color: "var(--color-text-muted)" } }, he(c.samples))
      );
    }))));
  }
  function ve({ metricType: t, bucket: l, point: a, meta: n, onClose: r }) {
    const [i, c] = p(null), [d, u] = p(null);
    return O(() => {
      let g = !0;
      c(null), u(null);
      const m = ce[l] || B;
      return V(`/health/samples${q({
        metric_type: t,
        from_ts: a.bucket_ts,
        until_ts: a.bucket_ts + m,
        order: "asc",
        limit: 500
      })}`).then((w) => {
        g && c(w.samples || []);
      }).catch((w) => {
        g && u(w.message);
      }), () => {
        g = !1;
      };
    }, [t, l, a.bucket_ts]), /* @__PURE__ */ e.h("div", { style: {
      border: "1px solid var(--color-border)",
      borderRadius: 8,
      background: "var(--color-bg-secondary)",
      marginTop: 10,
      overflow: "hidden"
    } }, /* @__PURE__ */ e.h("div", { className: "flex items-center gap-2", style: { padding: "6px 10px", borderBottom: "1px solid var(--color-border)" } }, /* @__PURE__ */ e.h("span", { style: { fontSize: _.tab, color: "var(--color-text-primary)", fontWeight: 600 } }, G(a.bucket_ts, l)), /* @__PURE__ */ e.h("span", { style: { ...o.mono, color: "var(--color-text-muted)" } }, a.samples.toLocaleString(), " samples"), /* @__PURE__ */ e.h("button", { onClick: r, style: { ...o.btn, marginLeft: "auto", padding: "2px 6px" } }, /* @__PURE__ */ e.h(J, { d: K.close, size: 11 }))), /* @__PURE__ */ e.h("div", { className: "overflow-auto", style: { maxHeight: 220 } }, d && /* @__PURE__ */ e.h(k, null, "Couldn’t load samples — ", d), !d && i === null && /* @__PURE__ */ e.h(k, null, "Loading…"), i && i.length === 0 && /* @__PURE__ */ e.h(k, null, "No individual samples in this bucket."), i && i.length > 0 && /* @__PURE__ */ e.h("table", { style: { width: "100%", borderCollapse: "collapse" } }, /* @__PURE__ */ e.h("thead", null, /* @__PURE__ */ e.h("tr", null, /* @__PURE__ */ e.h("th", { style: o.th }, "When"), /* @__PURE__ */ e.h("th", { style: o.th }, "Value"), /* @__PURE__ */ e.h("th", { style: o.th }, "Source"))), /* @__PURE__ */ e.h("tbody", null, i.map((g, m) => /* @__PURE__ */ e.h("tr", { key: m }, /* @__PURE__ */ e.h("td", { style: { ...o.td, ...o.mono, whiteSpace: "nowrap" } }, te(g.start_ts)), /* @__PURE__ */ e.h("td", { style: { ...o.td, color: "var(--color-text-primary)" } }, g.value !== null ? `${C(g.value, n.decimals)} ${g.unit || ""}` : g.text_value || "—"), /* @__PURE__ */ e.h("td", { style: { ...o.td, ...o.mono, color: "var(--color-text-muted)" } }, (g.source_bundle || "").split(".").pop() || "—")))))));
  }
  function xe({ metrics: t, selected: l, onSelect: a, palette: n }) {
    const [r, i] = p("90d"), [c, d] = p(null), [u, g] = p(null), [m, w] = p(null), [x, b] = p(!1), [M, f] = p(null), [$, E] = p(!1), [Z, z] = le(), y = t.find((h) => h.metric_type === l), W = y ? X(y) : null, L = j(() => {
      if (!y) return null;
      const h = de.find((Q) => Q.id === r), F = (y.last_ts || Date.now() / 1e3) + 1;
      return { from: h.days === null ? y.first_ts : Math.max(y.first_ts, F - h.days * B), until: F };
    }, [y, r]), A = j(() => L ? c || Ae(L.until - L.from) : "day", [L, c]);
    if (O(() => {
      d(null), f(null);
    }, [l, r]), O(() => {
      if (!y || !L) return;
      let h = !0;
      return b(!0), w(null), V(`/health/series${q({
        metric_type: y.metric_type,
        bucket: A,
        from_ts: L.from,
        until_ts: L.until,
        tz_offset_minutes: -(/* @__PURE__ */ new Date()).getTimezoneOffset()
      })}`).then((F) => {
        h && (g(F.points || []), b(!1));
      }).catch((F) => {
        h && (w(F.message), b(!1));
      }), () => {
        h = !1;
      };
    }, [y && y.metric_type, A, L && L.from, L && L.until]), !y) return /* @__PURE__ */ e.h(k, null, "Pick a metric on the left.");
    const N = W.agg === "duration" ? "h" : y.unit || "", R = { avg: "average", sum: "total", duration: "hours" }[W.agg];
    return /* @__PURE__ */ e.h("div", { className: "flex flex-col h-full min-h-0" }, /* @__PURE__ */ e.h("div", { className: "flex items-center gap-2 shrink-0", style: { flexWrap: "wrap", marginBottom: 10 } }, de.map((h) => /* @__PURE__ */ e.h(Y, { key: h.id, active: r === h.id, onClick: () => i(h.id) }, h.label)), /* @__PURE__ */ e.h("span", { style: { width: 1, height: 16, background: "var(--color-border)", margin: "0 2px" } }), ["hour", "day", "week", "month"].map((h) => /* @__PURE__ */ e.h(
      Y,
      {
        key: h,
        active: A === h,
        onClick: () => d(h),
        title: `Group by ${h}`
      },
      h
    )), /* @__PURE__ */ e.h(Y, { active: $, onClick: () => E(!$), title: "Table view" }, /* @__PURE__ */ e.h(J, { d: $ ? K.chart : K.table, size: 11 }), $ ? "Chart" : "Table")), /* @__PURE__ */ e.h("div", { className: "shrink-0", style: { marginBottom: 2 } }, /* @__PURE__ */ e.h("span", { style: { fontSize: _.title, fontWeight: 600, color: "var(--color-text-primary)" } }, W.label), /* @__PURE__ */ e.h("span", { style: { fontSize: _.row, color: "var(--color-text-muted)", marginLeft: 8 } }, R, " per ", A, N ? ` · ${N}` : "")), /* @__PURE__ */ e.h("div", { className: "shrink-0", style: { ...o.mono, color: "var(--color-text-muted)", marginBottom: 8 } }, y.samples.toLocaleString(), " samples · ", G(y.first_ts, "day"), " → ", G(y.last_ts, "day"), y.units_vary && " · mixed units"), m && /* @__PURE__ */ e.h(k, null, "Couldn’t load this metric — ", m), !m && x && u === null && /* @__PURE__ */ e.h(k, null, "Loading…"), !m && u && $ && /* @__PURE__ */ e.h("div", { className: "flex-1 min-h-0 overflow-auto" }, /* @__PURE__ */ e.h(be, { points: u, bucket: A, meta: W, unit: N })), !m && u && !$ && // The plot takes whatever vertical space is left and reports it back
    // to the chart, instead of the chart being a fixed 240px strip with
    // half the window empty under it. `overflow: hidden` stops the
    // measure→render→measure loop a scrolling parent would create.
    /* @__PURE__ */ e.h("div", { className: "flex flex-col flex-1 min-h-0" }, /* @__PURE__ */ e.h("div", { ref: Z, className: "flex-1 min-h-0", style: { overflow: "hidden" } }, /* @__PURE__ */ e.h(
      fe,
      {
        points: u,
        bucket: A,
        meta: W,
        unit: N,
        palette: n,
        onPick: f,
        picked: M,
        height: z.height
      }
    )), u.length > 0 && /* @__PURE__ */ e.h("div", { className: "shrink-0", style: { ...o.mono, color: "var(--color-text-muted)", marginTop: 4 } }, "Click a ", A, " to see its individual readings."), M && /* @__PURE__ */ e.h("div", { className: "shrink-0" }, /* @__PURE__ */ e.h(
      ve,
      {
        metricType: y.metric_type,
        bucket: A,
        point: M,
        meta: W,
        onClose: () => f(null)
      }
    ))));
  }
  function be({ points: t, bucket: l, meta: a, unit: n }) {
    return t.length ? /* @__PURE__ */ e.h("table", { style: { width: "100%", borderCollapse: "collapse" } }, /* @__PURE__ */ e.h("thead", null, /* @__PURE__ */ e.h("tr", null, /* @__PURE__ */ e.h("th", { style: o.th }, l), /* @__PURE__ */ e.h("th", { style: o.th }, "samples"), /* @__PURE__ */ e.h("th", { style: o.th }, "min"), /* @__PURE__ */ e.h("th", { style: o.th }, "avg"), /* @__PURE__ */ e.h("th", { style: o.th }, "max"), /* @__PURE__ */ e.h("th", { style: o.th }, a.agg === "duration" ? "hours" : `total${n ? ` (${n})` : ""}`))), /* @__PURE__ */ e.h("tbody", null, t.map((r) => /* @__PURE__ */ e.h("tr", { key: r.bucket_ts }, /* @__PURE__ */ e.h("td", { style: { ...o.td, whiteSpace: "nowrap" } }, G(r.bucket_ts, l)), /* @__PURE__ */ e.h("td", { style: { ...o.td, ...o.mono } }, r.samples.toLocaleString()), /* @__PURE__ */ e.h("td", { style: { ...o.td, ...o.mono } }, C(r.min, a.decimals)), /* @__PURE__ */ e.h("td", { style: { ...o.td, ...o.mono } }, C(r.avg, a.decimals)), /* @__PURE__ */ e.h("td", { style: { ...o.td, ...o.mono } }, C(r.max, a.decimals)), /* @__PURE__ */ e.h("td", { style: { ...o.td, ...o.mono, color: "var(--color-text-primary)" } }, a.agg === "duration" ? C(r.duration_s === null ? null : r.duration_s / 3600, 1) : C(r.sum, a.decimals)))))) : /* @__PURE__ */ e.h(k, null, "No samples in this range.");
  }
  function ke({ palette: t }) {
    const [l, a] = p(7), [n, r] = p(null), [i, c] = p(null);
    O(() => {
      let u = !0;
      r(null), c(null);
      const g = Date.now() / 1e3;
      return V(`/health/locations${q({ from_ts: g - l * B, until_ts: g, limit: 2e3 })}`).then((m) => {
        u && r(m);
      }).catch((m) => {
        u && c(m.message);
      }), () => {
        u = !1;
      };
    }, [l]);
    const d = j(() => {
      if (!n || !n.points.length) return null;
      const u = n.points, g = u.map((b) => b.latitude), m = u.map((b) => b.longitude), w = {
        minLat: Math.min(...g),
        maxLat: Math.max(...g),
        minLon: Math.min(...m),
        maxLon: Math.max(...m)
      }, x = [...new Set(u.map((b) => b.source))];
      return { pts: u, bounds: w, sources: x };
    }, [n]);
    return i ? /* @__PURE__ */ e.h(k, null, "Couldn’t load locations — ", i) : n ? /* @__PURE__ */ e.h("div", { className: "flex flex-col h-full min-h-0" }, /* @__PURE__ */ e.h("div", { className: "flex items-center gap-2 shrink-0", style: { marginBottom: 10 } }, [1, 7, 30, 365].map((u) => /* @__PURE__ */ e.h(Y, { key: u, active: l === u, onClick: () => a(u) }, u === 1 ? "24h" : u === 365 ? "1y" : `${u}d`)), /* @__PURE__ */ e.h("span", { style: { ...o.mono, color: "var(--color-text-muted)", marginLeft: "auto" } }, n.total.toLocaleString(), " fixes", n.total > n.points.length && ` · showing first ${n.points.length.toLocaleString()}`)), d ? /* @__PURE__ */ e.h("div", { className: "flex-1 min-h-0 overflow-auto" }, /* @__PURE__ */ e.h(_e, { model: d, palette: t }), /* @__PURE__ */ e.h("div", { style: { ...o.mono, color: "var(--color-text-muted)", marginTop: 8 } }, d.bounds.minLat.toFixed(4), ", ", d.bounds.minLon.toFixed(4), "  →  ", d.bounds.maxLat.toFixed(4), ", ", d.bounds.maxLon.toFixed(4))) : /* @__PURE__ */ e.h(k, null, "No location fixes in this range.")) : /* @__PURE__ */ e.h(k, null, "Loading…");
  }
  function _e({ model: t, palette: l }) {
    const [a, { width: n }] = le(), r = 300, i = Math.max(n, 240), c = 16, { bounds: d, pts: u, sources: g } = t, m = Math.max(d.maxLat - d.minLat, 1e-4), w = Math.max(d.maxLon - d.minLon, 1e-4), x = (f) => c + (f - d.minLon) / w * (i - c * 2), b = (f) => r - c - (f - d.minLat) / m * (r - c * 2), M = (f) => [l.s1, l.s2, l.s3][g.indexOf(f) % 3];
    return /* @__PURE__ */ e.h("div", { ref: a }, /* @__PURE__ */ e.h(
      "svg",
      {
        width: "100%",
        height: r,
        viewBox: `0 0 ${i} ${r}`,
        style: { display: "block", border: "1px solid var(--color-border)", borderRadius: 8 }
      },
      u.map((f, $) => /* @__PURE__ */ e.h(
        "circle",
        {
          key: $,
          cx: x(f.longitude),
          cy: b(f.latitude),
          r: "3.2",
          fill: M(f.source),
          opacity: "0.7"
        },
        /* @__PURE__ */ e.h("title", null, `${f.source} · ${te(f.ts)}`)
      ))
    ), g.length >= 2 && /* @__PURE__ */ e.h("div", { className: "flex items-center gap-3", style: { marginTop: 6 } }, g.map((f) => /* @__PURE__ */ e.h("span", { key: f, className: "flex items-center gap-1", style: { fontSize: _.row, color: "var(--color-text-muted)" } }, /* @__PURE__ */ e.h("svg", { width: "9", height: "9", viewBox: "0 0 9 9" }, /* @__PURE__ */ e.h("circle", { cx: "4.5", cy: "4.5", r: "4.5", fill: M(f) })), f))));
  }
  function we() {
    const [t, l] = p(null), [a, n] = p(null);
    return O(() => {
      let r = !0;
      return V(`/health/log${q({ limit: 200 })}`).then((i) => {
        r && l(i.entries || []);
      }).catch((i) => {
        r && n(i.message);
      }), () => {
        r = !1;
      };
    }, []), a ? /* @__PURE__ */ e.h(k, null, "Couldn’t load notes — ", a) : t ? t.length ? /* @__PURE__ */ e.h("div", { className: "overflow-auto h-full" }, /* @__PURE__ */ e.h("table", { style: { width: "100%", borderCollapse: "collapse" } }, /* @__PURE__ */ e.h("thead", null, /* @__PURE__ */ e.h("tr", null, /* @__PURE__ */ e.h("th", { style: o.th }, "When"), /* @__PURE__ */ e.h("th", { style: o.th }, "Category"), /* @__PURE__ */ e.h("th", { style: o.th }, "Note"), /* @__PURE__ */ e.h("th", { style: o.th }, "Where"))), /* @__PURE__ */ e.h("tbody", null, t.map((r, i) => /* @__PURE__ */ e.h("tr", { key: i }, /* @__PURE__ */ e.h("td", { style: { ...o.td, ...o.mono, whiteSpace: "nowrap" } }, te(r.ts)), /* @__PURE__ */ e.h("td", { style: { ...o.td, ...o.label, color: "var(--color-text-muted)" } }, r.category), /* @__PURE__ */ e.h("td", { style: { ...o.td, color: "var(--color-text-primary)" } }, r.text), /* @__PURE__ */ e.h("td", { style: { ...o.td, color: "var(--color-text-muted)" } }, r.location_label || (r.latitude !== null ? `${r.latitude.toFixed(3)}, ${r.longitude.toFixed(3)}` : "—"))))))) : /* @__PURE__ */ e.h(k, null, "No log entries yet. These are the free-text notes logged from chat or the watch.") : /* @__PURE__ */ e.h(k, null, "Loading…");
  }
  const Se = [
    { id: "chart", label: "Metrics" },
    { id: "places", label: "Places" },
    { id: "notes", label: "Notes" }
  ];
  function Me() {
    const t = ge(), [l, a] = p("chart"), [n, r] = p(null), [i, c] = p(null), [d, u] = p(null), [g, m] = p(null), w = ae(() => {
      u(null), V("/health/status").then((x) => (m(x), x.configured ? V("/health/metrics") : null)).then((x) => {
        if (!x) return;
        const b = x.metrics || [];
        r(b), c((M) => M || // Open on heart rate when it exists — it is the densest series and
        // the one that makes the window immediately look like something.
        (b.find((f) => f.metric_type === "heart_rate") ? "heart_rate" : b[0] && b[0].metric_type || null));
      }).catch((x) => u(x));
    }, []);
    return O(w, [w]), d ? /* @__PURE__ */ e.h(k, null, /* @__PURE__ */ e.h("div", { style: { color: "var(--color-text-primary)", marginBottom: 6 } }, "Couldn’t reach the health data."), /* @__PURE__ */ e.h("div", null, d.message), d.status === 403 && /* @__PURE__ */ e.h("div", { style: { marginTop: 8 } }, "This workspace doesn’t own the health dataset — it lives with the workspace on the legacy schema."), d.status === 404 && /* @__PURE__ */ e.h("div", { style: { marginTop: 8 } }, "aw-backend has no", /* @__PURE__ */ e.h("span", { style: { ...o.mono } }, " /api/workspaces/<slug>/health "), "route — it is running a build from before this feature. The data is fine; the service needs deploying."), /* @__PURE__ */ e.h("button", { onClick: w, style: { ...o.btn, marginTop: 12 } }, /* @__PURE__ */ e.h(J, { d: K.refresh, size: 11 }), " Retry")) : g && !g.configured ? /* @__PURE__ */ e.h(k, null, /* @__PURE__ */ e.h("div", { style: { color: "var(--color-text-primary)", marginBottom: 6 } }, "No route to the health data."), /* @__PURE__ */ e.h("div", null, "The samples live in aw-backend, and this workspace has no", /* @__PURE__ */ e.h("span", { style: { ...o.mono } }, " AW_WORKSPACE_HOST_TOKEN "), "to reach it with — that credential is minted by the aw-remote-host", /* @__PURE__ */ e.h("span", { style: { ...o.mono } }, " /link "), " handshake.")) : n ? n.length ? /* @__PURE__ */ e.h("div", { className: "flex h-full min-h-0", style: { background: "var(--color-bg-primary)" } }, /* @__PURE__ */ e.h(
      "div",
      {
        className: "flex flex-col min-h-0",
        style: { width: 232, flexShrink: 0, borderRight: "1px solid var(--color-border)" }
      },
      /* @__PURE__ */ e.h(
        "div",
        {
          className: "flex items-center gap-2 shrink-0",
          style: { padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }
        },
        /* @__PURE__ */ e.h(J, { d: K.activity, size: 13, color: "var(--color-text-muted)" }),
        /* @__PURE__ */ e.h("span", { style: { fontSize: _.title, fontWeight: 600, color: "var(--color-text-primary)" } }, "Health")
      ),
      /* @__PURE__ */ e.h(ye, { metrics: n, selected: i, onSelect: c })
    ), /* @__PURE__ */ e.h("div", { className: "flex flex-col flex-1 min-w-0 min-h-0" }, /* @__PURE__ */ e.h(
      "div",
      {
        className: "flex items-center gap-1 shrink-0",
        style: { padding: "6px 10px", borderBottom: "1px solid var(--color-border)" }
      },
      Se.map((x) => /* @__PURE__ */ e.h(
        "button",
        {
          key: x.id,
          onClick: () => a(x.id),
          style: {
            ...o.btn,
            borderColor: "transparent",
            color: l === x.id ? "var(--color-text-primary)" : "var(--color-text-muted)",
            fontSize: _.tab,
            fontWeight: l === x.id ? 600 : 400,
            background: l === x.id ? "rgba(127,127,160,.14)" : "transparent"
          }
        },
        x.label
      ))
    ), /* @__PURE__ */ e.h("div", { className: "flex-1 min-h-0", style: { padding: 12 } }, l === "chart" && /* @__PURE__ */ e.h(xe, { metrics: n, selected: i, onSelect: c, palette: t }), l === "places" && /* @__PURE__ */ e.h(ke, { palette: t }), l === "notes" && /* @__PURE__ */ e.h(we, null)))) : /* @__PURE__ */ e.h(k, null, "No health samples have been synced yet.") : /* @__PURE__ */ e.h(k, null, "Loading…");
  }
  e.registerWindow($e, Me);
}
export {
  Be as default,
  Be as register
};
