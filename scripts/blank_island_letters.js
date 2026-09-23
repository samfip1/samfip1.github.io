// Erases the baked-in lettering at the top of the journey island textures.
import sharp from 'sharp';

const jobs = [
    ['uowyspa', 'pdeuwyspa', 0.39],
    ['freelancewyspa', 'workwyspa', 0.37],
];

for (const [src, out, cut] of jobs) {
    const { data, info } = await sharp(`public/textures/about/${src}.webp`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const rows = Math.round(info.height * cut);
    for (let i = 0; i < rows * info.width; i++) data[i * 4 + 3] = 0;
    await sharp(data, { raw: info }).webp({ quality: 90 }).toFile(`public/textures/about/${out}.webp`);
    console.log(out, info.width, info.height, 'cleared rows', rows);
}
