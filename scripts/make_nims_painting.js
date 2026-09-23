// Builds the Nimsdai painting for the corridor frame: photo on the left, quote on the right.
// Sketch version hangs on the wall; the painted (colour) version is revealed on hover.
//   node scripts/make_nims_painting.js [photo]   (default: ../nims.jpg, i.e. Mine/nims.jpg)
// Without a photo, a sketched mountain placeholder is used.
// Default photo: Nirmal Purja by Iamthanes, CC BY-SA 4.0 (Wikimedia Commons, File:NIRMAL PURJA "NIMS".jpg)
import fs from 'fs';
import sharp from 'sharp';
import { panelText } from './sketch_text.js';

const W = 2048, H = 972; // matches the 2.0 x 0.95 picture area inside the frame
const PHOTO = { left: 70, top: 70, width: 700, height: H - 140 };
const QUOTE = '“Giving up is not in the blood, sir.\nIt’s not in the blood.”';
const BY = '— Nirmal “Nimsdai” Purja';
const OUT = 'public/textures/corridor/';
const photoPath = process.argv[2] || '../nims.jpg';

const svg = (body, w, h) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`);

// Pencil sketch: greyscale colour-dodged with its own blurred negative (the line work),
// then multiplied with a lightened copy of the photo so dark areas keep some shading
async function pencil(input) {
    const grey = await sharp(input).greyscale().toColourspace('b-w').png().toBuffer();
    const inv = await sharp(grey).negate({ alpha: false }).blur(8).png().toBuffer();
    const lines = await sharp(grey).composite([{ input: inv, blend: 'colour-dodge' }]).linear(1.2, -40).png().toBuffer();
    const shade = await sharp(grey).linear(0.55, 115).png().toBuffer();
    return sharp(lines).composite([{ input: shade, blend: 'multiply' }]).toColourspace('srgb').png().toBuffer();
}

function placeholder(painted) {
    const { width: w, height: h } = PHOTO;
    const sky = painted ? '#bcd7ee' : '#fbfaf6';
    const rock = painted ? '#7d8796' : 'none';
    const snow = painted ? '#ffffff' : 'none';
    return svg(`
        <rect width="${w}" height="${h}" fill="${sky}"/>
        <circle cx="${w * 0.78}" cy="${h * 0.2}" r="48" fill="${painted ? '#f6c85f' : 'none'}" stroke="#222" stroke-width="4"/>
        <path d="M0 ${h * 0.8} L${w * 0.22} ${h * 0.52} L${w * 0.34} ${h * 0.6} L${w * 0.55} ${h * 0.22} L${w * 0.72} ${h * 0.5} L${w * 0.82} ${h * 0.42} L${w} ${h * 0.7} L${w} ${h} L0 ${h}Z"
              fill="${rock}" stroke="#222" stroke-width="5" stroke-linejoin="round"/>
        <path d="M${w * 0.47} ${h * 0.36} L${w * 0.55} ${h * 0.22} L${w * 0.63} ${h * 0.36} L${w * 0.58} ${h * 0.33} L${w * 0.55} ${h * 0.38} L${w * 0.51} ${h * 0.33}Z"
              fill="${snow}" stroke="#222" stroke-width="4" stroke-linejoin="round"/>
        <path d="M${w * 0.55} ${h * 0.22} L${w * 0.55} ${h * 0.12} L${w * 0.63} ${h * 0.14} L${w * 0.55} ${h * 0.16}" fill="${painted ? '#d64541' : 'none'}" stroke="#222" stroke-width="4"/>
        <path d="M${w * 0.1} ${h * 0.9} q60 -20 120 0 t120 0 M${w * 0.5} ${h * 0.86} q50 -18 100 0 t100 0" fill="none" stroke="#222" stroke-width="3" opacity="0.5"/>
    `, w, h);
}

async function photoLayer(painted) {
    const { width, height } = PHOTO;
    if (!fs.existsSync(photoPath)) return sharp(placeholder(painted)).png().toBuffer();
    const fitted = await sharp(photoPath).rotate().resize(width, height, { fit: 'cover', position: 'attention' }).png().toBuffer();
    return painted ? sharp(fitted).modulate({ saturation: 0.9 }).png().toBuffer() : pencil(fitted);
}

async function build(painted) {
    const paper = painted ? '#efe4c8' : '#f7f5f0';
    const ink = painted ? '#2a1d12' : '#1c1c1c';
    const textW = W - PHOTO.left - PHOTO.width - 140;
    const text = panelText([{ text: QUOTE, size: 104, color: ink }, { text: BY, size: 64, color: ink, opacity: 0.7 }], textW);
    const { height: textH } = await sharp(text).metadata();
    const border = svg(`<rect x="3" y="3" width="${PHOTO.width - 6}" height="${PHOTO.height - 6}" fill="none" stroke="${ink}" stroke-width="6"/>`, PHOTO.width, PHOTO.height);
    const file = `${OUT}nims${painted ? '_painted' : ''}.webp`;
    await sharp({ create: { width: W, height: H, channels: 4, background: paper } })
        .composite([
            { input: await photoLayer(painted), left: PHOTO.left, top: PHOTO.top },
            { input: border, left: PHOTO.left, top: PHOTO.top },
            { input: text, left: PHOTO.left + PHOTO.width + 70, top: Math.round((H - textH) / 2) },
        ])
        .webp({ quality: 90 })
        .toFile(file);
    console.log(file, fs.existsSync(photoPath) ? `(photo: ${photoPath})` : '(placeholder: no photo found)');
}

await build(false);
await build(true);
