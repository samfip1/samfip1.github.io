import { useState, useRef, useMemo, useEffect } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { Text, PositionalAudio } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import SkyChunk, { CHUNK_LENGTH, ROOM_Z } from './SkyChunk';
import { useScene } from '../../../../context/SceneContext';
import '../../shaders/RevealBasicMaterial'; // Registers brush-stroke reveal for BasicMaterial
import { isTouchDevice } from '../../../../utils/deviceDetect';
import { useAwards } from '../../../../hooks/useSanityData';

// Reusable Vector3 to avoid allocations in event handlers
const _tempVec3 = new THREE.Vector3();

/**
 * InfiniteSkyManager Component
 * 
 * Manages dynamic generation/removal of sky chunks for infinite scroll.
 * World group moves with scroll, chunks stay at fixed positions relative to group.
 * Includes Story Milestones that loop with the content!
 */

import { useAudio } from '../../../../context/AudioManager';

export const BALLOON_AUDIO_SETTINGS = {
    volume: 1.0,
    distance: 2,
    rolloff: 2
};

/**
 * Reusable Button Component with Hover Effect + Brush-Stroke Reveal
 */
const AwardButton = ({ onClick, texture, paintedTexture, width, height, position, onHoverChange }) => {
    const isTouch = isTouchDevice();
    const meshRef = useRef();
    const buttonRevealRef = useRef(); // RevealBasicMaterial ref for button sketch
    const paintedRef = useRef(); // Painted button mesh visibility
    const hideDelayRef = useRef(); // Track pending gsap.delayedCall
    const [hovered, setHovered] = useState(false);

    useFrame((state, delta) => {
        if (meshRef.current) {
            // Smoothly lerp scale based on hover state
            const targetScale = hovered ? 1.05 : 1.0;
            const lerpFactor = 10 * delta;

            meshRef.current.scale.x = THREE.MathUtils.lerp(meshRef.current.scale.x, targetScale, lerpFactor);
            meshRef.current.scale.y = THREE.MathUtils.lerp(meshRef.current.scale.y, targetScale, lerpFactor);
            meshRef.current.scale.z = THREE.MathUtils.lerp(meshRef.current.scale.z, targetScale, lerpFactor);
        }
    });

    const handlePointerOver = () => {
        if (isTouch) return;
        setHovered(true);
        document.body.style.cursor = 'pointer';
        onHoverChange?.(true);

        // Brush-stroke reveal button
        if (buttonRevealRef.current) {
            gsap.to(buttonRevealRef.current, {
                uProgress: 1.0,
                duration: 0.8,
                ease: 'power2.out',
                overwrite: true
            });
        }
        if (hideDelayRef.current) hideDelayRef.current.kill();
        if (paintedRef.current) {
            paintedRef.current.visible = true;
            if (paintedRef.current.material) paintedRef.current.material.opacity = 1;
        }
    };

    const handlePointerOut = () => {
        if (isTouch) return;
        setHovered(false);
        document.body.style.cursor = 'auto';
        onHoverChange?.(false);

        // Reverse reveal
        if (buttonRevealRef.current) {
            gsap.to(buttonRevealRef.current, {
                uProgress: 0.0,
                duration: 0.5,
                ease: 'power2.out',
                overwrite: true
            });
        }
        hideDelayRef.current = gsap.delayedCall(0.55, () => {
            if (paintedRef.current && paintedRef.current.material) {
                paintedRef.current.material.opacity = 0;
            }
        });
    };

    return (
        <group ref={meshRef} position={position}>
            {/* Painted button (behind) - hidden until hover */}
            <mesh ref={paintedRef} position={[0, 0, -0.001]} visible={true}>
                <planeGeometry args={[width, height]} />
                <meshBasicMaterial color="#e0e0e0"
                    map={paintedTexture}
                    transparent
                    opacity={0}
                    side={THREE.DoubleSide}
                    alphaTest={0.5}
                    depthWrite={false}
                />
            </mesh>
            {/* Sketch button (front) with reveal */}
            <mesh
                onClick={onClick}
                onPointerOver={handlePointerOver}
                onPointerOut={handlePointerOut}
            >
                <planeGeometry args={[width, height]} />
                <revealBasicMaterial
                    ref={buttonRevealRef}
                    map={texture}
                    transparent
                    side={THREE.DoubleSide}
                    alphaTest={0.1}
                    depthWrite={false}
                    uProgress={0.0}
                />
            </mesh>
            <Text
                position={[0, 0, 0.05]}
                fontSize={0.25}
                color="#1a1a1a"
                anchorX="center"
                anchorY="middle"
                font="/fonts/CabinSketch-Bold.ttf"
            >
                VIEW
            </Text>
        </group>
    );
};

// Story milestones configuration
// Each milestone appears once per "story cycle" (7 chunks = 280 units)
const STORY_CYCLE_LENGTH = 280; // intro, awards, journey, 3 internships, skills - 40 units apart

// === TWARDA LINIA ZANIKANIA DLA MILESTONES (WORLD SPACE) ===
// Pokój About jest na Z = -25, więc -25 to drzwi pokoju
// -27 = 2 metry za drzwiami (w głąb pokoju) - musi matchować CORRIDOR_CLIP_Z w SkyChunk
const MILESTONE_CORRIDOR_CLIP_Z = -8.0;

const InfiniteSkyManager = ({ scrollProgressRef }) => {
    // PRE-CALCULATED FOR scrolProgress = 0
    // currentChunk = floor(0/40) = 0 -> [-1, 0, 1, 2]
    const [activeChunks, setActiveChunks] = useState([-1, 0, 1, 2]);
    // currentStoryCycle = floor(0/160) = 0 -> [-1, 0, 1]
    const [activeStoryCycles, setActiveStoryCycles] = useState([-1, 0, 1]);
    const worldRef = useRef();

    // Track current chunk for recycling
    const getCurrentChunk = (worldZ) => {
        return Math.floor(worldZ / CHUNK_LENGTH);
    };

    // Track current story cycle
    const getCurrentStoryCycle = (worldZ) => {
        return Math.floor(worldZ / STORY_CYCLE_LENGTH);
    };

    // Update chunks based on world position
    useFrame(() => {
        if (!worldRef.current) return;

        const scrollProgress = scrollProgressRef?.current || 0;

        // Move world directly
        worldRef.current.position.z = scrollProgress;

        // Figure out which chunk we're in
        const currentChunk = getCurrentChunk(scrollProgress);
        const shouldBeActiveChunks = [
            currentChunk - 1,
            currentChunk,
            currentChunk + 1,
            currentChunk + 2,
        ];

        const chunksNeedUpdate = shouldBeActiveChunks.some(c => !activeChunks.includes(c)) ||
            activeChunks.some(c => !shouldBeActiveChunks.includes(c));

        if (chunksNeedUpdate) {
            setActiveChunks(shouldBeActiveChunks);
        }

        // Update story cycles
        const currentStoryCycle = getCurrentStoryCycle(scrollProgress);
        const shouldBeActiveCycles = [
            currentStoryCycle - 1,
            currentStoryCycle,
            currentStoryCycle + 1,
        ];

        const cyclesNeedUpdate = shouldBeActiveCycles.some(c => !activeStoryCycles.includes(c)) ||
            activeStoryCycles.some(c => !shouldBeActiveCycles.includes(c));

        if (cyclesNeedUpdate) {
            setActiveStoryCycles(shouldBeActiveCycles);
        }
    });

    return (
        <group ref={worldRef}>
            {/* === SKY CHUNKS WITH CLOUDS === */}
            {activeChunks.map((chunkIndex) => (
                <SkyChunk
                    key={`sky-chunk-${chunkIndex}`}
                    chunkIndex={chunkIndex}
                    seed={42}
                    scrollProgressRef={scrollProgressRef}
                />
            ))}

            {/* === STORY MILESTONES (loop every STORY_CYCLE_LENGTH units) === */}
            {activeStoryCycles.map((cycleIndex) => (
                <group key={`story-cycle-${cycleIndex}`}>
                    {/* === INTRO MILESTONE === */}
                    <IntroMilestone
                        z={-(cycleIndex * STORY_CYCLE_LENGTH + 15)}
                        scrollProgressRef={scrollProgressRef}
                    />

                    {/* === AWARDS MILESTONE === */}
                    <AwardsMilestone
                        z={-(cycleIndex * STORY_CYCLE_LENGTH + 55)}
                        scrollProgressRef={scrollProgressRef}
                    />

                    {/* === JOURNEY MILESTONE === */}
                    <JourneyMilestone
                        z={-(cycleIndex * STORY_CYCLE_LENGTH + 95)}
                        scrollProgressRef={scrollProgressRef}
                    />

                    {/* === INTERNSHIP MILESTONES (one island each) === */}
                    {INTERNSHIPS.map((job, i) => (
                        <InternshipMilestone
                            key={job.company}
                            job={job}
                            side={i % 2 === 0 ? -1 : 1}
                            z={-(cycleIndex * STORY_CYCLE_LENGTH + 135 + i * 40)}
                            scrollProgressRef={scrollProgressRef}
                        />
                    ))}

                    {/* === SKILLS MILESTONE === */}
                    <SkillsMilestone
                        z={-(cycleIndex * STORY_CYCLE_LENGTH + 255)}
                        scrollProgressRef={scrollProgressRef}
                    />
                </group>
            ))}
        </group>
    );
};

