import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export function Particles({ count = 220 }: { count?: number }) {
  const ref = useRef<THREE.InstancedMesh | null>(null);
  const particlesRef = useRef<{
    positions: Float32Array;
    scales: Float32Array;
    colors: number[];
  } | null>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const palette = useMemo(
    () => ["#10b981", "#a1a1aa", "#d4d4d8", "#34d399"],
    [],
  );

  useEffect(() => {
    if (particlesRef.current) return;
    const count = 220;
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const colors = new Array(count);
    
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 18;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 2] = -2 - Math.random() * 6;
      scales[i] = 0.02 + Math.random() * 0.06;
      colors[i] = palette[i % palette.length];
    }
    particlesRef.current = { positions, scales, colors };
  }, [palette]);

  useEffect(() => {
    if (!ref.current || !particlesRef.current) return;
    const { positions, scales, colors } = particlesRef.current;
    const count = positions.length / 3;
    for (let i = 0; i < count; i++) {
      dummy.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      const s = scales[i];
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < count; i++) {
      ref.current.setColorAt(i, new THREE.Color(colors[i]));
    }
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [dummy]);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.02;
    }
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}