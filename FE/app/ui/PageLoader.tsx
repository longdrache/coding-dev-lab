"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, motion } from "framer-motion";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

// --- 3D centerpiece: khối wireframe + 2 vành quỹ đạo + vành hạt phát sáng ---
function Core() {
  const knot = useRef<THREE.Mesh>(null!);
  const ring = useRef<THREE.Points>(null!);
  const orbitA = useRef<THREE.Mesh>(null!);
  const orbitB = useRef<THREE.Mesh>(null!);
  const glow = useRef<THREE.Mesh>(null!);

  const particles = useMemo(() => {
    const pos = new Float32Array(350 * 3);
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }
    for (let i = 0; i < 350; i++) {
      const r = 1.7 + rand() * 1.3;
      const theta = rand() * Math.PI * 2;
      const y = (rand() - 0.5) * 2.4;
      pos[i * 3] = Math.cos(theta) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(theta) * r;
    }
    return pos;
  }, []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    knot.current.rotation.y += delta * 0.5;
    knot.current.rotation.x = Math.sin(t * 0.4) * 0.35;
    ring.current.rotation.y -= delta * 0.22;
    orbitA.current.rotation.z += delta * 0.6;
    orbitB.current.rotation.z -= delta * 0.4;
    // Nhịp thở cho lõi phát sáng
    const pulse = 1 + Math.sin(t * 2.4) * 0.08;
    glow.current.scale.setScalar(0.5 * pulse);
  });

  return (
    <>
      <mesh ref={knot} scale={1.15}>
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial color="#10b981" wireframe transparent opacity={0.85} />
      </mesh>
      {/* Lõi phát sáng nhịp thở */}
      <mesh ref={glow}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshBasicMaterial color="#064e3b" transparent opacity={0.85} />
      </mesh>
      {/* 2 vành quỹ đạo nghiêng */}
      <mesh ref={orbitA} rotation={[Math.PI / 2.4, 0, 0.4]}>
        <torusGeometry args={[1.9, 0.012, 8, 128]} />
        <meshBasicMaterial color="#34d399" transparent opacity={0.7} />
      </mesh>
      <mesh ref={orbitB} rotation={[Math.PI / 1.8, 0.3, -0.5]}>
        <torusGeometry args={[2.3, 0.01, 8, 128]} />
        <meshBasicMaterial color="#10b981" transparent opacity={0.4} />
      </mesh>
      <points ref={ring}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particles, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#6ee7b7"
          size={0.045}
          transparent
          opacity={0.9}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
      <ambientLight intensity={1} />
    </>
  );
}

// Vòng tiến độ 3D: arc torus mọc dần theo % quanh lõi + track mờ
function ProgressRing({ pct }: { pct: number }) {
  const arc = (Math.max(0, Math.min(100, pct)) / 100) * Math.PI * 2;
  const geo = useMemo(
    () => new THREE.TorusGeometry(1.9, 0.05, 14, 96, Math.max(arc, 0.001)),
    [arc],
  );
  useEffect(() => () => geo.dispose(), [geo]);

  return (
    // Nghiêng vừa (~65°) để đọc rõ hình vòng, không xoay để arc mọc dễ theo dõi
    <group rotation={[Math.PI / 2.8, 0, 0]}>
      {/* track nền */}
      <mesh>
        <torusGeometry args={[1.9, 0.02, 8, 96]} />
        <meshBasicMaterial color="#14532d" transparent opacity={0.9} />
      </mesh>
      {/* hào quang quanh arc (phóng to nhẹ để khỏi z-fight) */}
      <mesh scale={1.05}>
        <primitive object={geo} attach="geometry" />
        <meshBasicMaterial
          color="#10b981"
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* arc tiến độ chính */}
      <mesh>
        <primitive object={geo} attach="geometry" />
        <meshBasicMaterial color="#6ee7b7" transparent opacity={1} />
      </mesh>
      {/* chấm đầu arc */}
      <mesh position={[1.9 * Math.cos(arc), 1.9 * Math.sin(arc), 0]}>
        <sphereGeometry args={[0.075, 12, 12]} />
        <meshBasicMaterial color="#ecfdf5" />
      </mesh>
    </group>
  );
}

function LoaderScene({ pct }: { pct: number }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 5.2], fov: 45 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
    >
      <Core />
      <ProgressRing pct={pct} />
    </Canvas>
  );
}

