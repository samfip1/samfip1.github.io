// Builds gallery card fronts: wipes the screenshot panel of an existing card and prints a project summary on it.
import sharp from 'sharp';
import { panelText } from './sketch_text.js';

const DIR = 'public/textures/gallery/';
const PANEL = { left: 126, top: 610, width: 776, height: 1286 }; // inner box of the 1024x2048 card
const PAINTED_PANEL = { ...PANEL, left: 124, width: 788 }; // painted screenshot bleeds a bit wider

const CARDS = [
    ['fiplive', 'Distributed real-time live streaming.\n\nA mini Twitch + Kahoot: chat, polls, paid events and VOD for 10,000 viewers.', 'Go · Kafka · gRPC\nRedis · LiveKit · K8s'],
    ['forensics', 'Linux Forensics\nLab-in-a-Box.\n\nOne-command lab environments for the NFSU / ISEA faculty program.', 'OpenTofu · Ansible\nLinode · Nginx'],
    ['naval', '3D Naval Combat.\n\nA 60 FPS browser game with physics-based water shaders and AABB collisions.', 'JavaScript\nThree.js'],
    ['kalasetu', 'Kala Setu.\n\nA multi-vendor marketplace where artisans sell products and live classes.', 'React · Node · TS\nRazorpay · Redis'],
    ['wallet', 'Secure Digital Wallet.\n\nJWT auth, P2P transfers, cashbacks, leaderboards and admin freeze controls.', 'MySQL · Node.js\nReact'],
    ['music', 'Collaborative Music Lobby.\n\nVote on Spotify tracks; a priority queue re-orders playback live.', 'React · Prisma\nTypeScript'],
];

async function build(base, out, fill, body, stack, color, panel = PANEL) {
    const blank = await sharp({ create: { width: panel.width, height: panel.height, channels: 4, background: fill } }).png().toBuffer();
    const text = panelText([{ text: body, size: 74, color }, { text: stack, size: 60, color, opacity: 0.65 }], PANEL.width - 110);
    const { width, height } = await sharp(text).metadata();
    await sharp(DIR + base)
        .composite([
            { input: blank, left: panel.left, top: panel.top },
            { input: text, left: PANEL.left + Math.round((PANEL.width - width) / 2), top: PANEL.top + Math.max(40, Math.round((PANEL.height - height) / 2)) },
        ])
        .webp({ quality: 90 })
        .toFile(DIR + out);
}

// Cream sampled from the painted card's top box so the painted panel matches the paper
const { dominant } = await sharp(DIR + 'monetuneprzod_painted.webp').extract({ left: 150, top: 150, width: 700, height: 300 }).stats();

for (const [id, body, stack] of CARDS) {
    await build('monetuneprzod.webp', `${id}przod.webp`, '#ffffff', body, stack, '#1c1c1c');
    await build('monetuneprzod_painted.webp', `${id}przod_painted.webp`, { r: dominant.r, g: dominant.g, b: dominant.b, alpha: 1 }, body, stack, '#2a1d12', PAINTED_PANEL);
    console.log(id);
}
