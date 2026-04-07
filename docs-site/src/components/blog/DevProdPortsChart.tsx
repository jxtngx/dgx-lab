import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

/** Listening ports: `make dev` vs Docker + nginx (FastAPI still binds :8000 in both). */
const DATA = [
  { name: "Browser entry", dev: 3000, docker: 80 },
  { name: "FastAPI (uvicorn)", dev: 8000, docker: 8000 },
];

const DEV = "#22d3ee";
const DOCKER = "#a78bfa";

export default function DevProdPortsChart() {
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
        TCP listeners (local dev vs Docker)
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={DATA}
          margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
          barGap={6}
          barCategoryGap="18%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#222230" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{
              fill: "#8b8993",
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
            }}
            tickLine={{ stroke: "#222230" }}
            axisLine={{ stroke: "#222230" }}
          />
          <YAxis
            tick={{
              fill: "#8b8993",
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
            }}
            tickLine={{ stroke: "#222230" }}
            axisLine={{ stroke: "#222230" }}
            label={{
              value: "port",
              position: "insideLeft",
              fill: "#5a5868",
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              angle: -90,
              dy: 40,
            }}
          />
          <Tooltip
            contentStyle={{
              background: "#161619",
              border: "1px solid #222230",
              borderRadius: 6,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              color: "#e8e6e3",
            }}
            formatter={(value: number) => [`${value}`, ""]}
          />
          <Legend
            wrapperStyle={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: "#8b8993",
            }}
          />
          <Bar dataKey="dev" name="make dev" fill={DEV} radius={[4, 4, 0, 0]} />
          <Bar dataKey="docker" name="Docker + nginx" fill={DOCKER} radius={[4, 4, 0, 0]} />
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
        Dev: open Next on 3000; browser calls `/api/*` via Next proxy. Docker: nginx :80 →
        frontend + `/api/` → FastAPI.
      </div>
    </div>
  );
}
