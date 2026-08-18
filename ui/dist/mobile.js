const Te = "mobile", se = "mobile.health";
const w = { title: 14, nav: 13, tab: 12, row: 11.5, mono: 11, label: 10 }, Ce = {
  dark: { s1: "#3987e5", s2: "#d95926", s3: "#199e70" },
  light: { s1: "#2a78d6", s2: "#eb6834", s3: "#1baf7a" }
}, I = {
  // Inline SVG only. The container's font stack has no glyph for ⟳ ▶ ▾ ✕ — a
  // unicode symbol renders as a tofu box here, and a *stroked* square reads as
  // tofu too, so anything meant as a dot is filled.
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  close: "M18 6L6 18M6 6l12 12",
  refresh: "M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  table: "M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18",
  chart: "M3 3v18h18 M7 15l4-6 4 3 5-8"
}, a = {
  label: { fontSize: w.label, textTransform: "uppercase", letterSpacing: ".06em" },
  mono: { fontSize: w.mono, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  th: {
    fontSize: w.label,
    textTransform: "uppercase",
    letterSpacing: ".06em",
    fontWeight: 500,
    textAlign: "left",
    padding: "5px 8px",
    color: "var(--color-text-muted)",
    borderBottom: "1px solid var(--color-border)"
  },
  td: { fontSize: w.row, padding: "5px 8px", borderBottom: "1px solid var(--color-border)" },
  btn: {
    fontSize: w.label,
    padding: "3px 9px",
    borderRadius: 6,
    border: "1px solid var(--color-border)",
    color: "var(--color-text-muted)",
    background: "transparent",
    lineHeight: 1.6,
    whiteSpace: "nowrap",
    cursor: "pointer"
  }
}, Re = {
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
function U(e) {
  const f = Re[e.metric_type];
  return f || {
    label: e.metric_type.replace(/_/g, " "),
    group: "Other",
    // No numeric column at all -> the only quantity it has is elapsed time.
    agg: e.numeric_samples === 0 ? "duration" : "avg",
    decimals: 1
  };
}
const H = 86400, ce = { hour: 3600, day: H, week: 7 * H, month: 30.44 * H }, de = [
  { id: "7d", label: "7d", days: 7 },
  { id: "30d", label: "30d", days: 30 },
  { id: "90d", label: "90d", days: 90 },
  { id: "1y", label: "1y", days: 365 },
  { id: "5y", label: "5y", days: 365 * 5 },
  { id: "all", label: "All", days: null }
];
function Ae(e) {
  return e <= 3 * H ? "hour" : e <= 120 * H ? "day" : e <= 3 * 365 * H ? "week" : "month";
}
function Be(e) {
  const { useState: f, useEffect: D, useCallback: ue, useMemo: j, useRef: te } = e.React, me = (t, l) => e.sdk.api.fetch(`/api/apps/${Te}${t}`, l), P = async (t) => {
    const l = await me(t);
    let n = null;
    try {
      n = await l.json();
    } catch {
    }
    if (!l.ok) {
      const o = new Error(n && (n.detail || n.error) || `HTTP ${l.status}`);
      throw o.status = l.status, o;
    }
    return n;
  }, K = (t) => {
    const l = new URLSearchParams();
    for (const [o, r] of Object.entries(t))
      r != null && r !== "" && l.set(o, String(r));
    const n = l.toString();
    return n ? `?${n}` : "";
  }, A = (t, l = 1) => t == null || Number.isNaN(t) ? "—" : Math.abs(t) >= 1e4 ? Math.round(t).toLocaleString() : t.toFixed(l), V = (t, l) => {
    const n = new Date(t * 1e3);
    return l === "hour" ? n.toLocaleString(void 0, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : l === "month" ? n.toLocaleDateString(void 0, { month: "short", year: "numeric" }) : n.toLocaleDateString(void 0, { month: "short", day: "numeric", year: "numeric" });
  }, he = (t, l) => {
    const n = new Date(t * 1e3);
    return l === "hour" ? n.toLocaleTimeString(void 0, { hour: "2-digit", minute: "2-digit" }) : l === "month" ? n.toLocaleDateString(void 0, { month: "short", year: "2-digit" }) : n.toLocaleDateString(void 0, { month: "short", day: "numeric" });
  }, Q = (t) => new Date(t * 1e3).toLocaleString(void 0, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }), ge = (t) => t >= 1e3 ? `${(t / 1e3).toFixed(t >= 1e4 ? 0 : 1)}k` : String(t);
  function pe() {
    const [t, l] = f("dark");
    return D(() => {
      const n = () => {
        try {
          const i = getComputedStyle(document.documentElement).getPropertyValue("--color-bg-primary").trim().match(/^#([0-9a-f]{6})$/i);
          if (!i) return;
          const d = parseInt(i[1], 16), u = (0.2126 * (d >> 16 & 255) + 0.7152 * (d >> 8 & 255) + 0.0722 * (d & 255)) / 255;
          l(u > 0.5 ? "light" : "dark");
        } catch {
        }
      };
      n();
      const o = new MutationObserver(n);
      return o.observe(document.documentElement, { attributes: !0, attributeFilter: ["class", "data-theme", "style"] }), () => o.disconnect();
    }, []), Ce[t];
  }
  function X({ d: t, size: l = 12, color: n = "currentColor", style: o }) {
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
        style: { flexShrink: 0, ...o }
      },
      /* @__PURE__ */ e.h("path", { d: t })
    );
  }
  function k({ children: t }) {
    return /* @__PURE__ */ e.h("div", { style: {
      padding: "28px 16px",
      textAlign: "center",
      fontSize: w.row,
      color: "var(--color-text-muted)",
      lineHeight: 1.7
    } }, t);
  }
  function q({ active: t, onClick: l, children: n, title: o }) {
    return /* @__PURE__ */ e.h(
      "button",
      {
        onClick: l,
        title: o,
        style: {
          ...a.btn,
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
    const t = te(null), [l, n] = f({ width: 0, height: 0 });
    return D(() => {
      if (!t.current) return;
      const o = new ResizeObserver((r) => {
        const i = r[0].contentRect;
        n({ width: i.width, height: i.height });
      });
      return o.observe(t.current), () => o.disconnect();
    }, []), [t, l];
  }
  const N = { top: 12, right: 16, bottom: 24, left: 48 };
  function fe(t, l, n = 4) {
    if (!(l > t)) return [t];
    const o = (l - t) / n, r = Math.pow(10, Math.floor(Math.log10(o))), i = o / r, d = (i >= 5 ? 10 : i >= 2 ? 5 : i >= 1 ? 2 : 1) * r, u = [];
    for (let m = Math.ceil(t / d) * d; m <= l + 1e-9; m += d) u.push(m);
    return u;
  }
  function ye({ points: t, bucket: l, meta: n, unit: o, palette: r, onPick: i, picked: d }) {
    const [u, { width: m }] = le(), [c, x] = f(null), _ = te(null), y = 240, b = Math.max(m, 240), T = b - N.left - N.right, p = y - N.top - N.bottom, S = n.agg === "avg" ? "line" : "bar", J = j(() => {
      if (!t || t.length === 0) return null;
      const s = ($) => n.agg === "sum" ? $.sum : n.agg === "duration" ? $.duration_s === null ? null : $.duration_s / 3600 : $.avg, v = t.map(($) => ({ ...$, v: s($) })).filter(($) => $.v !== null);
      if (v.length === 0) return null;
      const G = v[0].bucket_ts, F = ce[l] || H, Z = v[v.length - 1].bucket_ts + F;
      let B, z;
      if (S === "line") {
        B = Math.min(...v.map((O) => O.min === null ? O.v : O.min)), z = Math.max(...v.map((O) => O.max === null ? O.v : O.max)), z - B < 1e-9 && (B -= 1, z += 1);
        const $ = (z - B) * 0.08;
        B -= $, z += $;
      } else
        B = 0, z = Math.max(...v.map(($) => $.v)) * 1.08 || 1;
      return { rows: v, t0: G, t1: Z, lo: B, hi: z, span: F };
    }, [t, l, n.agg, S]);
    if (!J)
      return /* @__PURE__ */ e.h("div", { ref: u }, /* @__PURE__ */ e.h(k, null, "No samples in this range."));
    const { rows: g, t0: C, t1: L, lo: R, hi: E, span: W } = J, h = (s) => N.left + (s - C) / (L - C) * T, M = (s) => N.top + p - (s - R) / (E - R) * p, re = fe(R, E, 4), Y = Math.max(2, Math.min(6, Math.floor(T / 90))), ne = Array.from({ length: Y + 1 }, (s, v) => C + (L - C) * v / Y), $e = g.map((s, v) => `${v === 0 ? "M" : "L"}${h(s.bucket_ts + W / 2).toFixed(2)},${M(s.v).toFixed(2)}`).join(" "), ae = S === "line" && g.some((s) => s.min !== null && s.max !== null) ? `${g.map((s, v) => `${v === 0 ? "M" : "L"}${h(s.bucket_ts + W / 2).toFixed(2)},${M(s.max ?? s.v).toFixed(2)}`).join(" ")} ${g.slice().reverse().map((s) => `L${h(s.bucket_ts + W / 2).toFixed(2)},${M(s.min ?? s.v).toFixed(2)}`).join(" ")} Z` : null, oe = Math.max(1, T / ((L - C) / W) - 2), ie = (s) => {
      const v = _.current.getBoundingClientRect(), G = s - v.left;
      let F = null, Z = 1 / 0;
      for (const B of g) {
        const z = Math.abs(h(B.bucket_ts + W / 2) - G);
        z < Z && (Z = z, F = B);
      }
      return F;
    }, ee = g[g.length - 1];
    return /* @__PURE__ */ e.h("div", { ref: u, style: { position: "relative", width: "100%" } }, /* @__PURE__ */ e.h(
      "svg",
      {
        ref: _,
        width: "100%",
        height: y,
        viewBox: `0 0 ${b} ${y}`,
        style: { display: "block", overflow: "visible" },
        onMouseMove: (s) => x(ie(s.clientX)),
        onMouseLeave: () => x(null),
        onClick: (s) => {
          const v = ie(s.clientX);
          v && i && i(v);
        }
      },
      re.map((s) => /* @__PURE__ */ e.h("g", { key: `y${s}` }, /* @__PURE__ */ e.h(
        "line",
        {
          x1: N.left,
          x2: b - N.right,
          y1: M(s),
          y2: M(s),
          stroke: "var(--color-border)",
          strokeWidth: "1",
          opacity: "0.55"
        }
      ), /* @__PURE__ */ e.h(
        "text",
        {
          x: N.left - 8,
          y: M(s) + 3,
          textAnchor: "end",
          fontSize: w.label,
          fill: "var(--color-text-muted)"
        },
        A(s, s >= 100 ? 0 : 1)
      ))),
      ne.map((s, v) => /* @__PURE__ */ e.h(
        "text",
        {
          key: `x${v}`,
          x: h(s),
          y: y - 6,
          textAnchor: v === 0 ? "start" : v === ne.length - 1 ? "end" : "middle",
          fontSize: w.label,
          fill: "var(--color-text-muted)"
        },
        he(s, l)
      )),
      ae && /* @__PURE__ */ e.h("path", { d: ae, fill: r.s1, opacity: "0.16", stroke: "none" }),
      S === "bar" && g.map((s) => {
        const v = d && d.bucket_ts === s.bucket_ts, G = c && c.bucket_ts === s.bucket_ts, F = Math.max(1, N.top + p - M(s.v));
        return /* @__PURE__ */ e.h(
          "rect",
          {
            key: s.bucket_ts,
            x: h(s.bucket_ts) + 1,
            y: M(s.v),
            width: oe,
            height: F,
            rx: Math.min(4, oe / 2),
            fill: r.s1,
            opacity: v ? 1 : G ? 0.92 : 0.78
          }
        );
      }),
      S === "line" && /* @__PURE__ */ e.h(
        "path",
        {
          d: $e,
          fill: "none",
          stroke: r.s1,
          strokeWidth: "2",
          strokeLinejoin: "round",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ e.h(
        "text",
        {
          x: Math.min(h(ee.bucket_ts + W / 2) + 6, b - N.right),
          y: Math.max(M(ee.v) - 7, N.top + 8),
          textAnchor: "end",
          fontSize: w.mono,
          fontWeight: "600",
          fill: "var(--color-text-primary)"
        },
        A(ee.v, n.decimals),
        o ? ` ${o}` : ""
      ),
      c && /* @__PURE__ */ e.h("g", { pointerEvents: "none" }, /* @__PURE__ */ e.h(
        "line",
        {
          x1: h(c.bucket_ts + W / 2),
          x2: h(c.bucket_ts + W / 2),
          y1: N.top,
          y2: N.top + p,
          stroke: "var(--color-text-muted)",
          strokeWidth: "1",
          opacity: "0.5",
          strokeDasharray: "3 3"
        }
      ), S === "line" && /* @__PURE__ */ e.h(
        "circle",
        {
          cx: h(c.bucket_ts + W / 2),
          cy: M(c.v),
          r: "4.5",
          fill: r.s1,
          stroke: "var(--color-bg-primary)",
          strokeWidth: "2"
        }
      ))
    ), c && /* @__PURE__ */ e.h("div", { style: {
      position: "absolute",
      pointerEvents: "none",
      left: Math.min(Math.max(h(c.bucket_ts + W / 2) - 70, 0), Math.max(b - 150, 0)),
      top: 4,
      width: 150,
      background: "var(--color-bg-header)",
      border: "1px solid var(--color-border-active)",
      borderRadius: 6,
      padding: "6px 8px",
      zIndex: 5
    } }, /* @__PURE__ */ e.h("div", { style: { ...a.label, color: "var(--color-text-muted)", marginBottom: 3 } }, V(c.bucket_ts, l)), /* @__PURE__ */ e.h("div", { style: { fontSize: w.row, color: "var(--color-text-primary)", fontWeight: 600 } }, A(c.v, n.decimals), o ? ` ${o}` : ""), c.min !== null && c.max !== null && n.agg === "avg" && /* @__PURE__ */ e.h("div", { style: { ...a.mono, color: "var(--color-text-muted)" } }, A(c.min, n.decimals), " – ", A(c.max, n.decimals)), /* @__PURE__ */ e.h("div", { style: { ...a.mono, color: "var(--color-text-muted)" } }, c.samples.toLocaleString(), " samples")));
  }
  function ve({ metrics: t, selected: l, onSelect: n }) {
    const o = j(() => {
      const r = /* @__PURE__ */ new Map();
      for (const i of t) {
        const d = U(i).group;
        r.has(d) || r.set(d, []), r.get(d).push(i);
      }
      return We.filter((i) => r.has(i)).map((i) => [i, r.get(i).sort((d, u) => U(d).label.localeCompare(U(u).label))]);
    }, [t]);
    return /* @__PURE__ */ e.h("div", { className: "overflow-auto", style: { padding: "6px 6px 12px" } }, o.map(([r, i]) => /* @__PURE__ */ e.h("div", { key: r, style: { marginBottom: 8 } }, /* @__PURE__ */ e.h("div", { style: { ...a.label, color: "var(--color-text-muted)", padding: "4px 6px" } }, r), i.map((d) => {
      const u = l === d.metric_type;
      return /* @__PURE__ */ e.h(
        "div",
        {
          key: d.metric_type,
          onClick: () => n(d.metric_type),
          className: "flex items-center gap-2 cursor-pointer",
          style: {
            padding: "4px 6px",
            borderRadius: 5,
            fontSize: w.row,
            background: u ? "rgba(127,127,160,.16)" : "transparent",
            color: "var(--color-text-primary)",
            fontWeight: u ? 600 : 400
          }
        },
        /* @__PURE__ */ e.h("span", { className: "truncate", style: { flex: 1 } }, U(d).label),
        /* @__PURE__ */ e.h("span", { style: { ...a.mono, color: "var(--color-text-muted)" } }, ge(d.samples))
      );
    }))));
  }
  function xe({ metricType: t, bucket: l, point: n, meta: o, onClose: r }) {
    const [i, d] = f(null), [u, m] = f(null);
    return D(() => {
      let c = !0;
      d(null), m(null);
      const x = ce[l] || H;
      return P(`/health/samples${K({
        metric_type: t,
        from_ts: n.bucket_ts,
        until_ts: n.bucket_ts + x,
        order: "asc",
        limit: 500
      })}`).then((_) => {
        c && d(_.samples || []);
      }).catch((_) => {
        c && m(_.message);
      }), () => {
        c = !1;
      };
    }, [t, l, n.bucket_ts]), /* @__PURE__ */ e.h("div", { style: {
      border: "1px solid var(--color-border)",
      borderRadius: 8,
      background: "var(--color-bg-secondary)",
      marginTop: 10,
      overflow: "hidden"
    } }, /* @__PURE__ */ e.h("div", { className: "flex items-center gap-2", style: { padding: "6px 10px", borderBottom: "1px solid var(--color-border)" } }, /* @__PURE__ */ e.h("span", { style: { fontSize: w.tab, color: "var(--color-text-primary)", fontWeight: 600 } }, V(n.bucket_ts, l)), /* @__PURE__ */ e.h("span", { style: { ...a.mono, color: "var(--color-text-muted)" } }, n.samples.toLocaleString(), " samples"), /* @__PURE__ */ e.h("button", { onClick: r, style: { ...a.btn, marginLeft: "auto", padding: "2px 6px" } }, /* @__PURE__ */ e.h(X, { d: I.close, size: 11 }))), /* @__PURE__ */ e.h("div", { className: "overflow-auto", style: { maxHeight: 220 } }, u && /* @__PURE__ */ e.h(k, null, "Couldn’t load samples — ", u), !u && i === null && /* @__PURE__ */ e.h(k, null, "Loading…"), i && i.length === 0 && /* @__PURE__ */ e.h(k, null, "No individual samples in this bucket."), i && i.length > 0 && /* @__PURE__ */ e.h("table", { style: { width: "100%", borderCollapse: "collapse" } }, /* @__PURE__ */ e.h("thead", null, /* @__PURE__ */ e.h("tr", null, /* @__PURE__ */ e.h("th", { style: a.th }, "When"), /* @__PURE__ */ e.h("th", { style: a.th }, "Value"), /* @__PURE__ */ e.h("th", { style: a.th }, "Source"))), /* @__PURE__ */ e.h("tbody", null, i.map((c, x) => /* @__PURE__ */ e.h("tr", { key: x }, /* @__PURE__ */ e.h("td", { style: { ...a.td, ...a.mono, whiteSpace: "nowrap" } }, Q(c.start_ts)), /* @__PURE__ */ e.h("td", { style: { ...a.td, color: "var(--color-text-primary)" } }, c.value !== null ? `${A(c.value, o.decimals)} ${c.unit || ""}` : c.text_value || "—"), /* @__PURE__ */ e.h("td", { style: { ...a.td, ...a.mono, color: "var(--color-text-muted)" } }, (c.source_bundle || "").split(".").pop() || "—")))))));
  }
  function be({ metrics: t, selected: l, onSelect: n, palette: o }) {
    const [r, i] = f("90d"), [d, u] = f(null), [m, c] = f(null), [x, _] = f(null), [y, b] = f(!1), [T, p] = f(null), [S, J] = f(!1), g = t.find((h) => h.metric_type === l), C = g ? U(g) : null, L = j(() => {
      if (!g) return null;
      const h = de.find((Y) => Y.id === r), M = (g.last_ts || Date.now() / 1e3) + 1;
      return { from: h.days === null ? g.first_ts : Math.max(g.first_ts, M - h.days * H), until: M };
    }, [g, r]), R = j(() => L ? d || Ae(L.until - L.from) : "day", [L, d]);
    if (D(() => {
      u(null), p(null);
    }, [l, r]), D(() => {
      if (!g || !L) return;
      let h = !0;
      return b(!0), _(null), P(`/health/series${K({
        metric_type: g.metric_type,
        bucket: R,
        from_ts: L.from,
        until_ts: L.until,
        tz_offset_minutes: -(/* @__PURE__ */ new Date()).getTimezoneOffset()
      })}`).then((M) => {
        h && (c(M.points || []), b(!1));
      }).catch((M) => {
        h && (_(M.message), b(!1));
      }), () => {
        h = !1;
      };
    }, [g && g.metric_type, R, L && L.from, L && L.until]), !g) return /* @__PURE__ */ e.h(k, null, "Pick a metric on the left.");
    const E = C.agg === "duration" ? "h" : g.unit || "", W = { avg: "average", sum: "total", duration: "hours" }[C.agg];
    return /* @__PURE__ */ e.h("div", { className: "flex flex-col h-full min-h-0" }, /* @__PURE__ */ e.h("div", { className: "flex items-center gap-2 shrink-0", style: { flexWrap: "wrap", marginBottom: 10 } }, de.map((h) => /* @__PURE__ */ e.h(q, { key: h.id, active: r === h.id, onClick: () => i(h.id) }, h.label)), /* @__PURE__ */ e.h("span", { style: { width: 1, height: 16, background: "var(--color-border)", margin: "0 2px" } }), ["hour", "day", "week", "month"].map((h) => /* @__PURE__ */ e.h(
      q,
      {
        key: h,
        active: R === h,
        onClick: () => u(h),
        title: `Group by ${h}`
      },
      h
    )), /* @__PURE__ */ e.h(q, { active: S, onClick: () => J(!S), title: "Table view" }, /* @__PURE__ */ e.h(X, { d: S ? I.chart : I.table, size: 11 }), S ? "Chart" : "Table")), /* @__PURE__ */ e.h("div", { className: "shrink-0", style: { marginBottom: 2 } }, /* @__PURE__ */ e.h("span", { style: { fontSize: w.title, fontWeight: 600, color: "var(--color-text-primary)" } }, C.label), /* @__PURE__ */ e.h("span", { style: { fontSize: w.row, color: "var(--color-text-muted)", marginLeft: 8 } }, W, " per ", R, E ? ` · ${E}` : "")), /* @__PURE__ */ e.h("div", { className: "shrink-0", style: { ...a.mono, color: "var(--color-text-muted)", marginBottom: 8 } }, g.samples.toLocaleString(), " samples · ", V(g.first_ts, "day"), " → ", V(g.last_ts, "day"), g.units_vary && " · mixed units"), /* @__PURE__ */ e.h("div", { className: "flex-1 min-h-0 overflow-auto" }, x && /* @__PURE__ */ e.h(k, null, "Couldn’t load this metric — ", x), !x && y && m === null && /* @__PURE__ */ e.h(k, null, "Loading…"), !x && m && !S && /* @__PURE__ */ e.h(
      ye,
      {
        points: m,
        bucket: R,
        meta: C,
        unit: E,
        palette: o,
        onPick: p,
        picked: T
      }
    ), !x && m && S && /* @__PURE__ */ e.h(ke, { points: m, bucket: R, meta: C, unit: E }), !x && m && m.length > 0 && !S && /* @__PURE__ */ e.h("div", { style: { ...a.mono, color: "var(--color-text-muted)", marginTop: 4 } }, "Click a ", R, " to see its individual readings."), T && !S && /* @__PURE__ */ e.h(
      xe,
      {
        metricType: g.metric_type,
        bucket: R,
        point: T,
        meta: C,
        onClose: () => p(null)
      }
    )));
  }
  function ke({ points: t, bucket: l, meta: n, unit: o }) {
    return t.length ? /* @__PURE__ */ e.h("table", { style: { width: "100%", borderCollapse: "collapse" } }, /* @__PURE__ */ e.h("thead", null, /* @__PURE__ */ e.h("tr", null, /* @__PURE__ */ e.h("th", { style: a.th }, l), /* @__PURE__ */ e.h("th", { style: a.th }, "samples"), /* @__PURE__ */ e.h("th", { style: a.th }, "min"), /* @__PURE__ */ e.h("th", { style: a.th }, "avg"), /* @__PURE__ */ e.h("th", { style: a.th }, "max"), /* @__PURE__ */ e.h("th", { style: a.th }, n.agg === "duration" ? "hours" : `total${o ? ` (${o})` : ""}`))), /* @__PURE__ */ e.h("tbody", null, t.map((r) => /* @__PURE__ */ e.h("tr", { key: r.bucket_ts }, /* @__PURE__ */ e.h("td", { style: { ...a.td, whiteSpace: "nowrap" } }, V(r.bucket_ts, l)), /* @__PURE__ */ e.h("td", { style: { ...a.td, ...a.mono } }, r.samples.toLocaleString()), /* @__PURE__ */ e.h("td", { style: { ...a.td, ...a.mono } }, A(r.min, n.decimals)), /* @__PURE__ */ e.h("td", { style: { ...a.td, ...a.mono } }, A(r.avg, n.decimals)), /* @__PURE__ */ e.h("td", { style: { ...a.td, ...a.mono } }, A(r.max, n.decimals)), /* @__PURE__ */ e.h("td", { style: { ...a.td, ...a.mono, color: "var(--color-text-primary)" } }, n.agg === "duration" ? A(r.duration_s === null ? null : r.duration_s / 3600, 1) : A(r.sum, n.decimals)))))) : /* @__PURE__ */ e.h(k, null, "No samples in this range.");
  }
  function we({ palette: t }) {
    const [l, n] = f(7), [o, r] = f(null), [i, d] = f(null);
    D(() => {
      let m = !0;
      r(null), d(null);
      const c = Date.now() / 1e3;
      return P(`/health/locations${K({ from_ts: c - l * H, until_ts: c, limit: 2e3 })}`).then((x) => {
        m && r(x);
      }).catch((x) => {
        m && d(x.message);
      }), () => {
        m = !1;
      };
    }, [l]);
    const u = j(() => {
      if (!o || !o.points.length) return null;
      const m = o.points, c = m.map((b) => b.latitude), x = m.map((b) => b.longitude), _ = {
        minLat: Math.min(...c),
        maxLat: Math.max(...c),
        minLon: Math.min(...x),
        maxLon: Math.max(...x)
      }, y = [...new Set(m.map((b) => b.source))];
      return { pts: m, bounds: _, sources: y };
    }, [o]);
    return i ? /* @__PURE__ */ e.h(k, null, "Couldn’t load locations — ", i) : o ? /* @__PURE__ */ e.h("div", { className: "flex flex-col h-full min-h-0" }, /* @__PURE__ */ e.h("div", { className: "flex items-center gap-2 shrink-0", style: { marginBottom: 10 } }, [1, 7, 30, 365].map((m) => /* @__PURE__ */ e.h(q, { key: m, active: l === m, onClick: () => n(m) }, m === 1 ? "24h" : m === 365 ? "1y" : `${m}d`)), /* @__PURE__ */ e.h("span", { style: { ...a.mono, color: "var(--color-text-muted)", marginLeft: "auto" } }, o.total.toLocaleString(), " fixes", o.total > o.points.length && ` · showing first ${o.points.length.toLocaleString()}`)), u ? /* @__PURE__ */ e.h("div", { className: "flex-1 min-h-0 overflow-auto" }, /* @__PURE__ */ e.h(_e, { model: u, palette: t }), /* @__PURE__ */ e.h("div", { style: { ...a.mono, color: "var(--color-text-muted)", marginTop: 8 } }, u.bounds.minLat.toFixed(4), ", ", u.bounds.minLon.toFixed(4), "  →  ", u.bounds.maxLat.toFixed(4), ", ", u.bounds.maxLon.toFixed(4))) : /* @__PURE__ */ e.h(k, null, "No location fixes in this range.")) : /* @__PURE__ */ e.h(k, null, "Loading…");
  }
  function _e({ model: t, palette: l }) {
    const [n, { width: o }] = le(), r = 300, i = Math.max(o, 240), d = 16, { bounds: u, pts: m, sources: c } = t, x = Math.max(u.maxLat - u.minLat, 1e-4), _ = Math.max(u.maxLon - u.minLon, 1e-4), y = (p) => d + (p - u.minLon) / _ * (i - d * 2), b = (p) => r - d - (p - u.minLat) / x * (r - d * 2), T = (p) => [l.s1, l.s2, l.s3][c.indexOf(p) % 3];
    return /* @__PURE__ */ e.h("div", { ref: n }, /* @__PURE__ */ e.h(
      "svg",
      {
        width: "100%",
        height: r,
        viewBox: `0 0 ${i} ${r}`,
        style: { display: "block", border: "1px solid var(--color-border)", borderRadius: 8 }
      },
      m.map((p, S) => /* @__PURE__ */ e.h(
        "circle",
        {
          key: S,
          cx: y(p.longitude),
          cy: b(p.latitude),
          r: "3.2",
          fill: T(p.source),
          opacity: "0.7"
        },
        /* @__PURE__ */ e.h("title", null, `${p.source} · ${Q(p.ts)}`)
      ))
    ), c.length >= 2 && /* @__PURE__ */ e.h("div", { className: "flex items-center gap-3", style: { marginTop: 6 } }, c.map((p) => /* @__PURE__ */ e.h("span", { key: p, className: "flex items-center gap-1", style: { fontSize: w.row, color: "var(--color-text-muted)" } }, /* @__PURE__ */ e.h("svg", { width: "9", height: "9", viewBox: "0 0 9 9" }, /* @__PURE__ */ e.h("circle", { cx: "4.5", cy: "4.5", r: "4.5", fill: T(p) })), p))));
  }
  function Se() {
    const [t, l] = f(null), [n, o] = f(null);
    return D(() => {
      let r = !0;
      return P(`/health/log${K({ limit: 200 })}`).then((i) => {
        r && l(i.entries || []);
      }).catch((i) => {
        r && o(i.message);
      }), () => {
        r = !1;
      };
    }, []), n ? /* @__PURE__ */ e.h(k, null, "Couldn’t load notes — ", n) : t ? t.length ? /* @__PURE__ */ e.h("div", { className: "overflow-auto h-full" }, /* @__PURE__ */ e.h("table", { style: { width: "100%", borderCollapse: "collapse" } }, /* @__PURE__ */ e.h("thead", null, /* @__PURE__ */ e.h("tr", null, /* @__PURE__ */ e.h("th", { style: a.th }, "When"), /* @__PURE__ */ e.h("th", { style: a.th }, "Category"), /* @__PURE__ */ e.h("th", { style: a.th }, "Note"), /* @__PURE__ */ e.h("th", { style: a.th }, "Where"))), /* @__PURE__ */ e.h("tbody", null, t.map((r, i) => /* @__PURE__ */ e.h("tr", { key: i }, /* @__PURE__ */ e.h("td", { style: { ...a.td, ...a.mono, whiteSpace: "nowrap" } }, Q(r.ts)), /* @__PURE__ */ e.h("td", { style: { ...a.td, ...a.label, color: "var(--color-text-muted)" } }, r.category), /* @__PURE__ */ e.h("td", { style: { ...a.td, color: "var(--color-text-primary)" } }, r.text), /* @__PURE__ */ e.h("td", { style: { ...a.td, color: "var(--color-text-muted)" } }, r.location_label || (r.latitude !== null ? `${r.latitude.toFixed(3)}, ${r.longitude.toFixed(3)}` : "—"))))))) : /* @__PURE__ */ e.h(k, null, "No log entries yet. These are the free-text notes logged from chat or the watch.") : /* @__PURE__ */ e.h(k, null, "Loading…");
  }
  const Me = [
    { id: "chart", label: "Metrics" },
    { id: "places", label: "Places" },
    { id: "notes", label: "Notes" }
  ];
  function Le() {
    const t = pe(), [l, n] = f("chart"), [o, r] = f(null), [i, d] = f(null), [u, m] = f(null), [c, x] = f(null), _ = ue(() => {
      m(null), P("/health/status").then((y) => (x(y), y.configured ? P("/health/metrics") : null)).then((y) => {
        if (!y) return;
        const b = y.metrics || [];
        r(b), d((T) => T || // Open on heart rate when it exists — it is the densest series and
        // the one that makes the window immediately look like something.
        (b.find((p) => p.metric_type === "heart_rate") ? "heart_rate" : b[0] && b[0].metric_type || null));
      }).catch((y) => m(y));
    }, []);
    return D(_, [_]), u ? /* @__PURE__ */ e.h(k, null, /* @__PURE__ */ e.h("div", { style: { color: "var(--color-text-primary)", marginBottom: 6 } }, "Couldn’t reach the health data."), /* @__PURE__ */ e.h("div", null, u.message), u.status === 403 && /* @__PURE__ */ e.h("div", { style: { marginTop: 8 } }, "This workspace doesn’t own the health dataset — it lives with the workspace on the legacy schema."), /* @__PURE__ */ e.h("button", { onClick: _, style: { ...a.btn, marginTop: 12 } }, /* @__PURE__ */ e.h(X, { d: I.refresh, size: 11 }), " Retry")) : c && !c.configured ? /* @__PURE__ */ e.h(k, null, /* @__PURE__ */ e.h("div", { style: { color: "var(--color-text-primary)", marginBottom: 6 } }, "No route to the health data."), /* @__PURE__ */ e.h("div", null, "The samples live in aw-backend, and this workspace has no", /* @__PURE__ */ e.h("span", { style: { ...a.mono } }, " AW_WORKSPACE_HOST_TOKEN "), "to reach it with — that credential is minted by the aw-remote-host", /* @__PURE__ */ e.h("span", { style: { ...a.mono } }, " /link "), " handshake.")) : o ? o.length ? /* @__PURE__ */ e.h("div", { className: "flex h-full min-h-0", style: { background: "var(--color-bg-primary)" } }, /* @__PURE__ */ e.h(
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
        /* @__PURE__ */ e.h(X, { d: I.activity, size: 13, color: "var(--color-text-muted)" }),
        /* @__PURE__ */ e.h("span", { style: { fontSize: w.title, fontWeight: 600, color: "var(--color-text-primary)" } }, "Health")
      ),
      /* @__PURE__ */ e.h(ve, { metrics: o, selected: i, onSelect: d })
    ), /* @__PURE__ */ e.h("div", { className: "flex flex-col flex-1 min-w-0 min-h-0" }, /* @__PURE__ */ e.h(
      "div",
      {
        className: "flex items-center gap-1 shrink-0",
        style: { padding: "6px 10px", borderBottom: "1px solid var(--color-border)" }
      },
      Me.map((y) => /* @__PURE__ */ e.h(
        "button",
        {
          key: y.id,
          onClick: () => n(y.id),
          style: {
            ...a.btn,
            borderColor: "transparent",
            color: l === y.id ? "var(--color-text-primary)" : "var(--color-text-muted)",
            fontSize: w.tab,
            fontWeight: l === y.id ? 600 : 400,
            background: l === y.id ? "rgba(127,127,160,.14)" : "transparent"
          }
        },
        y.label
      ))
    ), /* @__PURE__ */ e.h("div", { className: "flex-1 min-h-0", style: { padding: 12 } }, l === "chart" && /* @__PURE__ */ e.h(be, { metrics: o, selected: i, onSelect: d, palette: t }), l === "places" && /* @__PURE__ */ e.h(we, { palette: t }), l === "notes" && /* @__PURE__ */ e.h(Se, null)))) : /* @__PURE__ */ e.h(k, null, "No health samples have been synced yet.") : /* @__PURE__ */ e.h(k, null, "Loading…");
  }
  function Ne() {
    return /* @__PURE__ */ e.h(
      "button",
      {
        onClick: () => {
          var t;
          return (t = window.__awOpenAppWindow) == null ? void 0 : t.call(window, se, void 0, "Health");
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
        /* @__PURE__ */ e.h("path", { d: I.activity })
      ),
      /* @__PURE__ */ e.h("span", { style: { fontSize: w.nav, color: "var(--color-text-primary)" } }, "Health")
    );
  }
  e.registerWindow(se, Le), e.registerSlot("core.nav.workspace", Ne);
}
export {
  Be as default,
  Be as register
};
