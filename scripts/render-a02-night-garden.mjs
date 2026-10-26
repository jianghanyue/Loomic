import fs from "node:fs/promises";
import {
  checkPattern,
  layoutTossed,
  renderRepeatPreview,
  renderTile,
  renderTileLarge,
} from "../packages/textile/dist/index.js";

const outDir = "artifacts/textile-pattern";
await fs.mkdir(outDir, { recursive: true });

function svg(body, width = 200, height = 200) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
  );
}

function flower(petal, center = "#c8b36a") {
  const petals = Array.from({ length: 8 }, (_, i) => {
    const a = i * 45;
    return `<ellipse cx="100" cy="58" rx="28" ry="62" fill="${petal}" stroke="#2b2a33" stroke-width="3" transform="rotate(${a} 100 100)"/>`;
  }).join("");
  return svg(
    `${petals}<circle cx="100" cy="100" r="27" fill="${center}"/><circle cx="100" cy="100" r="10" fill="#2b2a33"/>`,
  );
}

function sprig(leaf, stem = "#68735d") {
  const leaves = [45, 90, 135, 180, 225, 270]
    .map((y, i) => {
      const dir = i % 2 ? -1 : 1;
      const x = 100 + dir * 42;
      return `<ellipse cx="${x}" cy="${y}" rx="24" ry="48" fill="${leaf}" stroke="#2b2a33" stroke-width="3" transform="rotate(${dir * 35} ${x} ${y})"/>`;
    })
    .join("");
  return svg(
    `<path d="M100 188 C95 145 105 95 100 16" fill="none" stroke="${stem}" stroke-width="9"/>${leaves}`,
  );
}

function leaf(fill) {
  return svg(
    `<path d="M100 10 C175 100 165 175 100 195 C35 175 25 100 100 10Z" fill="${fill}" stroke="#2b2a33" stroke-width="4"/><path d="M100 22 L100 180" stroke="#2b2a33" stroke-width="4"/>`,
  );
}

function moth(wing = "#8ea2b5", accent = "#c8b36a") {
  return svg(
    `<g transform="translate(100 105)"><path d="M-8 0 C-70 -90 -98 -50 -78 24 C-60 78 -25 58 -7 15Z" fill="${wing}" stroke="#2b2a33" stroke-width="5"/><path d="M8 0 C70 -90 98 -50 78 24 C60 78 25 58 7 15Z" fill="${wing}" stroke="#2b2a33" stroke-width="5"/><path d="M-7 -3 C-45 -30 -62 -20 -58 4 C-50 27 -28 31 -9 16Z" fill="${accent}"/><path d="M7 -3 C45 -30 62 -20 58 4 C50 27 28 31 9 16Z" fill="${accent}"/><ellipse cx="0" cy="12" rx="8" ry="40" fill="#2b2a33"/></g>`,
  );
}

function berry(fill = "#e6e0d2", stem = "#68735d") {
  return svg(
    `<path d="M100 180 C100 145 100 115 100 70" stroke="${stem}" stroke-width="8" fill="none"/><g fill="${fill}"><circle cx="75" cy="78" r="18"/><circle cx="100" cy="52" r="18"/><circle cx="125" cy="78" r="18"/><circle cx="82" cy="112" r="18"/><circle cx="118" cy="112" r="18"/></g>`,
  );
}

const motifs = [
  { id: "camellia", src: flower("#8ea2b5"), widthCm: 17 },
  { id: "sprig", src: sprig("#68735d"), widthCm: 10 },
  { id: "gold-leaf", src: leaf("#c8b36a"), widthCm: 7 },
  { id: "berry", src: berry(), widthCm: 4 },
  { id: "moth", src: moth(), widthCm: 8 },
];

const repeat = { type: "half_drop", widthCm: 64, heightCm: 64, dpi: 150 };
const main = layoutTossed(repeat, motifs, {
  count: 5,
  motifIds: ["camellia"],
  scaleRange: [0.9, 1.1],
  rotationRange: [-14, 14],
  gapCm: 0.5,
  seed: 20261023,
});
const sprigs = layoutTossed(repeat, motifs, {
  count: 9,
  motifIds: ["sprig", "gold-leaf"],
  weights: [0.6, 0.4],
  scaleRange: [0.65, 0.95],
  rotationRange: [-25, 25],
  gapCm: 0.2,
  seed: 20261024,
  avoid: main.placements,
});
const fillers = layoutTossed(repeat, motifs, {
  count: 20,
  motifIds: ["berry", "moth"],
  weights: [0.75, 0.25],
  scaleRange: [0.55, 0.9],
  rotationRange: [-35, 35],
  gapCm: 0.1,
  seed: 20261025,
  avoid: [...main.placements, ...sprigs.placements],
});
const doc = {
  repeat,
  ground: "#2b2a33",
  motifs,
  placements: [...main.placements, ...sprigs.placements, ...fillers.placements],
};

const reportTile = await renderTile(doc, { dpi: 40 });
const report = checkPattern(doc, reportTile, { gapCm: 0 });
const preview = await renderRepeatPreview(reportTile, {
  cols: 2,
  rows: 2,
  maxWidth: 1200,
});
await fs.writeFile(`${outDir}/a02-night-garden-repeat-preview.png`, preview);
const exportResult = await renderTileLarge(doc, {
  maxEdgePx: 8192,
  format: "png",
});
await fs.writeFile(`${outDir}/a02-night-garden-8192.png`, exportResult.buffer);
await fs.writeFile(
  `${outDir}/a02-night-garden-report.json`,
  JSON.stringify(
    {
      name: "A02 · 夜航花园 Night Garden",
      repeat: doc.repeat,
      straightRepeat: { widthCm: 128, heightCm: 64 },
      palette: ["#2b2a33", "#8ea2b5", "#c8b36a", "#68735d", "#e6e0d2"],
      elements: motifs.map(({ id, widthCm }) => ({ id, widthCm })),
      requested: { main: 5, secondary: 9, filler: 20 },
      placed: {
        main: main.placed,
        secondary: sprigs.placed,
        filler: fillers.placed,
      },
      export: {
        width: exportResult.width,
        height: exportResult.height,
        dpi: exportResult.dpi,
      },
      checks: {
        seamless: report.seams.seamless,
        overlaps: report.overlaps.length,
        coveragePercent: Math.round(report.coverage.coverage * 10000) / 100,
        unevenness: Math.round(report.coverage.unevenness * 100) / 100,
        emptyCells: report.coverage.emptyCells,
      },
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    preview: `${outDir}/a02-night-garden-repeat-preview.png`,
    export: `${outDir}/a02-night-garden-8192.png`,
    report: `${outDir}/a02-night-garden-report.json`,
    checks: {
      seamless: report.seams.seamless,
      overlaps: report.overlaps.length,
    },
  }),
);