/**
 * INTRO Milestone - Special detailed layout
 * Elements spread apart as they approach camera
 */
const IntroMilestone = ({ z, scrollProgressRef }) => {
    // Load avatar texture
    const avatarTexture = useLoader(THREE.TextureLoader, '/textures/about/awatarnachmurce.webp');
    const { camera, viewport } = useThree();
    const isTouch = isTouchDevice();

    // Refs for all animated elements
    const groupRef = useRef();
    const titleRef = useRef();
    const brandRef = useRef();
    const avatarRef = useRef();
    const motto1Ref = useRef();
    const motto2Ref = useRef();

    // Base positions
    const baseY = 2;

    // Calculate aspect ratio
    // LEGACY FIX: Use original dimensions (2816x1536) to prevent stretching
    const legacyAspectRatio = 2816 / 1536; 
    const avatarWidth = 6; // Zwiększony rozmiar awatara na chmurce
    const avatarHeight = avatarWidth / legacyAspectRatio;

    // Animation: floating + spread apart when close
    useFrame((state) => {
        if (!groupRef.current) return;

        const time = state.clock.elapsedTime;

        // === TWARDA LINIA CLIP (RĘCZNE OBLICZENIE WORLD Z) ===
        // worldZ = pokój(-25) + scrollProgress + lokalna pozycja milestone
        const scrollProgress = scrollProgressRef?.current || 0;
        const worldZ = ROOM_Z + scrollProgress + z;
        groupRef.current.visible = worldZ < MILESTONE_CORRIDOR_CLIP_Z;

        // Skip rest if not visible
        if (!groupRef.current.visible) return;

        // FIX: Use consistent distance based on scrollProgress + offset
        // This ensures animations work IDENTICALLY regardless of chunk/camera position
        // Base Start Z (-15) + Scroll (0) - Offset (55) = -70 (Matches "Working" Chunk 0 feel)
        const distanceZ = z + scrollProgress - 55;

        // Spread effect: starts at z = -25, full spread at z = -5
        // This makes elements spread BEFORE they reach the camera
        // === EDYTUJ TUTAJ (INTRO) ===
        // Zwiększ różnicę między Start a End, żeby animacja była wolniejsza
        const spreadStart = -70; // Startuje wcześniej
        const spreadEnd = -50;   // Kończy później
        let spreadFactor = 0;

        if (distanceZ > spreadStart && distanceZ < spreadEnd) {
            // Calculate spread: 0 at spreadStart, 1 at spreadEnd
            spreadFactor = (distanceZ - spreadStart) / (spreadEnd - spreadStart);
            spreadFactor = Math.min(1, Math.max(0, spreadFactor));
            // Ease out for smoother animation
            spreadFactor = spreadFactor * spreadFactor;
        } else if (distanceZ >= spreadEnd) {
            spreadFactor = 1;
        }

        // Apply spread to elements (move left/right) - MORE AGGRESSIVE
        const maxSpread = 15; // How far elements spread (increased!)

        if (titleRef.current) {
            titleRef.current.position.x = -spreadFactor * maxSpread * 0.8;
        }
        if (brandRef.current) {
            brandRef.current.position.x = spreadFactor * maxSpread * 0.6;
        }
        if (avatarRef.current) {
            // Avatar: floating + spread upward
            avatarRef.current.position.y = baseY + Math.sin(time * 0.8) * 0.15 + spreadFactor * 3;
            avatarRef.current.position.x = -spreadFactor * maxSpread * 0.3;
        }
        if (motto1Ref.current) {
            motto1Ref.current.position.x = spreadFactor * maxSpread * 0.7;
        }
        if (motto2Ref.current) {
            motto2Ref.current.position.x = -spreadFactor * maxSpread * 0.5;
        }
    });

    return (
        <group ref={groupRef} position={[0, 0, z]}>
            {/* Main title - Name (spreads left) */}
            <Text
                ref={titleRef}
                position={[0, 5, 0.1]}
                fontSize={0.8}
                color="#1a1a1a"
                anchorX="center"
                anchorY="middle"
                font="/fonts/RubikScribble-Regular.ttf"
            >
                SAMANT RATHOD
            </Text>

            {/* Subtitle - Brand (spreads right) */}
            <Text
                ref={brandRef}
                position={[0, 4.3, 0.1]}
                fontSize={0.45}
                color="#4a4a4a"
                anchorX="center"
                anchorY="middle"
                font="/fonts/CabinSketch-Regular.ttf"
            >
                (SAMFIP)
            </Text>

            {/* Avatar on cloud - floating + spreads up-left */}
            <mesh ref={avatarRef} position={[0, baseY, 0]}>
                <planeGeometry args={[avatarWidth, avatarHeight]} />
                <meshBasicMaterial color="#e0e0e0"
                    map={avatarTexture}
                    transparent
                    side={THREE.DoubleSide}
                    depthWrite={false}
                />
            </mesh>

            {/* Motto - Line 1 (spreads right) */}
            <Text
                ref={motto1Ref}
                position={[0, 0, 0.1]}
                fontSize={0.32}
                color="#555555"
                anchorX="center"
                anchorY="middle"
                font="/fonts/CabinSketch-Regular.ttf"
                fontStyle="italic"
            >
                "Building systems that scale
            </Text>

            {/* Motto - Line 2 (spreads left) */}
            <Text
                ref={motto2Ref}
                position={[0, -0.5, 0]}
                fontSize={0.32}
                color="#555555"
                anchorX="center"
                anchorY="middle"
                font="/fonts/CabinSketch-Regular.ttf"
                fontStyle="italic"
            >
                and ship on time"
            </Text>
        </group>
    );
};

/**
 * MOCK DATA FOR AWARDS
 */
const LEETCODE_URL = 'https://leetcode.com/u/Cheeku20';
const CODECHEF_URL = 'https://www.codechef.com/users/samfip1';
const CODEFORCES_URL = 'https://codeforces.com/profile/samfip.work';

const AWARDS_DATA = {
    sotd: {
        id: 'award-cp',
        layout: 'certificate_grid',
        title: 'Competitive Programming Ratings',
        items: [
            { label: 'LeetCode - 1883', date: 'Knight', url: LEETCODE_URL },
            { label: 'CodeChef - 1607', date: '3-Star', url: CODECHEF_URL },
            { label: 'Codeforces - 1452', date: 'Specialist', url: CODEFORCES_URL },
        ],
        platformConfig: { label: 'RATING', color: '#1a1a1a', icon: '⭐' }
    },
    sotm: {
        id: 'award-ranks',
        layout: 'certificate_grid',
        title: 'Best Global Contest Ranks',
        items: [
            { label: 'LeetCode - #439', date: 'Global rank', url: LEETCODE_URL },
            { label: 'CodeChef - #51', date: 'out of 36k', url: CODECHEF_URL },
            { label: 'Codeforces - #1786', date: 'Global rank', url: CODEFORCES_URL },
        ],
        platformConfig: { label: 'RANK', color: '#1a1a1a', icon: '🏆' }
    },
    other: {
        id: 'award-other',
        layout: 'certificate_grid',
        title: 'Other Achievements',
        items: [
            { label: 'National Level Project Showcase', date: 'FENCE-UI, built with the Indian Army' },
            { label: 'Encode Technical Committee', date: 'Member, led technical initiatives' },
            { label: 'University Basketball', date: 'Represented PDEU in tournaments' },
        ],
        platformConfig: { label: 'PRESTIGE', color: '#1a1a1a', icon: '👑' }
    }
};

