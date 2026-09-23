import { useRef, useMemo, useState, useEffect } from 'react';
import { useTexture, Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import { useAudio } from '../../../context/AudioManager';
import Repairman from './Repairman';
import { playThunder, playHammer } from './thunderSfx';

// Sign plane in pivot space: x -1..1, y -1..0 (top edge = chains = pivot).
// The board fills y -0.33..-1 of the texture (chains above). Jagged crack splits it into two halves.
const BOARD_TOP = -0.33;
const CRACK = [[0.1, 0], [0.12, BOARD_TOP], [0.26, -0.48], [0.04, -0.64], [0.22, -0.8], [0.08, -0.92], [0.18, -1]];
const SIGN_TOP = new THREE.Vector3(0, 1.9, 0.6); // sway group position (local to SignSystem)
const FLOOR_Y = -1.75;
const noRaycast = () => null;

function halfGeometry(points) {
    const geo = new THREE.ShapeGeometry(new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y))));
    const pos = geo.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
        uv[i * 2] = (pos.getX(i) + 1) / 2;
        uv[i * 2 + 1] = pos.getY(i) + 1;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
}

// Midpoint displacement: a jagged path from a to b
function jag(a, b, spread, depth = 5) {
    if (depth === 0) return [a, b];
    const mid = [
        (a[0] + b[0]) / 2 + (Math.random() - 0.5) * spread,
        (a[1] + b[1]) / 2 + (Math.random() - 0.5) * spread * 0.3,
        (a[2] + b[2]) / 2,
    ];
    return [...jag(a, mid, spread / 2, depth - 1), ...jag(mid, b, spread / 2, depth - 1).slice(1)];
}

function makeBolt() {
    const hit = [SIGN_TOP.x + CRACK[1][0], SIGN_TOP.y + BOARD_TOP, SIGN_TOP.z + 0.02];
    const main = jag([hit[0] + (Math.random() - 0.5) * 3, 8, hit[2]], hit, 2.2);
    const branches = [0.35, 0.6].map((f) => {
        const from = main[Math.floor(main.length * f)];
        const dir = Math.random() < 0.5 ? -1 : 1;
        return jag(from, [from[0] + dir * (0.6 + Math.random() * 0.8), from[1] - 0.8 - Math.random() * 0.8, from[2]], 0.6, 3);
    });
    return { main, branches };
}

