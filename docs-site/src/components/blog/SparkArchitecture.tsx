import React, { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Text, RoundedBox, Float } from "@react-three/drei";
import type { Mesh } from "three";

const CYAN = "#22d3ee";
const SURFACE = "#161619";
const BORDER = "#222230";
const DIM = "#5a5868";
const PURPLE = "#a78bfa";
const BLUE = "#60a5fa";

function ChipBlock({
  position,
  size,
  color,
  label,
  sublabel,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  label: string;
  sublabel?: string;
}) {
  const meshRef = useRef<Mesh>(null);

  return (
    <group position={position}>
      <RoundedBox args={size} radius={0.08} smoothness={4}>
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.85}
          roughness={0.6}
          metalness={0.2}
        />
      </RoundedBox>
      <Text
        position={[0, size[1] / 2 + 0.15, 0]}
        fontSize={0.18}
        color="#e8e6e3"
        font="https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbY2o-flEEny0FZhsfKu5WU4xD-IQ-PuZJJXxfpAO8.woff2"
        anchorX="center"
        anchorY="bottom"
      >
        {label}
      </Text>
      {sublabel && (
        <Text
          position={[0, size[1] / 2 + 0.02, 0]}
          fontSize={0.12}
          color={DIM}
          anchorX="center"
          anchorY="bottom"
        >
          {sublabel}
        </Text>
      )}
    </group>
  );
}

function DataBus({
  from,
  to,
}: {
  from: [number, number, number];
  to: [number, number, number];
}) {
  const points = [from, to];
  return (
    <line>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={2}
          array={new Float32Array([...from, ...to])}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color={CYAN} transparent opacity={0.25} />
    </line>
  );
}

function RotatingScene() {
  const groupRef = useRef<any>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      <ChipBlock
        position={[-1.2, 0.4, 0]}
        size={[1.8, 0.5, 1.2]}
        color={CYAN}
        label="Blackwell GPU"
        sublabel="FP4 / FP8 / FP16"
      />

      <ChipBlock
        position={[1.2, 0.4, 0]}
        size={[1.4, 0.5, 1.2]}
        color={PURPLE}
        label="Grace CPU"
        sublabel="Arm Neoverse V2"
      />

      <ChipBlock
        position={[0, -0.6, 0]}
        size={[3.8, 0.35, 1.2]}
        color={BLUE}
        label="128 GB Unified LPDDR5X"
        sublabel="~273 GB/s"
      />

      <DataBus from={[-1.2, 0.1, 0]} to={[-0.5, -0.4, 0]} />
      <DataBus from={[1.2, 0.1, 0]} to={[0.5, -0.4, 0]} />
      <DataBus from={[-0.3, 0.4, 0]} to={[0.3, 0.4, 0]} />
    </group>
  );
}

export default function SparkArchitecture() {
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
        DGX Spark System Architecture
      </div>
      <div
        style={{
          width: "100%",
          height: 360,
          background: "#0f0f12",
          borderRadius: 8,
          border: `1px solid ${BORDER}`,
          overflow: "hidden",
        }}
      >
        <Canvas
          camera={{ position: [0, 1.5, 4], fov: 40 }}
          style={{ width: "100%", height: "100%" }}
        >
          <ambientLight intensity={0.4} />
          <directionalLight position={[3, 5, 2]} intensity={0.8} />
          <pointLight position={[-3, 2, 4]} intensity={0.3} color={CYAN} />
          <Float speed={0.5} floatIntensity={0.2}>
            <RotatingScene />
          </Float>
        </Canvas>
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: DIM,
          textAlign: "center",
          marginTop: "0.5rem",
        }}
      >
        NVIDIA DGX Spark &middot; GB10 Grace Blackwell &middot; Desktop AI
      </div>
    </div>
  );
}