/**
 * AWARDS Milestone - Floating Cards
 * SOTY (center), SOTD, SOTM, Featured (behind)
 */
const AwardsMilestone = ({ z, scrollProgressRef }) => {
    // Pobieranie danych nagród z Sanity (z fallbackiem)
    const sanityAwards = useAwards();
    const awardsData = sanityAwards || AWARDS_DATA;

    const { camera, viewport } = useThree();
    const isTouch = isTouchDevice();
    const { openOverlay } = useScene();
    const groupRef = useRef();
    const sotyRef = useRef();
    const sotdRef = useRef();
    const sotmRef = useRef();

    // Card reveal refs (driven by button hover)
    const sotdCardRevealRef = useRef();
    const sotdCardPaintedRef = useRef();
    const sotdHideDelayRef = useRef();
    const sotmCardRevealRef = useRef();
    const sotmCardPaintedRef = useRef();
    const sotmHideDelayRef = useRef();
    const sotyCardRevealRef = useRef();
    const sotyCardPaintedRef = useRef();
    const sotyHideDelayRef = useRef();

    // Load textures
    const sotyTexture = useLoader(THREE.TextureLoader, '/textures/about/SOTY.webp');
    const sotdTexture = useLoader(THREE.TextureLoader, '/textures/about/SOTD.webp');
    const sotmTexture = useLoader(THREE.TextureLoader, '/textures/about/SOTM.webp');
    const sotyPaintedTexture = useLoader(THREE.TextureLoader, isTouch ? '/textures/about/SOTY.webp' : '/textures/about/SOTY_painted.webp');
    const sotdPaintedTexture = useLoader(THREE.TextureLoader, isTouch ? '/textures/about/SOTD.webp' : '/textures/about/SOTD_painted.webp');
    const sotmPaintedTexture = useLoader(THREE.TextureLoader, isTouch ? '/textures/about/SOTM.webp' : '/textures/about/SOTM_painted.webp');
    const buttonTexture = useLoader(THREE.TextureLoader, '/textures/about/button.webp');
    const buttonPaintedTexture = useLoader(THREE.TextureLoader, isTouch ? '/textures/about/button.webp' : '/textures/about/button_painted.webp');

    // Color space fix
    sotyTexture.colorSpace = THREE.SRGBColorSpace;
    sotdTexture.colorSpace = THREE.SRGBColorSpace;
    sotmTexture.colorSpace = THREE.SRGBColorSpace;
    sotyPaintedTexture.colorSpace = THREE.SRGBColorSpace;
    sotdPaintedTexture.colorSpace = THREE.SRGBColorSpace;
    sotmPaintedTexture.colorSpace = THREE.SRGBColorSpace;
    buttonTexture.colorSpace = THREE.SRGBColorSpace;
    buttonPaintedTexture.colorSpace = THREE.SRGBColorSpace;

    // Calculate aspect ratios
    // LEGACY FIX: Use original dimensions for cards (2400x1760) and buttons (894x208)
    const cardLegacyAspect = 2400 / 1760;
    const buttonLegacyAspect = 894 / 208;

    // Base height for cards
    const cardHeight = 2.5;

    // Button dimensions
    const buttonHeight = 0.35;
    const buttonWidth = buttonHeight * buttonLegacyAspect;
    const buttonY = -cardHeight / 2 - buttonHeight / 2 + 0.5;

    // Card hover handler factory
    const makeCardHoverHandler = (revealRef, paintedRef, hideDelayRef) => (isHovered) => {
        if (isTouch) return;
        if (isHovered) {
            if (revealRef.current) {
                gsap.to(revealRef.current, {
                    uProgress: 1.0,
                    duration: 0.8,
                    ease: 'power2.out',
                    overwrite: true
                });
            }
            if (hideDelayRef.current) hideDelayRef.current.kill();
            if (paintedRef.current) {
                paintedRef.current.visible = true;
                if (paintedRef.current.material) paintedRef.current.material.opacity = 1;
            }
        } else {
            if (revealRef.current) {
                gsap.to(revealRef.current, {
                    uProgress: 0.0,
                    duration: 0.5,
                    ease: 'power2.out',
                    overwrite: true
                });
            }
            hideDelayRef.current = gsap.delayedCall(0.55, () => {
                if (paintedRef.current && paintedRef.current.material) {
                    paintedRef.current.material.opacity = 0;
                }
            });
        }
    };

    useFrame((state) => {
        if (!groupRef.current) return;

        const scrollProgress = scrollProgressRef?.current || 0;
        const worldZ = ROOM_Z + scrollProgress + z;
        groupRef.current.visible = worldZ < MILESTONE_CORRIDOR_CLIP_Z;
        if (!groupRef.current.visible) return;

        const distanceZ = z + scrollProgress - 55;

        const revealStart = -120;
        const revealEnd = -50;
        let revealFactor = 0;

        if (distanceZ > revealStart && distanceZ < revealEnd) {
            revealFactor = (distanceZ - revealStart) / (revealEnd - revealStart);
            revealFactor = Math.min(1, Math.max(0, revealFactor));
            revealFactor = revealFactor * revealFactor;
        } else if (distanceZ >= revealEnd) {
            revealFactor = 1;
        }

        const sotyStart = -80;
        const sotyEnd = -20;
        let sotyFactor = 0;

        if (distanceZ > sotyStart && distanceZ < sotyEnd) {
            sotyFactor = (distanceZ - sotyStart) / (sotyEnd - sotyStart);
            sotyFactor = Math.min(1, Math.max(0, sotyFactor));
            sotyFactor = 1 - Math.pow(1 - sotyFactor, 2);
        } else if (distanceZ >= sotyEnd) {
            sotyFactor = 1;
        }

        const spreadX = 5;

        if (sotdRef.current) {
            sotdRef.current.position.x = -revealFactor * spreadX;
        }
        if (sotmRef.current) {
            sotmRef.current.position.x = revealFactor * spreadX;
        }

        if (sotyRef.current) {
            sotyRef.current.position.y = 0.5 + sotyFactor * 2.5;
        }
    });

    return (
        <group ref={groupRef} position={[0, 2, z]}>
            {/* Title */}
            <Text
                position={[0, 4, 0]}
                fontSize={1.2}
                color="#1a1a1a"
                anchorX="center"
                anchorY="middle"
                font="/fonts/RubikScribble-Regular.ttf"
            >
                AWARDS
            </Text>

            {/* === SOTD (behind SOTY, rendered second) === */}
            <group ref={sotdRef} position={[0, 0.5, -0.5]}>
                {/* Painted card (behind) - hidden until button hover */}
                <mesh ref={sotdCardPaintedRef} position={[0, 0, -0.001]} visible={true}>
                    <planeGeometry args={[cardHeight * cardLegacyAspect, cardHeight]} />
                    <meshBasicMaterial color="#e0e0e0"
                        map={sotdPaintedTexture}
                        transparent
                        opacity={0}
                        side={THREE.DoubleSide}
                        alphaTest={0.5}
                    />
                </mesh>
                {/* Sketch card (front) with reveal */}
                <mesh>
                    <planeGeometry args={[cardHeight * cardLegacyAspect, cardHeight]} />
                    <revealBasicMaterial
                        ref={sotdCardRevealRef}
                        map={sotdTexture}
                        transparent
                        side={THREE.DoubleSide}
                        uProgress={0.0}
                    />
                </mesh>
                {/* BUTTON */}
                <AwardButton
                    onClick={(e) => {
                        e.stopPropagation();
                        openOverlay(awardsData.sotd);
                    }}
                    texture={buttonTexture}
                    paintedTexture={buttonPaintedTexture}
                    width={buttonWidth}
                    height={buttonHeight}
                    position={[0, buttonY, 0.05]}
                    onHoverChange={makeCardHoverHandler(sotdCardRevealRef, sotdCardPaintedRef, sotdHideDelayRef)}
                />
                {/* AWARD LABEL */}
                <Text
                    position={[0, 0.95, 0.01]}
                    fontSize={0.45}
                    color="#1a1a1a"
                    anchorX="center"
                    anchorY="middle"
                    font="/fonts/CabinSketch-Bold.ttf"
                >
                    CP
                </Text>
                {/* AWARD COUNT */}
                <Text
                    position={[-0.05, 0, 0.01]}
                    fontSize={0.8}
                    color="#1a1a1a"
                    anchorX="center"
                    anchorY="middle"
                    font="/fonts/CabinSketch-Bold.ttf"
                >
                    {awardsData.sotd.items.length}
                </Text>
            </group>

            {/* === SOTM (behind SOTY, rendered third) === */}
            <group ref={sotmRef} position={[0, 0.5, -0.2]}>
                {/* Painted card (behind) - hidden until button hover */}
                <mesh ref={sotmCardPaintedRef} position={[0, 0, -0.001]} visible={true}>
                    <planeGeometry args={[cardHeight * cardLegacyAspect, cardHeight]} />
                    <meshBasicMaterial color="#e0e0e0"
                        map={sotmPaintedTexture}
                        transparent
                        opacity={0}
                        side={THREE.DoubleSide}
                        alphaTest={0.5}
                    />
                </mesh>
                {/* Sketch card (front) with reveal */}
                <mesh>
                    <planeGeometry args={[cardHeight * cardLegacyAspect, cardHeight]} />
                    <revealBasicMaterial
                        ref={sotmCardRevealRef}
                        map={sotmTexture}
                        transparent
                        side={THREE.DoubleSide}
                        uProgress={0.0}
                    />
                </mesh>
                {/* BUTTON */}
                <AwardButton
                    onClick={(e) => {
                        e.stopPropagation();
                        openOverlay(awardsData.sotm);
                    }}
                    texture={buttonTexture}
                    paintedTexture={buttonPaintedTexture}
                    width={buttonWidth}
                    height={buttonHeight}
                    position={[0, buttonY, 0.05]}
                    onHoverChange={makeCardHoverHandler(sotmCardRevealRef, sotmCardPaintedRef, sotmHideDelayRef)}
                />
                {/* AWARD LABEL */}
                <Text
                    position={[0, 0.95, 0.01]}
                    fontSize={0.45}
                    color="#1a1a1a"
                    anchorX="center"
                    anchorY="middle"
                    font="/fonts/CabinSketch-Bold.ttf"
                >
                    RANKS
                </Text>
                {/* AWARD COUNT */}
                <Text
                    position={[-0.05, 0, 0.01]}
                    fontSize={0.8}
                    color="#1a1a1a"
                    anchorX="center"
                    anchorY="middle"
                    font="/fonts/CabinSketch-Bold.ttf"
                >
                    {awardsData.sotm.items.length}
                </Text>
            </group>

            {/* === SOTY (front, center, rendered LAST = always on top) === */}
            <group ref={sotyRef} position={[0, 0.5, 0]}>
                {/* Painted card (behind) - hidden until button hover */}
                <mesh ref={sotyCardPaintedRef} position={[0, 0, -0.001]} visible={true}>
                    <planeGeometry args={[cardHeight * cardLegacyAspect, cardHeight]} />
                    <meshBasicMaterial color="#e0e0e0"
                        map={sotyPaintedTexture}
                        transparent
                        opacity={0}
                        side={THREE.DoubleSide}
                        alphaTest={0.5}
                    />
                </mesh>
                {/* Sketch card (front) with reveal */}
                <mesh>
                    <planeGeometry args={[cardHeight * cardLegacyAspect, cardHeight]} />
                    <revealBasicMaterial
                        ref={sotyCardRevealRef}
                        map={sotyTexture}
                        transparent
                        side={THREE.DoubleSide}
                    />
                </mesh>
                {/* BUTTON */}
                <AwardButton
                    onClick={(e) => {
                        e.stopPropagation();
                        openOverlay(awardsData.other);
                    }}
                    texture={buttonTexture}
                    paintedTexture={buttonPaintedTexture}
                    width={buttonWidth}
                    height={buttonHeight}
                    position={[0, buttonY, 0.05]}
                    onHoverChange={makeCardHoverHandler(sotyCardRevealRef, sotyCardPaintedRef, sotyHideDelayRef)}
                />
                {/* AWARD LABEL */}
                <Text
                    position={[0, 0.95, 0.01]}
                    fontSize={0.45}
                    color="#1a1a1a"
                    anchorX="center"
                    anchorY="middle"
                    font="/fonts/CabinSketch-Bold.ttf"
                >
                    OTHER
                </Text>
                {/* AWARD COUNT */}
                <Text
                    position={[-0.05, 0, 0.01]}
                    fontSize={0.8}
                    color="#1a1a1a"
                    anchorX="center"
                    anchorY="middle"
                    font="/fonts/CabinSketch-Bold.ttf"
                >
                    {awardsData.other.items.length}
                </Text>
            </group>
        </group>
    );
};