// --- Phase text theo % ---
function phaseFor(pct: number): string {
  if (pct < 30) return "Khởi tạo engine chấm bài";
  if (pct < 62) return "Đang nạp thư viện bài tập";
  if (pct < 90) return "Đang đồng bộ tiến độ";
  return "Sẵn sàng";
}

const BRAND = "GOCODE";

// Màn hình chờ toàn trang: dark premium + 3D + % lớn + phase.
export default function PageLoader() {
  // % giả 0 → 100 trong 1.4s, khớp thời gian loader hiện tối thiểu
  const [pct, setPct] = useState(0);
  // Đồng hồ sống góc phải cho chất HUD
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const controls = animate(0, 100, {
      duration: 1.4,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setPct(Math.round(v)),
    });
    const timer = window.setInterval(() => setElapsed((v) => v + 0.1), 100);
    return () => {
      controls.stop();
      window.clearInterval(timer);
    };
  }, []);
  const phase = phaseFor(pct);

  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-950 text-white">
      {/* HUD frame: 4 góc + nhãn */}
      <div className="pointer-events-none absolute inset-4 z-20 sm:inset-6" aria-hidden>
        <span className="absolute left-0 top-0 h-6 w-6 border-l-2 border-t-2 border-emerald-500/60" />
        <span className="absolute right-0 top-0 h-6 w-6 border-r-2 border-t-2 border-emerald-500/60" />
        <span className="absolute bottom-0 left-0 h-6 w-6 border-b-2 border-l-2 border-emerald-500/60" />
        <span className="absolute bottom-0 right-0 h-6 w-6 border-b-2 border-r-2 border-emerald-500/60" />
        <span className="absolute left-10 top-0 font-mono text-[10px] tracking-[0.25em] text-zinc-500">
          GOCODE://BOOT_SEQUENCE
        </span>
        <span className="absolute right-10 top-0 font-mono text-[10px] tabular-nums tracking-[0.25em] text-emerald-400">
          T+{elapsed.toFixed(1)}s
        </span>
        <span className="absolute bottom-0 left-10 font-mono text-[10px] tracking-[0.25em] text-zinc-600">
          NODE VN-01 • SECURE
        </span>
        <span className="absolute bottom-0 right-10 font-mono text-[10px] tracking-[0.25em] text-zinc-600">
          v3.7
        </span>
      </div>
      {/* Glow nền + grain */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute left-1/2 top-[22%] h-[420px] w-[680px] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-[130px]" />
        <div className="absolute bottom-[-10%] left-[10%] h-[300px] w-[420px] rounded-full bg-teal-500/10 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgb(255 255 255 / 0.6) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.6) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse 65% 55% at 50% 42%, black, transparent)",
            WebkitMaskImage: "radial-gradient(ellipse 65% 55% at 50% 42%, black, transparent)",
          }}
        />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6">
        {/* 3D */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="h-60 w-60 sm:h-72 sm:w-72"
        >
          <LoaderScene pct={pct} />
        </motion.div>

        {/* Brand stagger */}
        <div className="mt-2 flex overflow-hidden" aria-label="GoCode">
          {BRAND.split("").map((ch, i) => (
            <motion.span
              key={i}
              initial={{ y: 28, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 + i * 0.06, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="text-2xl font-black tracking-[0.35em] text-white"
            >
              {ch}
            </motion.span>
          ))}
        </div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-2 font-mono text-[11px] tracking-widest text-zinc-500"
        >
          RÈN TƯ DUY GIẢI THUẬT
        </motion.p>

        {/* % lớn */}
        <div className="mt-8 flex items-baseline gap-1 font-mono tabular-nums">
          <motion.span
            key={pct}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            className="text-6xl font-black tracking-tight text-white"
          >
            {pct}
          </motion.span>
          <span className="text-xl font-bold text-emerald-400">%</span>
        </div>

        {/* Phase chuyển cảnh (vòng 3D quanh lõi đã thay thanh bar) */}
        <div className="mt-3 flex h-5 items-center justify-center font-mono text-xs text-zinc-400">
          <span className="mr-2 inline-block size-1.5 animate-pulse rounded-full bg-emerald-400" />
          <AnimatePresence mode="wait">
            <motion.span
              key={phase}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
            >
              {phase}…
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
