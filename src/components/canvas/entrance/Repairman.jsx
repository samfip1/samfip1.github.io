import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';

const INK = '#111';
const STROKE = 3.5;
const noRaycast = () => null; // never steal clicks from the entrance doors

const arc = (cx, cy, r, from, to, steps = 16) =>
    Array.from({ length: steps + 1 }, (_, i) => {
        const a = from + ((to - from) * i) / steps;
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0];
    });

const Ink = ({ points, width = STROKE }) => (
    <Line points={points} color={INK} lineWidth={width} raycast={noRaycast} />
);

/**
 * Doodle stick-figure repairman (hard hat + hammer), feet at the group origin.
 * SignSystem drives him through `rig`: root/arm/leg groups plus a `walking` flag.
 */
const Repairman = ({ rig }) => {
    const head = useMemo(() => arc(0, 1.95, 0.2, 0, Math.PI * 2, 24), []);
    const hat = useMemo(() => arc(0, 2.02, 0.22, 0, Math.PI, 12), []);
    const smile = useMemo(() => arc(0, 1.93, 0.09, Math.PI * 1.15, Math.PI * 1.85, 8), []);

    useFrame((_, delta) => {
        const r = rig.current;
        if (!r.root) return;
        if (r.walking) {
            r.phase += delta * 9;
            const s = Math.sin(r.phase);
            r.legL.rotation.z = s * 0.45;
            r.legR.rotation.z = -s * 0.45;
            if (!r.armsBusy) {
                r.armL.rotation.z = -s * 0.35;
                r.armR.rotation.z = s * 0.35;
            }
            r.body.position.y = Math.abs(Math.cos(r.phase)) * 0.05;
        }
    });

    const set = (key) => (el) => { rig.current[key] = el; };

    return (
        <group ref={set('root')} visible={false}>
            <group ref={set('body')}>
                {/* Legs pivot at the hip */}
                <group ref={set('legL')} position={[-0.05, 1.0, 0]}>
                    <Ink points={[[0, 0, 0], [-0.08, -1.0, 0], [-0.22, -1.0, 0]]} />
                </group>
                <group ref={set('legR')} position={[0.05, 1.0, 0]}>
                    <Ink points={[[0, 0, 0], [0.08, -1.0, 0], [0.22, -1.0, 0]]} />
                </group>

                {/* Torso + head */}
                <Ink points={[[0, 1.0, 0], [0, 1.75, 0]]} />
                <Ink points={head} />
                <Ink points={smile} width={2.5} />
                <Line points={[[-0.07, 2.0, 0], [-0.07, 1.99, 0]]} color={INK} lineWidth={6} raycast={noRaycast} />
                <Line points={[[0.07, 2.0, 0], [0.07, 1.99, 0]]} color={INK} lineWidth={6} raycast={noRaycast} />

                {/* Hard hat: dome + brim */}
                <Ink points={hat} width={4} />
                <Ink points={[[-0.32, 2.02, 0], [0.32, 2.02, 0]]} width={5} />

                {/* Arms pivot at the shoulder; the right one holds the hammer */}
                <group ref={set('armL')} position={[0, 1.62, 0]}>
                    <Ink points={[[0, 0, 0], [-0.12, -0.72, 0]]} />
                </group>
                <group ref={set('armR')} position={[0, 1.62, 0]}>
                    <Ink points={[[0, 0, 0], [0.12, -0.72, 0]]} />
                    <Ink points={[[0.12, -0.72, 0], [0.16, -1.05, 0]]} width={4} />
                    <mesh position={[0.16, -1.08, 0]} rotation={[0, 0, 0.12]} raycast={noRaycast}>
                        <boxGeometry args={[0.3, 0.12, 0.05]} />
                        <meshBasicMaterial color={INK} />
                    </mesh>
                </group>
            </group>
        </group>
    );
};

export default Repairman;