/**
 * JOURNEY Milestone - Floating Islands
 * UO Island (left) and Freelance Island (right) floating in clouds
 */
const JourneyMilestone = ({ z, scrollProgressRef }) => {
    const { camera, viewport } = useThree();
    const isTouch = isTouchDevice();
    const groupRef = useRef();
    const uoRef = useRef();
    const freelanceRef = useRef();

    // Load textures
    const uoTexture = useLoader(THREE.TextureLoader, '/textures/about/pdeuwyspa.webp');
    const freelanceTexture = useLoader(THREE.TextureLoader, '/textures/about/workwyspa.webp');

    // Texture settings
    uoTexture.colorSpace = THREE.SRGBColorSpace;
    freelanceTexture.colorSpace = THREE.SRGBColorSpace;

    // Calculate aspect ratios to keep images 1:1 (not stretched)
    // LEGACY FIX: Use original dimensions (2816x1536)
    const islandLegacyAspect = 2816 / 1536;
    const uoAspect = islandLegacyAspect;
    const freelanceAspect = islandLegacyAspect;

    // Base height for islands - width will adjust automatically
    const islandHeight = 4.5;

    useFrame((state) => {
        if (!groupRef.current) return;

        // === TWARDA LINIA CLIP (RĘCZNE OBLICZENIE WORLD Z) ===
        const scrollProgress = scrollProgressRef?.current || 0;
        const worldZ = ROOM_Z + scrollProgress + z;
        groupRef.current.visible = worldZ < MILESTONE_CORRIDOR_CLIP_Z;
        if (!groupRef.current.visible) return;

        const time = state.clock.elapsedTime;

        // FIX: Use consistent distance based on scrollProgress + offset
        const distanceZ = z + scrollProgress - 55;

        // Reveal effect (islands float up from below clouds)
        // === EDYTUJ TUTAJ (JOURNEY) ===
        const revealStart = -100; // Wcześniejszy start
        const revealEnd = -20;
        let revealFactor = 0;

        if (distanceZ > revealStart && distanceZ < revealEnd) {
            revealFactor = (distanceZ - revealStart) / (revealEnd - revealStart);
            revealFactor = Math.min(1, Math.max(0, revealFactor));
            revealFactor = 1 - Math.pow(1 - revealFactor, 2);
        } else if (distanceZ >= revealEnd) {
            revealFactor = 1;
        }

        // Floating animation (bobbing)
        // UO Island (Left)
        if (uoRef.current) {
            // === EDYTUJ POZYCJE TUTAJ (UO) ===
            const startY = -2;
            const endY = 1.5;

            const currentBaseY = startY + revealFactor * (endY - startY);
            uoRef.current.position.y = currentBaseY + Math.sin(time * 0.5) * 0.2;
            uoRef.current.rotation.z = Math.sin(time * 0.3) * 0.05;
        }

        // Freelance Island (Right)
        if (freelanceRef.current) {
            // === EDYTUJ POZYCJE TUTAJ (Freelance) ===
            const startY = -1;
            const endY = 2.5;

            const currentBaseY = startY + revealFactor * (endY - startY);
            freelanceRef.current.position.y = currentBaseY + Math.sin(time * 0.4 + 2) * 0.25;
            freelanceRef.current.rotation.z = Math.sin(time * 0.2 + 1) * -0.05;
        }
    });

    return (
        <group ref={groupRef} position={[0, 0, z]}>
            {/* Title */}
            <Text
                position={[0, 5, 0.3]}
                fontSize={1.2}
                color="#1a1a1a"
                anchorX="center"
                anchorY="middle"
                font="/fonts/RubikScribble-Regular.ttf"
            >
                JOURNEY
            </Text>

            {/* Subtitle */}
            <Text
                position={[0, 4.2, 0.3]}
                fontSize={0.35}
                color="#555555"
                anchorX="center"
                anchorY="middle"
                font="/fonts/CabinSketch-Regular.ttf"
            >
                My path so far...
            </Text>

            {/* === UO ISLAND (Left) === */}
            <group ref={uoRef} position={[-3.5, -1, 0]}>
                <mesh>
                    <planeGeometry args={[islandHeight * uoAspect, islandHeight]} />
                    <meshBasicMaterial color="#e0e0e0"
                        map={uoTexture}
                        transparent
                        side={THREE.DoubleSide}
                    />
                </mesh>
                {/* Island lettering (replaces the baked-in art) */}
                <Text
                    position={[0, 0.3, 0.05]}
                    fontSize={1.3}
                    color="#ffffff"
                    outlineWidth={0.02}
                    outlineColor="#1a1a1a"
                    anchorX="center"
                    anchorY="bottom"
                    font="/fonts/RubikScribble-Regular.ttf"
                >
                    PDEU
                </Text>
                {/* NAPIS NA WYSPIE (UO) - EDYTUJ TUTAJ */}
                <Text
                    position={[0.1, -0.85, 0.1]} // POZYCJA (X, Y, Z)
                    fontSize={0.4}           // WIELKOŚĆ
                    color="#1a1a1a"
                    anchorX="center"
                    anchorY="middle"
                    font="/fonts/CabinSketch-Bold.ttf"
                >
                    2023-NOW
                </Text>
            </group>

            {/* === FREELANCE ISLAND (Right) === */}
            <group ref={freelanceRef} position={[3.5, -2, 0.5]}>
                <mesh>
                    <planeGeometry args={[islandHeight * freelanceAspect, islandHeight]} />
                    <meshBasicMaterial color="#e0e0e0"
                        map={freelanceTexture}
                        transparent
                        side={THREE.DoubleSide}
                    />
                </mesh>
                {/* Island lettering (replaces the baked-in art) */}
                <Text
                    position={[0, 0.45, 0.05]}
                    fontSize={0.95}
                    color="#ffffff"
                    outlineWidth={0.02}
                    outlineColor="#1a1a1a"
                    anchorX="center"
                    anchorY="bottom"
                    font="/fonts/RubikScribble-Regular.ttf"
                >
                    INTERNSHIPS
                </Text>
                {/* NAPIS NA WYSPIE (Freelance) - EDYTUJ TUTAJ */}
                <Text
                    position={[0, -0.65, 0.1]} // POZYCJA (X, Y, Z)
                    fontSize={0.5}           // WIELKOŚĆ
                    color="#1a1a1a"
                    anchorX="center"
                    anchorY="middle"
                    font="/fonts/CabinSketch-Bold.ttf"
                >
                    2025-NOW
                </Text>
            </group>
        </group>
    );
};