const SignSystem = ({ active = false, ...props }) => {
    const groupRef = useRef();
    const leftRef = useRef();
    const rightRef = useRef();
    const crackRef = useRef();
    const boltRef = useRef();
    const rig = useRef({ walking: false, armsBusy: false, phase: 0 });
    const [bolt, setBolt] = useState(makeBolt);

    const canvas = useThree((s) => s.gl.domElement);
    const { globalVolume, isMuted } = useAudio();
    const volume = useRef(0);
    volume.current = isMuted ? 0 : globalVolume;

    const signTexture = useTexture('/textures/entrance/sign.webp');
    const mountTexture = useTexture('/textures/entrance/belka.webp');

    const signMaterial = useMemo(() => new THREE.MeshBasicMaterial({
        color: '#e0e0e0',
        map: signTexture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false, // Fix for seeing objects behind transparent parts
    }), [signTexture]);
    const leftGeo = useMemo(() => halfGeometry([[-1, 0], ...CRACK, [-1, -1]]), []);
    const rightGeo = useMemo(() => halfGeometry([...CRACK, [1, -1], [1, 0]]), []);
    const crackLine = useMemo(() => CRACK.slice(1).map(([x, y]) => [x, y, 0.01]), []);

    // Physics parameters
    const timeOffset = useMemo(() => Math.random() * 100, []);

    // Wind sway only while the sign is whole; a broken sign hangs still
    const broken = useRef(false);
    useFrame((state) => {
        if (groupRef.current) {
            const time = state.clock.elapsedTime + timeOffset;
            const target = broken.current ? 0 : Math.sin(time * 2) * 0.05;
            groupRef.current.rotation.x += (target - groupRef.current.rotation.x) * 0.15;
        }
    });

    // Strike -> break -> repairman fixes it -> repeat
    useEffect(() => {
        if (!active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const L = leftRef.current;
        const R = rightRef.current;
        const man = rig.current;
        const flash = (on) => () => { canvas.style.filter = on ? 'invert(1) contrast(1.4)' : ''; };
        const shake = () => canvas.animate([
            { transform: 'translate(0, 0)' },
            { transform: 'translate(-16px, 10px)' },
            { transform: 'translate(14px, -12px)' },
            { transform: 'translate(-9px, 7px)' },
            { transform: 'translate(5px, -3px)' },
            { transform: 'translate(0, 0)' },
        ], { duration: 500, easing: 'ease-out' });
        const hit = () => {
            playHammer(volume.current);
            gsap.fromTo(groupRef.current.position, { y: SIGN_TOP.y - 0.04 }, { y: SIGN_TOP.y, duration: 0.15 });
        };

        const tl = gsap.timeline({ repeat: -1, repeatDelay: 3, delay: 2.5 });

        // Repairman helpers. Pose resets after walking are instant (not tweens): a tween would
        // replay its loop-1 start value (a random mid-stride angle) on every repeat.
        const standStill = (arms) => {
            man.walking = false;
            man.legL.rotation.z = man.legR.rotation.z = man.body.position.y = 0;
            if (arms) man.armL.rotation.z = man.armR.rotation.z = 0;
        };
        const walk = (x, at, duration) => tl
            .call(() => { man.walking = true; }, null, at)
            .to(man.root.position, { x, duration, ease: 'none' }, at)
            .call(() => standStill(false), null, at + duration);
        const hop = (at) => tl
            .to(man.root.position, { y: FLOOR_Y + 0.45, duration: 0.22, ease: 'power2.out' }, at)
            .to(man.root.position, { y: FLOOR_Y, duration: 0.22, ease: 'power2.in' }, at + 0.22);

        // Fallen right half: pivot sits so the board lies on the path
        const FALLEN_Y = FLOOR_Y - SIGN_TOP.y + 0.98;
        // Held overhead: hands ~2.2 above his feet, board bottom (pivot -1) rests on them
        const HELD_Y = FLOOR_Y + 2.2 - SIGN_TOP.y + 1;

        // --- STRIKE ---
        tl.call(() => setBolt(makeBolt()), null, 0)
            .call(() => {
                broken.current = true;
                boltRef.current.visible = true;
                crackRef.current.visible = true;
                flash(true)();
                shake();
                playThunder(volume.current);
            }, null, 0.05)
            .call(flash(false), null, 0.13)
            .call(flash(true), null, 0.2)
            .call(() => { flash(false)(); boltRef.current.visible = false; }, null, 0.36)
            .call(() => { crackRef.current.visible = false; }, null, 0.42)

            // --- BREAK: left half drops onto its chain and settles, right half falls ---
            .to(L.rotation, { z: -0.84, duration: 1, ease: 'elastic.out(1, 0.6)' }, 0.42)
            .to(R.position, { x: 1.55, y: FALLEN_Y, z: 0.7, duration: 0.9, ease: 'bounce.out' }, 0.42)
            .to(R.rotation, { z: -0.3, duration: 0.9, ease: 'power2.in' }, 0.42)

            // --- REPAIRMAN walks in to the fallen half ---
            .call(() => {
                man.root.visible = true;
                man.root.position.set(7, FLOOR_Y, 1.4);
            }, null, 2.4);
        walk(1.1, 2.4, 2.4);

        tl.call(() => { standStill(true); man.armsBusy = true; }, null, 4.8);

        // Squat (wide stance) until his hands reach the board, then grab it
        tl.to(man.body.position, { y: -0.3, duration: 0.35 }, 4.95)
            .to(man.legL.rotation, { z: -0.8, duration: 0.35 }, 4.95)
            .to(man.legR.rotation, { z: 0.8, duration: 0.35 }, 4.95)
            .to(R.rotation, { z: 0, duration: 0.2 }, 5.3)
            .to(R.position, { z: 0.85, duration: 0.2 }, 5.3)

            // Stand up and lift it overhead: the board rides on his hands
            .to(man.body.position, { y: 0, duration: 0.6, ease: 'power2.inOut' }, 5.5)
            .to([man.legL.rotation, man.legR.rotation], { z: 0, duration: 0.6, ease: 'power2.inOut' }, 5.5)
            .to(man.armL.rotation, { z: -2.36, duration: 0.6, ease: 'power2.inOut' }, 5.5)
            .to(man.armR.rotation, { z: 2.36, duration: 0.6, ease: 'power2.inOut' }, 5.5)
            .to(R.position, { y: HELD_Y, duration: 0.6, ease: 'power2.inOut' }, 5.5)

            // Carry it under its slot
            .to(R.position, { x: 1, duration: 0.5, ease: 'none' }, 6.2);
        walk(0.55, 6.2, 0.5);

        // Hop and slot it back in
        hop(6.85);
        tl.to(R.position, { y: 0, z: 0, duration: 0.22, ease: 'power2.out' }, 6.85)
            .call(() => playHammer(volume.current), null, 7.07)
            .to([man.armL.rotation, man.armR.rotation], { z: 0, duration: 0.3 }, 7.4);

        // Walk to the hanging left half, hop and push it back up
        walk(-0.55, 7.7, 0.5);
        tl.to(man.armL.rotation, { z: -2.36, duration: 0.25 }, 8.25);
        hop(8.5);
        tl.to(L.rotation, { z: 0, duration: 0.35, ease: 'back.out(2)' }, 8.6)
            .call(() => { crackRef.current.visible = true; }, null, 8.95)
            .to(man.armL.rotation, { z: 0, duration: 0.3 }, 9);
        walk(-0.2, 9.1, 0.3);

        // Three hammer hits on the crack
        [9.6, 10.1, 10.6].forEach((t) => {
            tl.to(man.armR.rotation, { z: 1.84, duration: 0.2, ease: 'power1.out' }, t)
                .to(man.armR.rotation, { z: 2.63, duration: 0.12, ease: 'power3.in' }, t + 0.2)
                .call(hit, null, t + 0.32);
        });

        // Good as new (sway resumes), walk off
        tl.call(() => { crackRef.current.visible = false; broken.current = false; }, null, 11.1)
            .to(man.armR.rotation, { z: 0, duration: 0.4 }, 11.2)
            .call(() => { man.armsBusy = false; }, null, 11.6);
        walk(-7.5, 11.6, 3.6);
        tl.call(() => { man.root.visible = false; }, null, 15.3);

        return () => {
            tl.kill();
            canvas.style.filter = '';
        };
    }, [active, canvas]);

    return (
        <group {...props}>
            {/* 1. THE MOUNT (Visual Anchor) */}
            <mesh position={[-0.05, 2.05, 0.65]}>
                <planeGeometry args={[2.7, 0.4]} />
                <meshBasicMaterial color="#e0e0e0" map={mountTexture} transparent={true} side={THREE.DoubleSide} />
            </mesh>

            {/* 2. THE SIGN: two halves hinged at their top outer corners (chains) */}
            <group ref={groupRef} position={SIGN_TOP.toArray()}>
                <group ref={leftRef} position={[-1, 0, 0]}>
                    <mesh position={[1, 0, 0]} geometry={leftGeo} material={signMaterial} />
                </group>
                <group ref={rightRef} position={[1, 0, 0]}>
                    <mesh position={[-1, 0, 0]} geometry={rightGeo} material={signMaterial} />
                </group>
                <group ref={crackRef} visible={false}>
                    <Line points={crackLine} color="#111" lineWidth={3} raycast={noRaycast} />
                </group>
            </group>

            {/* 3. LIGHTNING BOLT (ink black; the inverted flash turns it white) */}
            <group ref={boltRef} visible={false}>
                <Line points={bolt.main} color="#111" lineWidth={10} raycast={noRaycast} />
                {bolt.branches.map((b, i) => (
                    <Line key={i} points={b} color="#111" lineWidth={3} raycast={noRaycast} />
                ))}
            </group>

            {/* 4. THE REPAIRMAN */}
            <Repairman rig={rig} />
        </group>
    );
};

export default SignSystem;
