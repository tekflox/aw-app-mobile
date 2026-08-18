const Ce = "mobile", ce = "mobile.health";
const k = { title: 14, nav: 13, tab: 12, row: 11.5, mono: 11, label: 10 }, Re = {
  dark: { s1: "#3987e5", s2: "#d95926", s3: "#199e70" },
  light: { s1: "#2a78d6", s2: "#eb6834", s3: "#1baf7a" }
}, V = {
  // Inline SVG only. The container's font stack has no glyph for ⟳ ▶ ▾ ✕ — a
  // unicode symbol renders as a tofu box here, and a *stroked* square reads as
  // tofu too, so anything meant as a dot is filled.
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  close: "M18 6L6 18M6 6l12 12",
  refresh: "M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  table: "M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18",
  chart: "M3 3v18h18 M7 15l4-6 4 3 5-8"
}, o = {
  label: { fontSize: k.label, textTransform: "uppercase", letterSpacing: ".06em" },
  mono: { fontSize: k.mono, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  th: {
    fontSize: k.label,
    textTransform: "uppercase",
    letterSpacing: ".06em",
    fontWeight: 500,
    textAlign: "left",
    padding: "5px 8px",
    color: "var(--color-text-muted)",
    borderBottom: "1px solid var(--color-border)"
  },
  td: { fontSize: k.row, padding: "5px 8px", borderBottom: "1px solid var(--color-border)" },
  btn: {
    fontSize: k.label,
    padding: "3px 9px",
    borderRadius: 6,
    border: "1px solid var(--color-border)",
    color: "var(--color-text-muted)",
    background: "transparent",
    lineHeight: 1.6,
    whiteSpace: "nowrap",
    cursor: "pointer"
  }
}, We = {
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
}, Ae = ["Heart", "Activity", "Rest", "Vitals", "Body", "Other"];
function X(e) {
  const p = We[e.metric_type];
  return p || {
    label: e.metric_type.replace(/_/g, " "),
    group: "Other",
    // No numeric column at all -> the only quantity it has is elapsed time.
    agg: e.numeric_samples === 0 ? "duration" : "avg",
    decimals: 1
  };
}
const B = 86400, de = { hour: 3600, day: B, week: 7 * B, month: 30.44 * B }, ue = [
  { id: "7d", label: "7d", days: 7 },
  { id: "30d", label: "30d", days: 30 },
  { id: "90d", label: "90d", days: 90 },
  { id: "1y", label: "1y", days: 365 },
  { id: "5y", label: "5y", days: 365 * 5 },
  { id: "all", label: "All", days: null }
];
function Be(e) {
  return e <= 3 * B ? "hour" : e <= 120 * B ? "day" : e <= 3 * 365 * B ? "week" : "month";
}
function ze(e) {
  const { useState: p, useEffect: O, useCallback: ne, useMemo: G, useRef: ae } = e.React, me = (t, l) => e.sdk.api.fetch(`/api/apps/${Ce}${t}`, l), j = async (t) => {
    const l = await me(t);
    let n = null;
    try {
      n = await l.json();
    } catch {
    }
    if (!l.ok) {
      const a = new Error(n && (n.detail || n.error) || `HTTP ${l.status}`);
      throw a.status = l.status, a;
    }
    return n;
  }, q = (t) => {
    const l = new URLSearchParams();
    for (const [a, r] of Object.entries(t))
      r != null && r !== "" && l.set(a, String(r));
    const n = l.toString();
    return n ? `?${n}` : "";
  }, R = (t, l = 1) => t == null || Number.isNaN(t) ? "—" : Math.abs(t) >= 1e4 ? Math.round(t).toLocaleString() : t.toFixed(l), U = (t, l) => {
    const n = new Date(t * 1e3);
    return l === "hour" ? n.toLocaleString(void 0, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : l === "month" ? n.toLocaleDateString(void 0, { month: "short", year: "numeric" }) : n.toLocaleDateString(void 0, { month: "short", day: "numeric", year: "numeric" });
  }, he = (t, l, n) => {
    const a = new Date(t * 1e3);
    return l === "hour" ? a.toLocaleTimeString(void 0, { hour: "2-digit", minute: "2-digit" }) : l === "month" || n > 300 ? a.toLocaleDateString(void 0, { month: "short", year: "numeric" }) : a.toLocaleDateString(void 0, { month: "short", day: "numeric" });
  }, te = (t) => new Date(t * 1e3).toLocaleString(void 0, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }), ge = (t) => t >= 1e3 ? `${(t / 1e3).toFixed(t >= 1e4 ? 0 : 1)}k` : String(t);
  function pe() {
    const [t, l] = p("dark");
    return O(() => {
      const n = () => {
        try {
          const i = getComputedStyle(document.documentElement).getPropertyValue("--color-bg-primary").trim().match(/^#([0-9a-f]{6})$/i);
          if (!i) return;
          const c = parseInt(i[1], 16), d = (0.2126 * (c >> 16 & 255) + 0.7152 * (c >> 8 & 255) + 0.0722 * (c & 255)) / 255;
          l(d > 0.5 ? "light" : "dark");
        } catch {
        }
      };
      n();
      const a = new MutationObserver(n);
      return a.observe(document.documentElement, { attributes: !0, attributeFilter: ["class", "data-theme", "style"] }), () => a.disconnect();
    }, []), Re[t];
  }
  function J({ d: t, size: l = 12, color: n = "currentColor", style: a }) {
    return /* @__PURE__ */ e.h(
      "svg",
      {
        width: l,
        height: l,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: n,
        strokeWidth: "2",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        style: { flexShrink: 0, ...a }
      },
      /* @__PURE__ */ e.h("path", { d: t })
    );
  }
  function w({ children: t }) {
    return /* @__PURE__ */ e.h("div", { style: {
      padding: "28px 16px",
      textAlign: "center",
      fontSize: k.row,
      color: "var(--color-text-muted)",
      lineHeight: 1.7
    } }, t);
  }
  function Y({ active: t, onClick: l, children: n, title: a }) {
    return /* @__PURE__ */ e.h(
      "button",
      {
        onClick: l,
        title: a,
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
      n
    );
  }
  function le() {
    const [t, l] = p({ width: 0, height: 0 }), n = ae(null);
    return [ne((r) => {
      if (n.current && (n.current.disconnect(), n.current = null), !r) return;
      const i = new ResizeObserver((c) => {
        const d = c[0].contentRect;
        l({ width: d.width, height: d.height });
      });
      i.observe(r), n.current = i;
    }, []), t];
  }
  const S = { top: 26, right: 16, bottom: 24, left: 52 };
  function fe(t, l, n = 4) {
    if (!(l > t)) return [t];
    const a = (l - t) / n, r = Math.pow(10, Math.floor(Math.log10(a))), i = a / r, c = (i >= 5 ? 10 : i >= 2 ? 5 : i >= 1 ? 2 : 1) * r, d = [];
    for (let u = Math.ceil(t / c) * c; u <= l + 1e-9; u += c) d.push(u);
    return d;
  }
  function ye({ points: t, bucket: l, meta: n, unit: a, palette: r, onPick: i, picked: c, height: d }) {
    const [u, { width: g }] = le(), [m, _] = p(null), x = ae(null), b = Math.max(180, Math.min(d || 240, 520)), M = Math.max(g, 240), f = M - S.left - S.right, $ = b - S.top - S.bottom, E = n.agg === "avg" ? "line" : "bar", Z = G(() => {
      if (!t || t.length === 0) return null;
      const s = (T) => n.agg === "sum" ? T.sum : n.agg === "duration" ? T.duration_s === null ? null : T.duration_s / 3600 : T.avg, v = t.map((T) => ({ ...T, v: s(T) })).filter((T) => T.v !== null);
      if (v.length === 0) return null;
      const K = v[0].bucket_ts, P = de[l] || B, ee = v[v.length - 1].bucket_ts + P;
      let H, D;
      if (E === "line") {
        H = Math.min(...v.map((I) => I.min === null ? I.v : I.min)), D = Math.max(...v.map((I) => I.max === null ? I.v : I.max)), D - H < 1e-9 && (H -= 1, D += 1);
        const T = (D - H) * 0.08;
        H -= T, D += T;
      } else
        H = 0, D = Math.max(...v.map((T) => T.v)) * 1.08 || 1;
      return { rows: v, t0: K, t1: ee, lo: H, hi: D, span: P };
    }, [t, l, n.agg, E]);
    if (!Z)
      return /* @__PURE__ */ e.h("div", { ref: u }, /* @__PURE__ */ e.h(w, null, "No samples in this range."));
    const { rows: z, t0: y, t1: W, lo: L, hi: A, span: N } = Z, C = (s) => S.left + (s - y) / (W - y) * f, h = (s) => S.top + $ - (s - L) / (A - L) * $, F = fe(L, A, 5), re = Math.max(2, Math.min(6, Math.floor(f / 90))), Q = Array.from({ length: re + 1 }, (s, v) => y + (W - y) * v / re), Te = z.map((s, v) => `${v === 0 ? "M" : "L"}${C(s.bucket_ts + N / 2).toFixed(2)},${h(s.v).toFixed(2)}`).join(" "), oe = E === "line" && z.some((s) => s.min !== null && s.max !== null) ? `${z.map((s, v) => `${v === 0 ? "M" : "L"}${C(s.bucket_ts + N / 2).toFixed(2)},${h(s.max ?? s.v).toFixed(2)}`).join(" ")} ${z.slice().reverse().map((s) => `L${C(s.bucket_ts + N / 2).toFixed(2)},${h(s.min ?? s.v).toFixed(2)}`).join(" ")} Z` : null, ie = Math.max(1, f / ((W - y) / N) - 2), se = (s) => {
      const v = x.current.getBoundingClientRect(), K = s - v.left;
      let P = null, ee = 1 / 0;
      for (const H of z) {
        const D = Math.abs(C(H.bucket_ts + N / 2) - K);
        D < ee && (ee = D, P = H);
      }
      return P;
    }, $e = z[z.length - 1];
    return /* @__PURE__ */ e.h("div", { ref: u, style: { position: "relative", width: "100%" } }, /* @__PURE__ */ e.h(
      "svg",
      {
        ref: x,
        "data-chart": "series",
        width: "100%",
        height: b,
        viewBox: `0 0 ${M} ${b}`,
        style: { display: "block", overflow: "visible" },
        onMouseMove: (s) => _(se(s.clientX)),
        onMouseLeave: () => _(null),
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
          fontSize: k.label,
          fill: "var(--color-text-muted)"
        },
        R(s, s >= 100 ? 0 : 1)
      ))),
      Q.map((s, v) => /* @__PURE__ */ e.h(
        "text",
        {
          key: `x${v}`,
          x: C(s),
          y: b - 6,
          textAnchor: v === 0 ? "start" : v === Q.length - 1 ? "end" : "middle",
          fontSize: k.label,
          fill: "var(--color-text-muted)"
        },
        he(s, l, (W - y) / B)
      )),
      oe && /* @__PURE__ */ e.h("path", { d: oe, fill: r.s1, opacity: "0.16", stroke: "none" }),
      E === "bar" && z.map((s) => {
        const v = c && c.bucket_ts === s.bucket_ts, K = m && m.bucket_ts === s.bucket_ts, P = Math.max(1, S.top + $ - h(s.v));
        return /* @__PURE__ */ e.h(
          "rect",
          {
            key: s.bucket_ts,
            x: C(s.bucket_ts) + 1,
            y: h(s.v),
            width: ie,
            height: P,
            rx: Math.min(4, ie / 2),
            fill: r.s1,
            opacity: v ? 1 : K ? 0.92 : 0.78
          }
        );
      }),
      E === "line" && /* @__PURE__ */ e.h(
        "path",
        {
          d: Te,
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
          fontSize: k.mono,
          fontWeight: "600",
          fill: "var(--color-text-primary)"
        },
        R($e.v, n.decimals),
        a ? ` ${a}` : ""
      ),
      /* @__PURE__ */ e.h(
        "text",
        {
          x: S.left,
          y: 15,
          textAnchor: "start",
          fontSize: k.label,
          fill: "var(--color-text-muted)",
          style: { textTransform: "uppercase", letterSpacing: ".06em" }
        },
        "latest ",
        l
      ),
      m && /* @__PURE__ */ e.h("g", { pointerEvents: "none" }, /* @__PURE__ */ e.h(
        "line",
        {
          x1: C(m.bucket_ts + N / 2),
          x2: C(m.bucket_ts + N / 2),
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
          cx: C(m.bucket_ts + N / 2),
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
      left: Math.min(Math.max(C(m.bucket_ts + N / 2) - 70, 0), Math.max(M - 150, 0)),
      top: 4,
      width: 150,
      background: "var(--color-bg-header)",
      border: "1px solid var(--color-border-active)",
      borderRadius: 6,
      padding: "6px 8px",
      zIndex: 5
    } }, /* @__PURE__ */ e.h("div", { style: { ...o.label, color: "var(--color-text-muted)", marginBottom: 3 } }, U(m.bucket_ts, l)), /* @__PURE__ */ e.h("div", { style: { fontSize: k.row, color: "var(--color-text-primary)", fontWeight: 600 } }, R(m.v, n.decimals), a ? ` ${a}` : ""), m.min !== null && m.max !== null && n.agg === "avg" && /* @__PURE__ */ e.h("div", { style: { ...o.mono, color: "var(--color-text-muted)" } }, R(m.min, n.decimals), " – ", R(m.max, n.decimals)), /* @__PURE__ */ e.h("div", { style: { ...o.mono, color: "var(--color-text-muted)" } }, m.samples.toLocaleString(), " samples")));
  }
  function ve({ metrics: t, selected: l, onSelect: n }) {
    const a = G(() => {
      const r = /* @__PURE__ */ new Map();
      for (const i of t) {
        const c = X(i).group;
        r.has(c) || r.set(c, []), r.get(c).push(i);
      }
      return Ae.filter((i) => r.has(i)).map((i) => [i, r.get(i).sort((c, d) => X(c).label.localeCompare(X(d).label))]);
    }, [t]);
    return /* @__PURE__ */ e.h("div", { className: "overflow-auto", style: { padding: "6px 6px 12px" } }, a.map(([r, i]) => /* @__PURE__ */ e.h("div", { key: r, style: { marginBottom: 8 } }, /* @__PURE__ */ e.h("div", { style: { ...o.label, color: "var(--color-text-muted)", padding: "4px 6px" } }, r), i.map((c) => {
      const d = l === c.metric_type;
      return /* @__PURE__ */ e.h(
        "div",
        {
          key: c.metric_type,
          onClick: () => n(c.metric_type),
          className: "flex items-center gap-2 cursor-pointer",
          style: {
            padding: "4px 6px",
            borderRadius: 5,
            fontSize: k.row,
            background: d ? "rgba(127,127,160,.16)" : "transparent",
            color: "var(--color-text-primary)",
            fontWeight: d ? 600 : 400
          }
        },
        /* @__PURE__ */ e.h("span", { className: "truncate", style: { flex: 1 } }, X(c).label),
        /* @__PURE__ */ e.h("span", { style: { ...o.mono, color: "var(--color-text-muted)" } }, ge(c.samples))
      );
    }))));
  }
  function xe({ metricType: t, bucket: l, point: n, meta: a, onClose: r }) {
    const [i, c] = p(null), [d, u] = p(null);
    return O(() => {
      let g = !0;
      c(null), u(null);
      const m = de[l] || B;
      return j(`/health/samples${q({
        metric_type: t,
        from_ts: n.bucket_ts,
        until_ts: n.bucket_ts + m,
        order: "asc",
        limit: 500
      })}`).then((_) => {
        g && c(_.samples || []);
      }).catch((_) => {
        g && u(_.message);
      }), () => {
        g = !1;
      };
    }, [t, l, n.bucket_ts]), /* @__PURE__ */ e.h("div", { style: {
      border: "1px solid var(--color-border)",
      borderRadius: 8,
      background: "var(--color-bg-secondary)",
      marginTop: 10,
      overflow: "hidden"
    } }, /* @__PURE__ */ e.h("div", { className: "flex items-center gap-2", style: { padding: "6px 10px", borderBottom: "1px solid var(--color-border)" } }, /* @__PURE__ */ e.h("span", { style: { fontSize: k.tab, color: "var(--color-text-primary)", fontWeight: 600 } }, U(n.bucket_ts, l)), /* @__PURE__ */ e.h("span", { style: { ...o.mono, color: "var(--color-text-muted)" } }, n.samples.toLocaleString(), " samples"), /* @__PURE__ */ e.h("button", { onClick: r, style: { ...o.btn, marginLeft: "auto", padding: "2px 6px" } }, /* @__PURE__ */ e.h(J, { d: V.close, size: 11 }))), /* @__PURE__ */ e.h("div", { className: "overflow-auto", style: { maxHeight: 220 } }, d && /* @__PURE__ */ e.h(w, null, "Couldn’t load samples — ", d), !d && i === null && /* @__PURE__ */ e.h(w, null, "Loading…"), i && i.length === 0 && /* @__PURE__ */ e.h(w, null, "No individual samples in this bucket."), i && i.length > 0 && /* @__PURE__ */ e.h("table", { style: { width: "100%", borderCollapse: "collapse" } }, /* @__PURE__ */ e.h("thead", null, /* @__PURE__ */ e.h("tr", null, /* @__PURE__ */ e.h("th", { style: o.th }, "When"), /* @__PURE__ */ e.h("th", { style: o.th }, "Value"), /* @__PURE__ */ e.h("th", { style: o.th }, "Source"))), /* @__PURE__ */ e.h("tbody", null, i.map((g, m) => /* @__PURE__ */ e.h("tr", { key: m }, /* @__PURE__ */ e.h("td", { style: { ...o.td, ...o.mono, whiteSpace: "nowrap" } }, te(g.start_ts)), /* @__PURE__ */ e.h("td", { style: { ...o.td, color: "var(--color-text-primary)" } }, g.value !== null ? `${R(g.value, a.decimals)} ${g.unit || ""}` : g.text_value || "—"), /* @__PURE__ */ e.h("td", { style: { ...o.td, ...o.mono, color: "var(--color-text-muted)" } }, (g.source_bundle || "").split(".").pop() || "—")))))));
  }
  function be({ metrics: t, selected: l, onSelect: n, palette: a }) {
    const [r, i] = p("90d"), [c, d] = p(null), [u, g] = p(null), [m, _] = p(null), [x, b] = p(!1), [M, f] = p(null), [$, E] = p(!1), [Z, z] = le(), y = t.find((h) => h.metric_type === l), W = y ? X(y) : null, L = G(() => {
      if (!y) return null;
      const h = ue.find((Q) => Q.id === r), F = (y.last_ts || Date.now() / 1e3) + 1;
      return { from: h.days === null ? y.first_ts : Math.max(y.first_ts, F - h.days * B), until: F };
    }, [y, r]), A = G(() => L ? c || Be(L.until - L.from) : "day", [L, c]);
    if (O(() => {
      d(null), f(null);
    }, [l, r]), O(() => {
      if (!y || !L) return;
      let h = !0;
      return b(!0), _(null), j(`/health/series${q({
        metric_type: y.metric_type,
        bucket: A,
        from_ts: L.from,
        until_ts: L.until,
        tz_offset_minutes: -(/* @__PURE__ */ new Date()).getTimezoneOffset()
      })}`).then((F) => {
        h && (g(F.points || []), b(!1));
      }).catch((F) => {
        h && (_(F.message), b(!1));
      }), () => {
        h = !1;
      };
    }, [y && y.metric_type, A, L && L.from, L && L.until]), !y) return /* @__PURE__ */ e.h(w, null, "Pick a metric on the left.");
    const N = W.agg === "duration" ? "h" : y.unit || "", C = { avg: "average", sum: "total", duration: "hours" }[W.agg];
    return /* @__PURE__ */ e.h("div", { className: "flex flex-col h-full min-h-0" }, /* @__PURE__ */ e.h("div", { className: "flex items-center gap-2 shrink-0", style: { flexWrap: "wrap", marginBottom: 10 } }, ue.map((h) => /* @__PURE__ */ e.h(Y, { key: h.id, active: r === h.id, onClick: () => i(h.id) }, h.label)), /* @__PURE__ */ e.h("span", { style: { width: 1, height: 16, background: "var(--color-border)", margin: "0 2px" } }), ["hour", "day", "week", "month"].map((h) => /* @__PURE__ */ e.h(
      Y,
      {
        key: h,
        active: A === h,
        onClick: () => d(h),
        title: `Group by ${h}`
      },
      h
    )), /* @__PURE__ */ e.h(Y, { active: $, onClick: () => E(!$), title: "Table view" }, /* @__PURE__ */ e.h(J, { d: $ ? V.chart : V.table, size: 11 }), $ ? "Chart" : "Table")), /* @__PURE__ */ e.h("div", { className: "shrink-0", style: { marginBottom: 2 } }, /* @__PURE__ */ e.h("span", { style: { fontSize: k.title, fontWeight: 600, color: "var(--color-text-primary)" } }, W.label), /* @__PURE__ */ e.h("span", { style: { fontSize: k.row, color: "var(--color-text-muted)", marginLeft: 8 } }, C, " per ", A, N ? ` · ${N}` : "")), /* @__PURE__ */ e.h("div", { className: "shrink-0", style: { ...o.mono, color: "var(--color-text-muted)", marginBottom: 8 } }, y.samples.toLocaleString(), " samples · ", U(y.first_ts, "day"), " → ", U(y.last_ts, "day"), y.units_vary && " · mixed units"), m && /* @__PURE__ */ e.h(w, null, "Couldn’t load this metric — ", m), !m && x && u === null && /* @__PURE__ */ e.h(w, null, "Loading…"), !m && u && $ && /* @__PURE__ */ e.h("div", { className: "flex-1 min-h-0 overflow-auto" }, /* @__PURE__ */ e.h(ke, { points: u, bucket: A, meta: W, unit: N })), !m && u && !$ && // The plot takes whatever vertical space is left and reports it back
    // to the chart, instead of the chart being a fixed 240px strip with
    // half the window empty under it. `overflow: hidden` stops the
    // measure→render→measure loop a scrolling parent would create.
    /* @__PURE__ */ e.h("div", { className: "flex flex-col flex-1 min-h-0" }, /* @__PURE__ */ e.h("div", { ref: Z, className: "flex-1 min-h-0", style: { overflow: "hidden" } }, /* @__PURE__ */ e.h(
      ye,
      {
        points: u,
        bucket: A,
        meta: W,
        unit: N,
        palette: a,
        onPick: f,
        picked: M,
        height: z.height
      }
    )), u.length > 0 && /* @__PURE__ */ e.h("div", { className: "shrink-0", style: { ...o.mono, color: "var(--color-text-muted)", marginTop: 4 } }, "Click a ", A, " to see its individual readings."), M && /* @__PURE__ */ e.h("div", { className: "shrink-0" }, /* @__PURE__ */ e.h(
      xe,
      {
        metricType: y.metric_type,
        bucket: A,
        point: M,
        meta: W,
        onClose: () => f(null)
      }
    ))));
  }
  function ke({ points: t, bucket: l, meta: n, unit: a }) {
    return t.length ? /* @__PURE__ */ e.h("table", { style: { width: "100%", borderCollapse: "collapse" } }, /* @__PURE__ */ e.h("thead", null, /* @__PURE__ */ e.h("tr", null, /* @__PURE__ */ e.h("th", { style: o.th }, l), /* @__PURE__ */ e.h("th", { style: o.th }, "samples"), /* @__PURE__ */ e.h("th", { style: o.th }, "min"), /* @__PURE__ */ e.h("th", { style: o.th }, "avg"), /* @__PURE__ */ e.h("th", { style: o.th }, "max"), /* @__PURE__ */ e.h("th", { style: o.th }, n.agg === "duration" ? "hours" : `total${a ? ` (${a})` : ""}`))), /* @__PURE__ */ e.h("tbody", null, t.map((r) => /* @__PURE__ */ e.h("tr", { key: r.bucket_ts }, /* @__PURE__ */ e.h("td", { style: { ...o.td, whiteSpace: "nowrap" } }, U(r.bucket_ts, l)), /* @__PURE__ */ e.h("td", { style: { ...o.td, ...o.mono } }, r.samples.toLocaleString()), /* @__PURE__ */ e.h("td", { style: { ...o.td, ...o.mono } }, R(r.min, n.decimals)), /* @__PURE__ */ e.h("td", { style: { ...o.td, ...o.mono } }, R(r.avg, n.decimals)), /* @__PURE__ */ e.h("td", { style: { ...o.td, ...o.mono } }, R(r.max, n.decimals)), /* @__PURE__ */ e.h("td", { style: { ...o.td, ...o.mono, color: "var(--color-text-primary)" } }, n.agg === "duration" ? R(r.duration_s === null ? null : r.duration_s / 3600, 1) : R(r.sum, n.decimals)))))) : /* @__PURE__ */ e.h(w, null, "No samples in this range.");
  }
  function we({ palette: t }) {
    const [l, n] = p(7), [a, r] = p(null), [i, c] = p(null);
    O(() => {
      let u = !0;
      r(null), c(null);
      const g = Date.now() / 1e3;
      return j(`/health/locations${q({ from_ts: g - l * B, until_ts: g, limit: 2e3 })}`).then((m) => {
        u && r(m);
      }).catch((m) => {
        u && c(m.message);
      }), () => {
        u = !1;
      };
    }, [l]);
    const d = G(() => {
      if (!a || !a.points.length) return null;
      const u = a.points, g = u.map((b) => b.latitude), m = u.map((b) => b.longitude), _ = {
        minLat: Math.min(...g),
        maxLat: Math.max(...g),
        minLon: Math.min(...m),
        maxLon: Math.max(...m)
      }, x = [...new Set(u.map((b) => b.source))];
      return { pts: u, bounds: _, sources: x };
    }, [a]);
    return i ? /* @__PURE__ */ e.h(w, null, "Couldn’t load locations — ", i) : a ? /* @__PURE__ */ e.h("div", { className: "flex flex-col h-full min-h-0" }, /* @__PURE__ */ e.h("div", { className: "flex items-center gap-2 shrink-0", style: { marginBottom: 10 } }, [1, 7, 30, 365].map((u) => /* @__PURE__ */ e.h(Y, { key: u, active: l === u, onClick: () => n(u) }, u === 1 ? "24h" : u === 365 ? "1y" : `${u}d`)), /* @__PURE__ */ e.h("span", { style: { ...o.mono, color: "var(--color-text-muted)", marginLeft: "auto" } }, a.total.toLocaleString(), " fixes", a.total > a.points.length && ` · showing first ${a.points.length.toLocaleString()}`)), d ? /* @__PURE__ */ e.h("div", { className: "flex-1 min-h-0 overflow-auto" }, /* @__PURE__ */ e.h(_e, { model: d, palette: t }), /* @__PURE__ */ e.h("div", { style: { ...o.mono, color: "var(--color-text-muted)", marginTop: 8 } }, d.bounds.minLat.toFixed(4), ", ", d.bounds.minLon.toFixed(4), "  →  ", d.bounds.maxLat.toFixed(4), ", ", d.bounds.maxLon.toFixed(4))) : /* @__PURE__ */ e.h(w, null, "No location fixes in this range.")) : /* @__PURE__ */ e.h(w, null, "Loading…");
  }
  function _e({ model: t, palette: l }) {
    const [n, { width: a }] = le(), r = 300, i = Math.max(a, 240), c = 16, { bounds: d, pts: u, sources: g } = t, m = Math.max(d.maxLat - d.minLat, 1e-4), _ = Math.max(d.maxLon - d.minLon, 1e-4), x = (f) => c + (f - d.minLon) / _ * (i - c * 2), b = (f) => r - c - (f - d.minLat) / m * (r - c * 2), M = (f) => [l.s1, l.s2, l.s3][g.indexOf(f) % 3];
    return /* @__PURE__ */ e.h("div", { ref: n }, /* @__PURE__ */ e.h(
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
    ), g.length >= 2 && /* @__PURE__ */ e.h("div", { className: "flex items-center gap-3", style: { marginTop: 6 } }, g.map((f) => /* @__PURE__ */ e.h("span", { key: f, className: "flex items-center gap-1", style: { fontSize: k.row, color: "var(--color-text-muted)" } }, /* @__PURE__ */ e.h("svg", { width: "9", height: "9", viewBox: "0 0 9 9" }, /* @__PURE__ */ e.h("circle", { cx: "4.5", cy: "4.5", r: "4.5", fill: M(f) })), f))));
  }
  function Se() {
    const [t, l] = p(null), [n, a] = p(null);
    return O(() => {
      let r = !0;
      return j(`/health/log${q({ limit: 200 })}`).then((i) => {
        r && l(i.entries || []);
      }).catch((i) => {
        r && a(i.message);
      }), () => {
        r = !1;
      };
    }, []), n ? /* @__PURE__ */ e.h(w, null, "Couldn’t load notes — ", n) : t ? t.length ? /* @__PURE__ */ e.h("div", { className: "overflow-auto h-full" }, /* @__PURE__ */ e.h("table", { style: { width: "100%", borderCollapse: "collapse" } }, /* @__PURE__ */ e.h("thead", null, /* @__PURE__ */ e.h("tr", null, /* @__PURE__ */ e.h("th", { style: o.th }, "When"), /* @__PURE__ */ e.h("th", { style: o.th }, "Category"), /* @__PURE__ */ e.h("th", { style: o.th }, "Note"), /* @__PURE__ */ e.h("th", { style: o.th }, "Where"))), /* @__PURE__ */ e.h("tbody", null, t.map((r, i) => /* @__PURE__ */ e.h("tr", { key: i }, /* @__PURE__ */ e.h("td", { style: { ...o.td, ...o.mono, whiteSpace: "nowrap" } }, te(r.ts)), /* @__PURE__ */ e.h("td", { style: { ...o.td, ...o.label, color: "var(--color-text-muted)" } }, r.category), /* @__PURE__ */ e.h("td", { style: { ...o.td, color: "var(--color-text-primary)" } }, r.text), /* @__PURE__ */ e.h("td", { style: { ...o.td, color: "var(--color-text-muted)" } }, r.location_label || (r.latitude !== null ? `${r.latitude.toFixed(3)}, ${r.longitude.toFixed(3)}` : "—"))))))) : /* @__PURE__ */ e.h(w, null, "No log entries yet. These are the free-text notes logged from chat or the watch.") : /* @__PURE__ */ e.h(w, null, "Loading…");
  }
  const Me = [
    { id: "chart", label: "Metrics" },
    { id: "places", label: "Places" },
    { id: "notes", label: "Notes" }
  ];
  function Le() {
    const t = pe(), [l, n] = p("chart"), [a, r] = p(null), [i, c] = p(null), [d, u] = p(null), [g, m] = p(null), _ = ne(() => {
      u(null), j("/health/status").then((x) => (m(x), x.configured ? j("/health/metrics") : null)).then((x) => {
        if (!x) return;
        const b = x.metrics || [];
        r(b), c((M) => M || // Open on heart rate when it exists — it is the densest series and
        // the one that makes the window immediately look like something.
        (b.find((f) => f.metric_type === "heart_rate") ? "heart_rate" : b[0] && b[0].metric_type || null));
      }).catch((x) => u(x));
    }, []);
    return O(_, [_]), d ? /* @__PURE__ */ e.h(w, null, /* @__PURE__ */ e.h("div", { style: { color: "var(--color-text-primary)", marginBottom: 6 } }, "Couldn’t reach the health data."), /* @__PURE__ */ e.h("div", null, d.message), d.status === 403 && /* @__PURE__ */ e.h("div", { style: { marginTop: 8 } }, "This workspace doesn’t own the health dataset — it lives with the workspace on the legacy schema."), /* @__PURE__ */ e.h("button", { onClick: _, style: { ...o.btn, marginTop: 12 } }, /* @__PURE__ */ e.h(J, { d: V.refresh, size: 11 }), " Retry")) : g && !g.configured ? /* @__PURE__ */ e.h(w, null, /* @__PURE__ */ e.h("div", { style: { color: "var(--color-text-primary)", marginBottom: 6 } }, "No route to the health data."), /* @__PURE__ */ e.h("div", null, "The samples live in aw-backend, and this workspace has no", /* @__PURE__ */ e.h("span", { style: { ...o.mono } }, " AW_WORKSPACE_HOST_TOKEN "), "to reach it with — that credential is minted by the aw-remote-host", /* @__PURE__ */ e.h("span", { style: { ...o.mono } }, " /link "), " handshake.")) : a ? a.length ? /* @__PURE__ */ e.h("div", { className: "flex h-full min-h-0", style: { background: "var(--color-bg-primary)" } }, /* @__PURE__ */ e.h(
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
        /* @__PURE__ */ e.h(J, { d: V.activity, size: 13, color: "var(--color-text-muted)" }),
        /* @__PURE__ */ e.h("span", { style: { fontSize: k.title, fontWeight: 600, color: "var(--color-text-primary)" } }, "Health")
      ),
      /* @__PURE__ */ e.h(ve, { metrics: a, selected: i, onSelect: c })
    ), /* @__PURE__ */ e.h("div", { className: "flex flex-col flex-1 min-w-0 min-h-0" }, /* @__PURE__ */ e.h(
      "div",
      {
        className: "flex items-center gap-1 shrink-0",
        style: { padding: "6px 10px", borderBottom: "1px solid var(--color-border)" }
      },
      Me.map((x) => /* @__PURE__ */ e.h(
        "button",
        {
          key: x.id,
          onClick: () => n(x.id),
          style: {
            ...o.btn,
            borderColor: "transparent",
            color: l === x.id ? "var(--color-text-primary)" : "var(--color-text-muted)",
            fontSize: k.tab,
            fontWeight: l === x.id ? 600 : 400,
            background: l === x.id ? "rgba(127,127,160,.14)" : "transparent"
          }
        },
        x.label
      ))
    ), /* @__PURE__ */ e.h("div", { className: "flex-1 min-h-0", style: { padding: 12 } }, l === "chart" && /* @__PURE__ */ e.h(be, { metrics: a, selected: i, onSelect: c, palette: t }), l === "places" && /* @__PURE__ */ e.h(we, { palette: t }), l === "notes" && /* @__PURE__ */ e.h(Se, null)))) : /* @__PURE__ */ e.h(w, null, "No health samples have been synced yet.") : /* @__PURE__ */ e.h(w, null, "Loading…");
  }
  function Ne() {
    return /* @__PURE__ */ e.h(
      "button",
      {
        onClick: () => {
          var t;
          return (t = window.__awOpenAppWindow) == null ? void 0 : t.call(window, ce, void 0, "Health");
        },
        className: "w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/[0.06] cursor-pointer text-left",
        title: "Heart rate, sleep, activity and places, from Apple Health"
      },
      /* @__PURE__ */ e.h(
        "svg",
        {
          className: "w-3.5 h-3.5 shrink-0 text-[var(--color-text-muted)]",
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round",
          strokeLinejoin: "round"
        },
        /* @__PURE__ */ e.h("path", { d: V.activity })
      ),
      /* @__PURE__ */ e.h("span", { style: { fontSize: k.nav, color: "var(--color-text-primary)" } }, "Health")
    );
  }
  e.registerWindow(ce, Le), e.registerSlot("core.nav.workspace", Ne);
}
export {
  ze as default,
  ze as register
};
