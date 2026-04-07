import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

/** Count of env-backed settings in `backend/app/config.py` by concern (path vs memory UI). */
const ROWS = [
  {
    group: "Tool + data paths",
    count: 7,
    color: "#60a5fa",
    detail: "models, experiments, traces, designer×2, curator, datasets",
  },
  {
    group: "Agent + observability",
    count: 5,
    color: "#a78bfa",
    detail: "Cursor/Claude transcripts, LangSmith dir, RAG index, codebase root",
  },
  {
    group: "Memory display",
    count: 2,
    color: "#22d3ee",
    detail: "DGX_LAB_MEMORY_TOTAL_GB, DGX_LAB_MEMORY_BW_MAX_GBS",
  },
];

export default function ConfigEnvGroupsChart() {
  return (
    <div style={{ width: "100%", maxWidth: 720, margin: "1.5rem auto" }}>
      <div
        style={{
          fontFamily: "'Instrument Sans', sans-serif",
          fontSize: "0.6875rem",
          fontWeight: 700,
          textTransform: "uppercase" as const,
          letterSpacing: "0.08em",
          opacity: 0.4,
          marginBottom: "0.5rem",
        }}
      >
        Config surface in config.py
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={ROWS}
          layout="vertical"
          margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
          barSize={32}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#222230"
            horizontal={false}
          />
          <XAxis
            type="number"
            domain={[0, 8]}
            allowDecimals={false}
            tick={{
              fill: "#8b8993",
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
            }}
            tickLine={{ stroke: "#222230" }}
            axisLine={{ stroke: "#222230" }}
          />
          <YAxis
            type="category"
            dataKey="group"
            width={148}
            tick={{
              fill: "#8b8993",
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
            }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof ROWS)[0];
              return (
                <div
                  style={{
                    background: "#161619",
                    border: "1px solid #222230",
                    borderRadius: 6,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: "#e8e6e3",
                    padding: "8px 10px",
                    maxWidth: 360,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.group}</div>
                  <div style={{ color: "#22d3ee", marginBottom: 6 }}>{p.count} env-backed setting(s)</div>
                  <div style={{ color: "#8b8993", lineHeight: 1.4 }}>{p.detail}</div>
                </div>
              );
            }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {ROWS.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: "#5a5868",
          textAlign: "center",
          marginTop: "0.25rem",
        }}
      >
        14 env-backed knobs total &middot; same file you grep for `DGX_LAB_` and `DATA_DESIGNER_HOME`
      </div>
    </div>
  );
}