/**
 * INTERNSHIP Milestones - one floating island per internship, alternating sides,
 * with the role, dates and highlights written next to it.
 */
const INTERNSHIPS = [
    {
        company: 'ENERPAC',
        role: 'SDE Intern',
        place: 'Bangalore',
        dates: 'JUN-JUL 2025',
        points: [
            'Financial dashboard backend (TypeScript/Python) over 800+ distributor payment records - risk prioritization 35% faster',
            'Python sales-prediction model for the Australian market that replaced a 3-hour weekly manual review',
        ],
    },
    {
        company: 'HEIZEN',
        role: 'SDE Intern',
        place: 'Hyderabad (Hybrid)',
        dates: 'MAR-MAY 2026',
        points: [
            'AI-driven hiring integration: webhook bridges, auto-rejection logic and an SPA frontend',
            'Google Sheets to PostgreSQL sync with flexible JSON storage for role-specific fields',
            'MLB StatsAPI stats platform with PDF reports and real-time leaderboards',
        ],
    },
    {
        company: 'IIT HYDERABAD',
        role: 'Research Intern',
        place: 'Hyderabad',
        dates: 'JUN 2026-NOW',
        points: [
            'MLOps VS Code extension: local open-source models for RAG, multi-model routing and load balancing on a Slurm H100 cluster',
            'Nano Cyber Range for 100 concurrent students with RBAC, automated evaluation and secure tab-locking',
            'FENCE appliance: Django web UI for DNS, NAT/firewall, FreeRADIUS and WireGuard, with LDAP/SQLite auth',
        ],
    },
];

const InternshipMilestone = ({ z, side, job, scrollProgressRef }) => {
    const groupRef = useRef();
    const islandRef = useRef();
    const textRef = useRef();

    const islandTexture = useLoader(THREE.TextureLoader, '/textures/about/workwyspa.webp');
    islandTexture.colorSpace = THREE.SRGBColorSpace;
    const islandHeight = 3.2;
    const islandWidth = islandHeight * (2816 / 1536); // same legacy aspect as the journey islands

    useFrame((state) => {
        if (!groupRef.current) return;

        const scrollProgress = scrollProgressRef?.current || 0;
        const worldZ = ROOM_Z + scrollProgress + z;
        groupRef.current.visible = worldZ < MILESTONE_CORRIDOR_CLIP_Z;
        if (!groupRef.current.visible) return;

        const time = state.clock.elapsedTime;

        // Same reveal curve as the JOURNEY islands (float up from below the clouds)
        const distanceZ = z + scrollProgress - 55;
        const revealStart = -100;
        const revealEnd = -20;
        let revealFactor = 0;
        if (distanceZ > revealStart && distanceZ < revealEnd) {
            revealFactor = (distanceZ - revealStart) / (revealEnd - revealStart);
            revealFactor = 1 - Math.pow(1 - revealFactor, 2);
        } else if (distanceZ >= revealEnd) {
            revealFactor = 1;
        }

        if (islandRef.current) {
            islandRef.current.position.y = -2 + revealFactor * 3.5 + Math.sin(time * 0.5 + side) * 0.2;
            islandRef.current.rotation.z = Math.sin(time * 0.3 + side) * 0.04;
        }
        if (textRef.current) {
            textRef.current.position.y = -1 + revealFactor * 3 + Math.sin(time * 0.4) * 0.08;
        }
    });

    const islandX = side * 3.2;
    const textX = -side * 0.4; // text block sits on the other side of the island
    const textAlign = side < 0 ? 'left' : 'right';
    const anchorX = side < 0 ? 'left' : 'right';

    return (
        <group ref={groupRef} position={[0, 0, z]}>
            {/* Island with company name on top and dates on the sign */}
            <group ref={islandRef} position={[islandX, 1.5, 0]}>
                <mesh>
                    <planeGeometry args={[islandWidth, islandHeight]} />
                    <meshBasicMaterial color="#e0e0e0" map={islandTexture} transparent side={THREE.DoubleSide} />
                </mesh>
                <Text
                    position={[0, 0.35, 0.05]}
                    fontSize={job.company.length > 8 ? 0.55 : 0.72}
                    color="#ffffff"
                    outlineWidth={0.02}
                    outlineColor="#1a1a1a"
                    anchorX="center"
                    anchorY="bottom"
                    font="/fonts/RubikScribble-Regular.ttf"
                >
                    {job.company}
                </Text>
                <Text
                    position={[0, -0.52, 0.1]}
                    fontSize={0.36}
                    color="#1a1a1a"
                    anchorX="center"
                    anchorY="middle"
                    font="/fonts/CabinSketch-Bold.ttf"
                >
                    {job.dates}
                </Text>
            </group>

            {/* Role + highlights */}
            <group ref={textRef} position={[textX, 2, 0.3]}>
                <Text
                    position={[0, 1.3, 0]}
                    fontSize={0.5}
                    color="#1a1a1a"
                    anchorX={anchorX}
                    anchorY="bottom"
                    font="/fonts/CabinSketch-Bold.ttf"
                >
                    {job.role}
                </Text>
                <Text
                    position={[0, 1.25, 0]}
                    fontSize={0.28}
                    color="#666666"
                    anchorX={anchorX}
                    anchorY="top"
                    font="/fonts/CabinSketch-Regular.ttf"
                >
                    {job.place}
                </Text>
                <Text
                    position={[0, 0.75, 0]}
                    fontSize={0.22}
                    lineHeight={1.35}
                    maxWidth={4.8}
                    color="#333333"
                    textAlign={textAlign}
                    anchorX={anchorX}
                    anchorY="top"
                    font="/fonts/CabinSketch-Regular.ttf"
                >
                    {job.points.map((p) => `- ${p}`).join('\n')}
                </Text>
            </group>
        </group>
    );
};

