import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Text, MeshDistortMaterial, OrbitControls } from '@react-three/drei';
import { motion } from 'framer-motion';
import * as THREE from 'three';

interface FloatingNodeProps {
  position: [number, number, number];
  color: string;
  size: number;
}

const FloatingNode: React.FC<FloatingNodeProps> = ({ position, color, size }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime) * 0.3;
      meshRef.current.rotation.y = Math.cos(state.clock.elapsedTime * 0.5) * 0.3;
    }
  });

  return (
    <Float speed={2} rotationIntensity={1} floatIntensity={2}>
      <mesh ref={meshRef} position={position}>
        <sphereGeometry args={[size, 32, 32]} />
        <MeshDistortMaterial
          color={color}
          attach="material"
          distort={0.3}
          speed={2}
          roughness={0.1}
          metalness={0.8}
        />
      </mesh>
    </Float>
  );
};

interface ConnectionLineProps {
  start: [number, number, number];
  end: [number, number, number];
}

const ConnectionLine: React.FC<ConnectionLineProps> = ({ start, end }) => {
  const ref = useRef<THREE.BufferGeometry>(null);
  
  const points = useMemo(() => [
    new THREE.Vector3(...start),
    new THREE.Vector3(...end)
  ], [start, end]);

  useFrame((state) => {
    if (ref.current) {
      const positions = ref.current.attributes.position.array as Float32Array;
      const time = state.clock.elapsedTime;
      
      for (let i = 0; i < positions.length; i += 3) {
        const wave = Math.sin(time + i * 0.1) * 0.1;
        positions[i + 1] += wave * 0.01;
      }
      
      ref.current.attributes.position.needsUpdate = true;
    }
  });

  return (
    <line>
      <bufferGeometry ref={ref}>
        <bufferAttribute
          attach="attributes-position"
          count={points.length}
          array={new Float32Array(points.flatMap(p => [p.x, p.y, p.z]))}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color="#8b5cf6" transparent opacity={0.4} />
    </line>
  );
};

const Scene: React.FC = () => {
  const nodes: Array<{ position: [number, number, number]; color: string; size: number }> = [
    { position: [-2, 1, 0], color: "#8b5cf6", size: 0.3 },
    { position: [2, -1, 1], color: "#a855f7", size: 0.25 },
    { position: [0, 2, -1], color: "#c084fc", size: 0.35 },
    { position: [-1.5, -1.5, 0.5], color: "#d8b4fe", size: 0.2 },
    { position: [1.5, 1.5, -0.5], color: "#e879f9", size: 0.28 },
  ];

  const connections: Array<{ start: [number, number, number]; end: [number, number, number] }> = [
    { start: nodes[0].position, end: nodes[1].position },
    { start: nodes[1].position, end: nodes[2].position },
    { start: nodes[2].position, end: nodes[3].position },
    { start: nodes[3].position, end: nodes[4].position },
    { start: nodes[4].position, end: nodes[0].position },
  ];

  return (
    <>
      <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.5} />
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#8b5cf6" />
      
      {connections.map((connection, index) => (
        <ConnectionLine key={index} {...connection} />
      ))}
      
      {nodes.map((node, index) => (
        <FloatingNode key={index} {...node} />
      ))}
      
      <Text
        position={[0, 0, 0]}
        fontSize={0.5}
        color="#8b5cf6"
        anchorX="center"
        anchorY="middle"
        font="/fonts/inter-bold.woff"
      >
        JobFlow
      </Text>
    </>
  );
};

export const InteractiveScene: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1, ease: "easeOut" }}
      className="h-96 w-full"
    >
      <Canvas
        camera={{ position: [0, 0, 5], fov: 50 }}
        style={{ background: 'transparent' }}
      >
        <Scene />
      </Canvas>
    </motion.div>
  );
};