// Erases the logo from a few balloon textures so skills without drawn art can reuse them.
// Region = ellipse in normalized coords [cx, cy, rx, ry]; filled with the balloon colour sampled just outside it.
// Painted variants are hue-rotated for colour variety.
import sharp from 'sharp';

const DIR = 'public/textures/about/';
const SOURCES = {
    large: { src: 'threejsduzybalon', sketch: [0.5, 0.41, 0.4, 0.23], painted: [0.48, 0.4, 0.4, 0.25] },
    medium: { src: 'JSSREDNIBALON', sketch: [0.49, 0.265, 0.34, 0.2], painted: [0.52, 0.27, 0.34, 0.2] },
    small: { src: 'gitmalybalon', sketch: [0.48, 0.275, 0.34, 0.2], painted: [0.5, 0.275, 0.34, 0.2] },
};
// [output name, size, hue shift in degrees] - skills that have no logo balloon
const OUTPUTS = [
    ['go', 'large', 150], ['python', 'large', 230], ['docker', 'large', 180], ['kubernetes', 'large', 200], ['typescript', 'large', 190],
    ['cpp', 'medium', 200], ['node', 'medium', 80], ['kafka', 'medium', 0], ['postgres', 'medium', 170], ['redis', 'medium', 320],
    ['terraform', 'medium', 240], ['aws', 'medium', 330],
    ['express', 'small', 0], ['nest', 'small', 300], ['webrtc', 'small', 110], ['grpc', 'small', 160], ['mysql', 'small', 180],
    ['mongo', 'small', 60], ['prisma', 'small', 220], ['linux', 'small', 30], ['ansible', 'small', 240], ['openstack', 'small', 330],
    ['kvm', 'small', 270],
];

async function erase(file, [cx, cy, rx, ry]) {
    const { data, info } = await sharp(DIR + file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    const at = (x, y) => (y * w + x) * 4;
    const d = (x, y) => ((x / w - cx) / rx) ** 2 + ((y / h - cy) / ry) ** 2;
    // Median colour of a thin ring just outside the ellipse
    const ring = [[], [], []];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = d(x, y);
        if (v > 1.1 && v < 1.4 && data[at(x, y) + 3] > 200) for (let c = 0; c < 3; c++) ring[c].push(data[at(x, y) + c]);
    }
    const fill = ring.map((a) => a.sort((p, q) => p - q)[a.length >> 1]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const t = Math.min(1, Math.max(0, (1.15 - d(x, y)) / 0.25)); // feathered edge
        if (t > 0) for (let c = 0; c < 3; c++) data[at(x, y) + c] = data[at(x, y) + c] * (1 - t) + fill[c] * t;
    }
    return sharp(data, { raw: info });
}

for (const [size, cfg] of Object.entries(SOURCES)) {
    const sketch = await (await erase(`${cfg.src}.webp`, cfg.sketch)).webp({ quality: 90 }).toBuffer();
    const painted = await (await erase(`${cfg.src}_painted.webp`, cfg.painted)).png().toBuffer();
    for (const [name, s, hue] of OUTPUTS.filter((o) => o[1] === size)) {
        await sharp(sketch).toFile(`${DIR}${name}balon.webp`);
        await sharp(painted).modulate({ hue }).webp({ quality: 90 }).toFile(`${DIR}${name}balon_painted.webp`);
        console.log(`${name}balon (${s}, from ${cfg.src})`);
    }
}