/**
 * SKILLS Milestone - Floating Balloons
 * Colorful balloons floating upward, each representing a skill
 */

// Balloon configuration: size category, texture path, position offset
// === EDYTUJ WYSOKOŚĆ TUTAJ (zmień wartość 'y' dla każdego balona) ===
// All resume skills. Logo-free textures come from scripts/make_blank_balloons.js and get the name printed via `labelY`.
const BALLOON_CONFIG = [
    // Top row (small)
    { texture: '/textures/about/expressbalon.webp', paintedTexture: '/textures/about/expressbalon_painted.webp', label: 'Express', size: 'small', x: -7.7, y: 3.95, z: -0.6, phase: 0.0, aspect: 631 / 1482, labelY: 0.22 },
    { texture: '/textures/about/nestbalon.webp', paintedTexture: '/textures/about/nestbalon_painted.webp', label: 'NestJS', size: 'small', x: -5.5, y: 4.35, z: -0.45, phase: 1.37, aspect: 631 / 1482, labelY: 0.22 },
    { texture: '/textures/about/threejsduzybalon.webp', paintedTexture: '/textures/about/threejsduzybalon_painted.webp', label: 'Three.js', size: 'small', x: -3.3, y: 3.95, z: -0.6, phase: 2.74 },
    { texture: '/textures/about/webrtcbalon.webp', paintedTexture: '/textures/about/webrtcbalon_painted.webp', label: 'WebRTC', size: 'small', x: -1.2, y: 4.35, z: -0.45, phase: 4.11, aspect: 631 / 1482, labelY: 0.22 },
    { texture: '/textures/about/grpcbalon.webp', paintedTexture: '/textures/about/grpcbalon_painted.webp', label: 'gRPC', size: 'small', x: 1.2, y: 3.95, z: -0.6, phase: 5.48, aspect: 631 / 1482, labelY: 0.22 },
    { texture: '/textures/about/mysqlbalon.webp', paintedTexture: '/textures/about/mysqlbalon_painted.webp', label: 'MySQL', size: 'small', x: 3.3, y: 4.35, z: -0.45, phase: 0.85, aspect: 631 / 1482, labelY: 0.22 },
    { texture: '/textures/about/mongobalon.webp', paintedTexture: '/textures/about/mongobalon_painted.webp', label: 'MongoDB', size: 'small', x: 5.5, y: 3.95, z: -0.6, phase: 2.22, aspect: 631 / 1482, labelY: 0.22 },
    { texture: '/textures/about/prismabalon.webp', paintedTexture: '/textures/about/prismabalon_painted.webp', label: 'Prisma', size: 'small', x: 7.7, y: 4.35, z: -0.45, phase: 3.59, aspect: 631 / 1482, labelY: 0.22 },
    // Main row (large)
    { texture: '/textures/about/typescriptbalon.webp', paintedTexture: '/textures/about/typescriptbalon_painted.webp', label: 'TypeScript', size: 'large', x: -6.6, y: 2.15, z: 0.4, phase: 4.96, aspect: 1141 / 1964, labelY: 0.1 },
    { texture: '/textures/about/gobalon.webp', paintedTexture: '/textures/about/gobalon_painted.webp', label: 'Go', size: 'large', x: -4, y: 2.55, z: 0.55, phase: 0.33, aspect: 1141 / 1964, labelY: 0.1 },
    { texture: '/textures/about/reactduzybalon.webp', paintedTexture: '/textures/about/reactduzybalon_painted.webp', label: 'React', size: 'large', x: -1.35, y: 2.15, z: 0.4, phase: 1.7 },
    { texture: '/textures/about/pythonbalon.webp', paintedTexture: '/textures/about/pythonbalon_painted.webp', label: 'Python', size: 'large', x: 1.35, y: 2.55, z: 0.55, phase: 3.07, aspect: 1141 / 1964, labelY: 0.1 },
    { texture: '/textures/about/dockerbalon.webp', paintedTexture: '/textures/about/dockerbalon_painted.webp', label: 'Docker', size: 'large', x: 4, y: 2.15, z: 0.4, phase: 4.44, aspect: 1141 / 1964, labelY: 0.1 },
    { texture: '/textures/about/kubernetesbalon.webp', paintedTexture: '/textures/about/kubernetesbalon_painted.webp', label: 'Kubernetes', size: 'large', x: 6.6, y: 2.55, z: 0.55, phase: 5.81, aspect: 1141 / 1964, labelY: 0.1 },
    // Middle row (medium)
    { texture: '/textures/about/cppbalon.webp', paintedTexture: '/textures/about/cppbalon_painted.webp', label: 'C++', size: 'medium', x: -8, y: -0.05, z: -0.3, phase: 1.18, aspect: 631 / 1482, labelY: 0.23 },
    { texture: '/textures/about/JSSREDNIBALON.webp', paintedTexture: '/textures/about/JSSREDNIBALON_painted.webp', label: 'JavaScript', size: 'medium', x: -6, y: 0.35, z: -0.15, phase: 2.55 },
    { texture: '/textures/about/nodebalon.webp', paintedTexture: '/textures/about/nodebalon_painted.webp', label: 'Node.js', size: 'medium', x: -4, y: -0.05, z: -0.3, phase: 3.92, aspect: 631 / 1482, labelY: 0.23 },
    { texture: '/textures/about/nextjssrednibalon.webp', paintedTexture: '/textures/about/nextjssrednibalon_painted.webp', label: 'Next.js', size: 'medium', x: -2, y: 0.35, z: -0.15, phase: 5.29 },
    { texture: '/textures/about/kafkabalon.webp', paintedTexture: '/textures/about/kafkabalon_painted.webp', label: 'Kafka', size: 'medium', x: 0, y: -0.05, z: -0.3, phase: 0.66, aspect: 631 / 1482, labelY: 0.23 },
    { texture: '/textures/about/postgresbalon.webp', paintedTexture: '/textures/about/postgresbalon_painted.webp', label: 'PostgreSQL', size: 'medium', x: 2, y: 0.35, z: -0.15, phase: 2.03, aspect: 631 / 1482, labelY: 0.23 },
    { texture: '/textures/about/redisbalon.webp', paintedTexture: '/textures/about/redisbalon_painted.webp', label: 'Redis', size: 'medium', x: 4, y: -0.05, z: -0.3, phase: 3.4, aspect: 631 / 1482, labelY: 0.23 },
    { texture: '/textures/about/terraformbalon.webp', paintedTexture: '/textures/about/terraformbalon_painted.webp', label: 'Terraform', size: 'medium', x: 6, y: 0.35, z: -0.15, phase: 4.77, aspect: 631 / 1482, labelY: 0.23 },
    { texture: '/textures/about/awsbalon.webp', paintedTexture: '/textures/about/awsbalon_painted.webp', label: 'AWS', size: 'medium', x: 8, y: -0.05, z: -0.3, phase: 0.14, aspect: 631 / 1482, labelY: 0.23 },
    // Bottom row (small)
    { texture: '/textures/about/linuxbalon.webp', paintedTexture: '/textures/about/linuxbalon_painted.webp', label: 'Linux', size: 'small', x: -6.5, y: -2.05, z: -0.2, phase: 1.51, aspect: 631 / 1482, labelY: 0.22 },
    { texture: '/textures/about/ansiblebalon.webp', paintedTexture: '/textures/about/ansiblebalon_painted.webp', label: 'Ansible', size: 'small', x: -3.6, y: -1.65, z: -0.05, phase: 2.88, aspect: 631 / 1482, labelY: 0.22 },
    { texture: '/textures/about/openstackbalon.webp', paintedTexture: '/textures/about/openstackbalon_painted.webp', label: 'OpenStack', size: 'small', x: 0, y: -2.05, z: -0.2, phase: 4.25, aspect: 631 / 1482, labelY: 0.22 },
    { texture: '/textures/about/kvmbalon.webp', paintedTexture: '/textures/about/kvmbalon_painted.webp', label: 'KVM', size: 'small', x: 3.6, y: -1.65, z: -0.05, phase: 5.62, aspect: 631 / 1482, labelY: 0.22 },
    { texture: '/textures/about/gitmalybalon.webp', paintedTexture: '/textures/about/gitmalybalon_painted.webp', label: 'Git', size: 'small', x: 6.5, y: -2.05, z: -0.2, phase: 0.99 },
];

