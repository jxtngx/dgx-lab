import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const MEMORY_ROW = [
  { name: "DGX_LAB_MEMORY_TOTAL_GB", value: 128, max: 128, unit: "GB" },
];

const BW_ROW = [
  { name: "DGX_LAB_MEMORY_BW_MAX_GBS", value: 273, max: 320, unit: "GB/s" },
];

function MiniBar({
  title,
  data,
  caption,
}: {
  title: string;
  data: typeof MEMORY_ROW;
  caption: string;
}) {
  const max = data[0].max;
  return (
    <div style={{ marginBottom: "1rem" }}>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: "#5a5868",
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      <ResponsiveContainer width="100%" height={96}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
          barSize={24}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#222230"
            horizontal={false}
          />
          <XAxis
            type="number"
            domain={[0, max]}
            tick={{
              fill: "#8b8993",
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
            }}
            tickLine={{ stroke: "#222230" }}
            axisLine={{ stroke: "#222230" }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={200}
            tick={{
              fill: "#8b8993",
              fontSize: 9,
              fontFamily: "'JetBrains Mono', monospace",
            }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#161619",
              border: "1px solid #222230",
              borderRadius: 6,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: "#e8e6e3",
            }}
            formatter={(value: number, _name, item) => {
              const u = (item?.payload as (typeof MEMORY_ROW)[0])?.unit ?? "";
              return [`${value} ${u}`, "default"];
            }}
          />
          <Bar dataKey="value" fill="#22d3ee" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: "#5a5868",
        }}
      >
        {caption}
      </div>
    </div>
  );
}

export default function MemoryConstantsBars() {
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
        Memory UI defaults (overridable)
      </div>
      <div
        style={{
          background: "#0f0f12",
          border: "1px solid #222230",
          borderRadius: 8,
          padding: "0.75rem 1rem",
        }}
      >
        <MiniBar
          title="Unified pool size (gauges, fit math)"
          data={MEMORY_ROW}
          caption="Spark default 128 GB — change if you point the UI at different hardware."
        />
        <MiniBar
          title="Bandwidth ceiling (visualization cap)"
          data={BW_ROW}
          caption="Default 273 GB/s — axis cap set to 320 for headroom in the chart."
        />
      </div>
    </div>
  );
}
