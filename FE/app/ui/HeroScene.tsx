"use client";

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
  const offset = useMemo(() => Math.random() * Math.PI * 2, []);

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

// Mây hạt: 1 draw call duy nhất qua instancedMesh, cả cụm xoay rất chậm.
function Particles({ count = 220 }: { count?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const palette = useMemo(
    () => ["#10b981", "#a1a1aa", "#d4d4d8", "#34d399"],
    [],
  );

  useEffect(() => {
    for (let i = 0; i < count; i++) {
      dummy.position.set(
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 10,
        -2 - Math.random() * 6,
      );
      const s = 0.02 + Math.random() * 0.06;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    // Màu rải rác theo palette (instanceColor)
    for (let i = 0; i < count; i++) {
      ref.current.setColorAt(i, new THREE.Color(palette[i % palette.length]));
    }
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [count, dummy, palette]);

  useFrame((_, delta) => {
    ref.current.rotation.y += delta * 0.02;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

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
  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[6, 8, 6]} intensity={1.4} />
      <directionalLight position={[-6, -2, 4]} intensity={0.35} color="#a7f3d0" />
      <Rig>
        <Particles />
        {/* Vòng torus lớn phía phải — sau terminal */}
        <Floater position={[4.6, 1.2, -2.5]} speed={0.7} spin={0.25} floatAmp={0.3}>
          <mesh>
            <torusGeometry args={[1.5, 0.42, 24, 64]} />
            <meshStandardMaterial color="#e4e4e7" roughness={0.35} metalness={0.15} />
          </mesh>
        </Floater>
        {/* Icosahedron emerald — điểm nhấn brand */}
        <Floater position={[3.4, -1.4, -1]} speed={1.1} spin={0.5} floatAmp={0.28}>
          <mesh>
            <icosahedronGeometry args={[0.85, 0]} />
            <meshStandardMaterial color="#10b981" roughness={0.3} metalness={0.2} flatShading />
          </mesh>
        </Floater>
        {/* Torus knot nhỏ góc trên phải */}
        <Floater position={[6.4, 2.8, -3.5]} speed={0.9} spin={0.4} floatAmp={0.35}>
          <mesh scale={0.55}>
            <torusKnotGeometry args={[1, 0.32, 100, 16]} />
            <meshStandardMaterial color="#d4d4d8" roughness={0.4} metalness={0.1} />
          </mesh>
        </Floater>
        {/* Hộp nghiêng trái xa — cân bố cục với cột chữ */}
        <Floater position={[-5.2, -1.8, -3]} speed={0.8} spin={0.35} floatAmp={0.3}>
          <mesh rotation={[0.4, 0.6, 0.2]}>
            <boxGeometry args={[1.3, 1.3, 1.3]} />
            <meshStandardMaterial color="#f4f4f5" roughness={0.5} metalness={0.05} />
          </mesh>
        </Floater>
        {/* Viên emerald nhỏ bay giữa */}
        <Floater position={[-2.2, 2.2, -2]} speed={1.3} spin={0.7} floatAmp={0.4}>
          <mesh>
            <octahedronGeometry args={[0.42, 0]} />
            <meshStandardMaterial color="#34d399" roughness={0.25} metalness={0.3} flatShading />
          </mesh>
        </Floater>
        {/* Vòng mảnh trang trí dưới trái */}
        <Floater position={[-3.6, 0.2, -4]} speed={0.6} spin={0.2} floatAmp={0.25}>
          <mesh rotation={[1.1, 0.2, 0]}>
            <torusGeometry args={[1.1, 0.06, 16, 80]} />
            <meshStandardMaterial color="#a1a1aa" roughness={0.4} metalness={0.3} />
          </mesh>
        </Floater>
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
