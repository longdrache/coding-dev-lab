"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

type FloatProps = {
  position: [number, number, number];
  speed?: number;
  floatAmp?: number;
  spin?: number;
  children: React.ReactNode;
};

// Khối trôi lơ lửng: xoay chậm + bob theo sin(time) — mutate ref trực
// tiếp trong useFrame, không setState (tránh re-render mỗi frame).
function Floater({
  position,
  speed = 1,
  floatAmp = 0.25,
  spin = 0.3,
  children,
}: FloatProps) {
  const ref = useRef<THREE.Group>(null!);
  const offsetRef = useRef<number>(0);
  if (offsetRef.current === 0) offsetRef.current = Math.random() * Math.PI * 2;
  const offset = offsetRef.current;

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime * speed + offset;
    ref.current.position.set(
      position[0],
      position[1] + Math.sin(t) * floatAmp,
      position[2],
    );
    ref.current.rotation.x += delta * spin * 0.6;
    ref.current.rotation.y += delta * spin;
  });

  return <group ref={ref} position={position}>{children}</group>;
}

const Particles = dynamic(() => import("./Particles").then((mod) => mod.Particles), {
  ssr: false,
});

// Parallax theo chuột toàn window (canvas nằm sau content nên không trông
// chờ pointer event của canvas): lerp góc nghiêng cả scene rất nhẹ.
function Rig({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null!);
  const target = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      target.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      target.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useFrame((_, delta) => {
    const k = 1 - Math.exp(-delta * 2.5);
    ref.current.rotation.y += (target.current.x * 0.18 - ref.current.rotation.y) * k;
    ref.current.rotation.x += (target.current.y * 0.12 - ref.current.rotation.x) * k;
  });

  return <group ref={ref}>{children}</group>;
}

function Scene() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  
  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[6, 8, 6]} intensity={1.4} />
      <directionalLight position={[-6, -2, 4]} intensity={0.35} color="#a7f3d0" />
      <Rig>
        {mounted && <Particles />}
      </Rig>
    </>
  );
}

export default function HeroScene({ className = "" }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // Canvas 60fps kể cả khi đã cuộn qua là nguyên nhân chính gây lag:
  // tắt render loop khi hero ra khỏi viewport.
  const [active, setActive] = useState(true);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className={className}>
      <Canvas
        camera={{ position: [0, 0, 9], fov: 45 }}
        dpr={[1, 1.75]}
        frameloop={active ? "always" : "never"}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}