// Size multipliers for balloon categories
const SIZE_MULTIPLIERS = {
    large: 3.0,
    medium: 2.2,
    small: 1.6,
};

// Individual balloon component
const SkillBalloon = ({ config, revealFactorRef, spreadFactorRef, timeRef }) => {
    const { viewport } = useThree();
    const isTouch = isTouchDevice();
    const texture = useLoader(THREE.TextureLoader, config.texture);
    const paintedTextureUrl = isTouch ? config.texture : config.paintedTexture;
    const paintedTexture = useLoader(THREE.TextureLoader, paintedTextureUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    paintedTexture.colorSpace = THREE.SRGBColorSpace;

    const [isPopping, setIsPopping] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [isFadingOutText, setIsFadingOutText] = useState(false);
    const popRef = useRef(0);
    const textFadeRef = useRef(1); // 1 = fully visible, 0 = hidden
    const respawnOffsetRef = useRef(0); // For floating back up after respawn
    const balloonMatRef = useRef();
    const balloonRevealRef = useRef(); // RevealBasicMaterial ref for sketch
    const paintedMeshRef = useRef(); // Painted balloon mesh visibility
    const paintedMatRef = useRef(); // Painted balloon material opacity control
    const hideDelayRef = useRef(); // Track pending gsap.delayedCall
    const textRef = useRef();

    // Audio Ref
    const balloonAudioRef = useRef();
    const { globalVolume, isMuted } = useAudio();

    const playBalloonSound = () => {
        if (balloonAudioRef.current) {
            const vol = isMuted ? 0 : BALLOON_AUDIO_SETTINGS.volume * globalVolume;
            balloonAudioRef.current.setVolume(vol);
            if (balloonAudioRef.current.isPlaying) balloonAudioRef.current.stop();
            balloonAudioRef.current.play();
        }
    };

    // LEGACY FIX: Use original aspect ratios from BALLOON_CONFIG or hardcoded for categories
    const legacyAspects = {
        'reactduzybalon.webp': 736 / 1447,
        'threejsduzybalon.webp': 1141 / 1964,
        'GSAPduzybalon.webp': 1.0, // GSAP balloon is square
        'default_small_medium': 631 / 1482 // Common ratio for others
    };
    
    const filename = config.texture.split('/').pop();
    const aspect = config.aspect || legacyAspects[filename] || legacyAspects['default_small_medium'];
    const baseHeight = SIZE_MULTIPLIERS[config.size];

    const outerGroupRef = useRef();
    const innerGroupRef = useRef();
    const targetScale = useRef(1.0);
    const currentScale = useRef(1.0);
    const targetMagnet = useRef({ x: 0, y: 0 });
    const currentMagnet = useRef({ x: 0, y: 0 });

    // === RESPONSYWNOŚĆ ===
    // Na mobile (wąski viewport) balony są bliżej środka
    const positionScale = isTouch ? 0.5 : 1; // Jak bardzo ściskamy pozycje na mobile
    const spreadScale = isTouch ? 0.4 : 1;   // Jak bardzo zmniejszamy spread na mobile
    const sizeScale = isTouch ? 0.85 : 1;    // Trochę mniejsze balony na mobile

    // Cursor handling
    useEffect(() => {
        if (hovered && !isPopping) {
            document.body.style.cursor = 'pointer';
        } else {
            document.body.style.cursor = 'auto';
        }
    }, [hovered, isPopping]);

    // Handle text fade out timer
    useEffect(() => {
        if (isPopping) {
            // Start fading out text after 3 seconds
            const timer = setTimeout(() => {
                setIsFadingOutText(true);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [isPopping]);

    // Hover handlers for brush-stroke reveal
    const handlePointerOver = (e) => {
        if (isTouch) return;
        e.stopPropagation();
        if (!isPopping) setHovered(true);

        // Brush-stroke reveal: show painted balloon
        if (balloonRevealRef.current) {
            gsap.to(balloonRevealRef.current, {
                uProgress: 1.0,
                duration: 0.8,
                ease: 'power2.out',
                overwrite: true
            });
        }
        if (hideDelayRef.current) hideDelayRef.current.kill();
        if (paintedMeshRef.current) paintedMeshRef.current.visible = true;
        if (paintedMatRef.current) paintedMatRef.current.opacity = 1;
    };

    const handlePointerOut = (e) => {
        if (isTouch) return;
        e.stopPropagation();
        setHovered(false);

        // Reverse reveal
        if (balloonRevealRef.current) {
            gsap.to(balloonRevealRef.current, {
                uProgress: 0.0,
                duration: 0.5,
                ease: 'power2.out',
                overwrite: true
            });
        }
        hideDelayRef.current = gsap.delayedCall(0.55, () => {
            if (paintedMatRef.current) paintedMatRef.current.opacity = 0;
        });
    };

    // Animation update loop
    useFrame((state, delta) => {
        if (hovered && !isPopping) {
            targetScale.current = 1.05; // lekkie powiększenie
        } else {
            targetScale.current = 1.0;
            targetMagnet.current.x = 0;
            targetMagnet.current.y = 0;
        }

        currentScale.current = THREE.MathUtils.lerp(currentScale.current, targetScale.current, 8 * delta);
        currentMagnet.current.x = THREE.MathUtils.lerp(currentMagnet.current.x, targetMagnet.current.x, 8 * delta);
        currentMagnet.current.y = THREE.MathUtils.lerp(currentMagnet.current.y, targetMagnet.current.y, 8 * delta);

        if (isPopping) {
            // Smooth, slow pop animation
            popRef.current = THREE.MathUtils.lerp(popRef.current, 1, 2.5 * delta);

            // Also hide painted mesh during pop (kill any pending reveals)
            if (hideDelayRef.current) hideDelayRef.current.kill();
            if (balloonRevealRef.current) {
                balloonRevealRef.current.uProgress = 0;
            }
        }

        if (isFadingOutText) {
            // Fade out the text slowly
            textFadeRef.current = THREE.MathUtils.lerp(textFadeRef.current, 0, 2 * delta);

            // Once fully faded, respawn the balloon from below
            if (textFadeRef.current < 0.05) {
                setIsPopping(false);
                setHovered(false);
                setIsFadingOutText(false);
                popRef.current = 0;
                textFadeRef.current = 1;
                respawnOffsetRef.current = -12; // Teleport below to float up again

                // Immediately teleport the mesh to prevent pointer events at the old location
                if (outerGroupRef.current) {
                    outerGroupRef.current.position.y -= 12;
                }

                // Immediately reset opacities to prevent flashing
                if (balloonRevealRef.current) balloonRevealRef.current.opacity = 1;
                if (textRef.current) textRef.current.fillOpacity = 0;
                // Reset reveal state on respawn
                if (balloonRevealRef.current) balloonRevealRef.current.uProgress = 0;
                if (paintedMatRef.current) paintedMatRef.current.opacity = 0;
                if (paintedMeshRef.current) paintedMeshRef.current.visible = false;
            }
        }

        // Float back up if respawning
        if (respawnOffsetRef.current < -0.01) {
            respawnOffsetRef.current = THREE.MathUtils.lerp(respawnOffsetRef.current, 0, 1.5 * delta);
        }

        // Apply opacities if not fully respawned
        if (balloonRevealRef.current && isPopping) {
            balloonRevealRef.current.opacity = 1 - popRef.current;
        }
        if (paintedMatRef.current && isPopping) {
            paintedMatRef.current.opacity = 1 - popRef.current;
        }
        if (textRef.current && isPopping) {
            // Combine pop-in and fade-out opacities
            textRef.current.fillOpacity = popRef.current * textFadeRef.current;
            textRef.current.outlineOpacity = popRef.current * textFadeRef.current;
        }
    });

    // Floating animation with unique phase — now computed inside useFrame
    // Moved from render body to avoid re-renders

    // Bazowa pozycja X (skalowana na mobile)
    const baseX = config.x * positionScale;

    // P2: Compute position/scale/rotation imperatively inside useFrame
    useFrame(() => {
        if (!outerGroupRef.current) return;

        const time = timeRef.current;
        const revealFactor = revealFactorRef.current;
        const spreadFactor = spreadFactorRef.current;

        // Floating animation with unique phase
        const floatY = Math.sin(time * 0.6 + config.phase) * 0.3;
        const floatX = Math.sin(time * 0.4 + config.phase * 0.7) * 0.15;
        const rotation = Math.sin(time * 0.3 + config.phase) * 0.08;

        // Reveal: balloons float up from below, including respawn offset
        const startY = config.y - 8;
        const endY = config.y;
        const currentY = startY + revealFactor * (endY - startY) + floatY + respawnOffsetRef.current;

        // Scale up as they reveal
        let scale = revealFactor * sizeScale;
        const popScaleEffect = currentScale.current + popRef.current * 0.4;
        scale *= popScaleEffect;

        // === SPREAD EFFECT (ROZSUWANIE) ===
        const maxSpread = 15 * spreadScale;
        let spreadX = 0;

        if (config.x < -0.5) {
            spreadX = -spreadFactor * maxSpread * (0.5 + Math.abs(config.x) / 6);
        } else if (config.x > 0.5) {
            spreadX = spreadFactor * maxSpread * (0.5 + Math.abs(config.x) / 6);
        } else {
            spreadX = config.phase > 3.5
                ? spreadFactor * maxSpread * 0.8
                : -spreadFactor * maxSpread * 0.8;
        }

        // Apply imperatively
        outerGroupRef.current.position.set(baseX + floatX + spreadX, currentY, config.z);
        outerGroupRef.current.rotation.z = rotation;
        const s = Math.max(0.001, scale); // Avoid zero scale
        outerGroupRef.current.scale.set(s, s, s);

        // Update magnet position on inner group imperatively
        if (innerGroupRef.current) {
            innerGroupRef.current.position.set(currentMagnet.current.x, currentMagnet.current.y, 0);
        }
    });

    return (
        <group
            ref={outerGroupRef}
            position={[baseX, config.y - 8, config.z]}
        >
            <group ref={innerGroupRef}>
                {/* Painted balloon (behind) - hidden until hover */}
                <mesh ref={paintedMeshRef} visible={true}>
                    <planeGeometry args={[baseHeight * aspect, baseHeight]} />
                    <meshBasicMaterial color="#e0e0e0"
                        ref={paintedMatRef}
                        map={paintedTexture}
                        transparent
                        opacity={0}
                        side={THREE.DoubleSide}
                        alphaTest={0.5}
                        depthWrite={false}
                    />
                </mesh>

                {/* Sketch balloon (front) with brush-stroke reveal */}
                <mesh
                    position={[0, 0, 0.001]}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!isPopping) {
                            setIsPopping(true);
                            playBalloonSound();
                        }
                    }}
                    onPointerOver={handlePointerOver}
                    onPointerOut={handlePointerOut}
                    onPointerMove={(e) => {
                        if (hovered && !isPopping && outerGroupRef.current) {
                            outerGroupRef.current.getWorldPosition(_tempVec3);
                            // Reduced magnetic pull from 0.5 to 0.15 for gentler effect
                            targetMagnet.current.x = (e.point.x - _tempVec3.x) * 0.15;
                            targetMagnet.current.y = (e.point.y - _tempVec3.y) * 0.15;
                        }
                    }}
                    visible={popRef.current < 0.99}
                >
                    <planeGeometry args={[baseHeight * aspect, baseHeight]} />
                    <revealBasicMaterial
                        ref={balloonRevealRef}
                        map={texture}
                        transparent
                        side={THREE.DoubleSide}
                        depthWrite={false}
                        uProgress={0.0}
                    />
                </mesh>

                {/* Skill name printed on logo-free balloons */}
                {config.labelY !== undefined && !isPopping && (
                    <Text
                        position={[0, baseHeight * config.labelY, 0.02]}
                        fontSize={baseHeight * Math.min(0.2, 0.8 / config.label.length)}
                        maxWidth={baseHeight * aspect * 0.8}
                        color="#1a1a1a"
                        anchorX="center"
                        anchorY="middle"
                        font="/fonts/CabinSketch-Bold.ttf"
                    >
                        {config.label}
                    </Text>
                )}

                {/* Stack Name Text that fades in then out */}
                {isPopping && textFadeRef.current > 0.01 && (
                    <Text
                        ref={textRef}
                        position={[0, 0, 0.1]}
                        fontSize={baseHeight * 0.4}
                        color="#1a1a1a"
                        anchorX="center"
                        anchorY="middle"
                        font="/fonts/RubikScribble-Regular.ttf"
                        fillOpacity={0}
                        outlineWidth={0.02}
                        outlineColor="#fff"
                        outlineOpacity={0}
                    >
                        {config.label}
                    </Text>
                )}

                <PositionalAudio
                    ref={balloonAudioRef}
                    url="/sounds/baloonpoop.mp3"
                    distanceModel="exponential"
                    rolloffFactor={BALLOON_AUDIO_SETTINGS.rolloff}
                    refDistance={BALLOON_AUDIO_SETTINGS.distance}
                    loop={false}
                />
            </group>
        </group>
    );
};

const SkillsMilestone = ({ z, scrollProgressRef }) => {
    const { camera, viewport } = useThree();
    const isTouch = isTouchDevice();
    const groupRef = useRef();
    // P2: Use refs instead of state to avoid 60 re-renders/sec inside useFrame
    const revealFactorRef = useRef(0);
    const spreadFactorRef = useRef(0);
    const timeRef = useRef(0);

    useFrame((state) => {
        if (!groupRef.current) return;

        // === TWARDA LINIA CLIP (RĘCZNE OBLICZENIE WORLD Z) ===
        const scrollProgress = scrollProgressRef?.current || 0;
        const worldZ = ROOM_Z + scrollProgress + z;
        groupRef.current.visible = worldZ < MILESTONE_CORRIDOR_CLIP_Z;
        if (!groupRef.current.visible) return;

        timeRef.current = state.clock.elapsedTime;

        // FIX: Use consistent distance based on scrollProgress + offset
        const distanceZ = z + scrollProgress - 55;

        // Reveal effect (balloons float up)
        // === EDYTUJ TUTAJ (SKILLS REVEAL) ===
        const revealStart = -100;
        const revealEnd = -25;
        let newRevealFactor = 0;

        if (distanceZ > revealStart && distanceZ < revealEnd) {
            newRevealFactor = (distanceZ - revealStart) / (revealEnd - revealStart);
            newRevealFactor = Math.min(1, Math.max(0, newRevealFactor));
            newRevealFactor = 1 - Math.pow(1 - newRevealFactor, 3); // ease out cubic
        } else if (distanceZ >= revealEnd) {
            newRevealFactor = 1;
        }

        revealFactorRef.current = newRevealFactor;

        // === SPREAD EFFECT (EDYTUJ TUTAJ SKILLS SPREAD) ===
        // Im bliżej kamery, tym bardziej balony się rozsuwają
        // Większy zakres = dłuższa, bardziej widoczna animacja
        const spreadStart = -70; // Kiedy animacja SIĘ ZACZYNA (Wcześniej)
        const spreadEnd = -40;    // Kiedy animacja jest PEŁNA (Później)
        let newSpreadFactor = 0;

        if (distanceZ > spreadStart && distanceZ < spreadEnd) {
            newSpreadFactor = (distanceZ - spreadStart) / (spreadEnd - spreadStart);
            newSpreadFactor = Math.min(1, Math.max(0, newSpreadFactor));
            newSpreadFactor = newSpreadFactor * newSpreadFactor; // ease in
        } else if (distanceZ >= spreadEnd) {
            newSpreadFactor = 1;
        }

        spreadFactorRef.current = newSpreadFactor;
    });

    return (
        <group ref={groupRef} position={[0, 0, z]}>
            {/* Title */}
            <Text
                position={[0, 6, 0.5]}
                fontSize={1.2}
                color="#1a1a1a"
                anchorX="center"
                anchorY="middle"
                font="/fonts/RubikScribble-Regular.ttf"
            >
                SKILLS
            </Text>

            {/* Subtitle */}
            <Text
                position={[0, 5.2, 0.5]}
                fontSize={0.35}
                color="#555555"
                anchorX="center"
                anchorY="middle"
                font="/fonts/CabinSketch-Regular.ttf"
            >
                Technologies I love working with
            </Text>

            {/* === FLOATING BALLOONS === */}
            {BALLOON_CONFIG.map((config, index) => (
                <SkillBalloon
                    key={index}
                    config={config}
                    revealFactorRef={revealFactorRef}
                    spreadFactorRef={spreadFactorRef}
                    timeRef={timeRef}
                />
            ))}
        </group>
    );
};

// =========================================
// NOTE: Use this component inside the loop!
// =========================================

export default InfiniteSkyManager;
