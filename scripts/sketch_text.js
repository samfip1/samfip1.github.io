// Renders text as SVG glyph outlines in the sketch font (via troika's bundled Typr parser),
// because pango on macOS can't load a font file directly.
import fs from 'fs';
import typrFactory from 'troika-three-text/libs/typr.factory.js';

globalThis.self = globalThis;
const Typr = typrFactory();
const FONT = new URL('../public/fonts/CabinSketch-Bold.ttf', import.meta.url);

const font = Typr.parse(fs.readFileSync(FONT))[0];
const UPM = font.head.unitsPerEm;
const glyph = (ch) => Typr.U.codeToGlyph(font, ch.codePointAt(0));
const advance = (text, size) => [...text].reduce((w, ch) => w + font.hmtx.aWidth[glyph(ch)], 0) * size / UPM;

function wrap(paragraph, size, maxWidth) {
    const lines = [];
    let line = '';
    for (const word of paragraph.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (line && advance(next, size) > maxWidth) { lines.push(line); line = word; } else line = next;
    }
    return [...lines, line];
}

function linePath(text, size, x0, baseline) {
    const k = size / UPM;
    let d = '', x = x0;
    for (const ch of text) {
        const g = glyph(ch);
        const { cmds, crds } = Typr.U.glyphToPath(font, g);
        let i = 0;
        const pt = () => `${(x + crds[i++] * k).toFixed(1)} ${(baseline - crds[i++] * k).toFixed(1)}`;
        for (const c of cmds) {
            if (c === 'M' || c === 'L') d += `${c}${pt()}`;
            else if (c === 'Q') d += `Q${pt()} ${pt()}`;
            else if (c === 'C') d += `C${pt()} ${pt()} ${pt()}`;
            else d += 'Z';
        }
        x += font.hmtx.aWidth[g] * k;
    }
    return d;
}

// blocks: [{ text, size, color, opacity }] -> centred, wrapped SVG
export function panelText(blocks, width) {
    let y = 0, paths = '';
    for (const { text, size, color, opacity = 1 } of blocks) {
        let d = '';
        for (const para of text.split('\n')) {
            if (!para) { y += size * 0.6; continue; }
            for (const line of wrap(para, size, width)) {
                y += size * 1.25;
                d += linePath(line, size, (width - advance(line, size)) / 2, y);
            }
        }
        paths += `<path d="${d}" fill="${color}" fill-opacity="${opacity}"/>`;
        y += size * 1.2;
    }
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.ceil(y)}">${paths}</svg>`);
}

