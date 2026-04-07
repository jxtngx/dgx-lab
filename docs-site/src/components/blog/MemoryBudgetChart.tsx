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
  ReferenceLine,
} from "recharts";

interface MemorySegment {
  name: string;
  gb: number;
  color: string;
}

const DEFAULT_SEGMENTS: MemorySegment[] = [
  { name: "OS + system", gb: 4, color: "#5a5868" },
  { name: "CUDA runtime", gb: 2, color: "#3a3848" },
  { name: "Model weights (70B Q4)", gb: 38, color: "#22d3ee" },
  { name: "KV cache", gb: 12, color: "#60a5fa" },
  { name: "Activation memory", gb: 8, color: "#a78bfa" },
  { name: "Available", gb: 64, color: "#1a1a24" },
];

const TOTAL_GB = 128;

interface Props {
  segments?: MemorySegment[];
  totalGb?: number;
}

export default function MemoryBudgetChart({
  segments = DEFAULT_SEGMENTS,
  totalGb = TOTAL_GB,
}: Props) {
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
        128 GB Unified Memory Budget
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={segments}
          layout="vertical"
          margin={{ top: 8, right: 40, left: 120, bottom: 8 }}
          barSize={28}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#222230"
            horizontal={false}
          />
          <XAxis
            type="number"
            domain={[0, totalGb]}
            tick={{
              fill: "#8b8993",
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
            }}
            tickLine={{ stroke: "#222230" }}
            axisLine={{ stroke: "#222230" }}
            unit=" GB"
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{
              fill: "#8b8993",
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
            }}
            tickLine={false}
            axisLine={false}
            width={110}
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
            formatter={(value: number) => [`${value} GB`, "Size"]}
          />
          <ReferenceLine
            x={totalGb}
            stroke="#22d3ee"
            strokeDasharray="3 3"
            strokeOpacity={0.3}
          />
          <Bar dataKey="gb" radius={[0, 4, 4, 0]}>
            {segments.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
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
        DGX Spark GB10 &middot; 128 GB LPDDR5X &middot; ~273 GB/s
      </div>
    </div>
  );
}
