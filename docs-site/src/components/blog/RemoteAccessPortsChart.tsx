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

/**
 * What must be reachable on the Spark from the network path you choose.
 * SSH tunnel: only sshd (22); browser talks to localhost on the client.
 */
const DATA = [
  {
    path: "LAN / Tailscale (make dev)",
    ports: 2,
    note: "3000 (Next) + 8000 (FastAPI); browser often only needs 3000",
    color: "#22d3ee",
  },
  {
    path: "LAN / Tailscale (Docker)",
    ports: 1,
    note: "80 (nginx → Next + /api/)",
    color: "#a78bfa",
  },
  {
    path: "SSH tunnel → dev on Spark",
    ports: 1,
    note: "22 only; forwards map client localhost → Spark 3000/8000",
    color: "#60a5fa",
  },
];

export default function RemoteAccessPortsChart() {
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
        Spark-side TCP exposure (planning firewalls)
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={DATA}
          margin={{ top: 8, right: 16, left: 8, bottom: 64 }}
          barCategoryGap="20%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#222230" vertical={false} />
          <XAxis
            dataKey="path"
            tick={{
              fill: "#8b8993",
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
            }}
            tickLine={{ stroke: "#222230" }}
            axisLine={{ stroke: "#222230" }}
            interval={0}
            angle={-18}
            textAnchor="end"
            height={56}
          />
          <YAxis
            allowDecimals={false}
            domain={[0, 3]}
            tick={{
              fill: "#8b8993",
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
            }}
            tickLine={{ stroke: "#222230" }}
            axisLine={{ stroke: "#222230" }}
            label={{
              value: "listen ports (count)",
              position: "insideLeft",
              fill: "#5a5868",
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              angle: -90,
              dy: 36,
            }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof DATA)[0];
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
                    maxWidth: 380,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.path}</div>
                  <div style={{ color: "#22d3ee", marginBottom: 6 }}>
                    {p.ports} port{p.ports === 1 ? "" : "s"} (checklist)
                  </div>
                  <div style={{ color: "#8b8993", lineHeight: 1.4 }}>{p.note}</div>
                </div>
              );
            }}
          />
          <Bar dataKey="ports" radius={[4, 4, 0, 0]}>
            {DATA.map((entry, i) => (
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
        Counts are a firewall checklist, not a performance metric.
      </div>
    </div>
  );
}
