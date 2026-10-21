// Built-in vector motifs so patterns can be laid out without an image model.
// Referenced from pattern docs as `builtin:<name>`, recoloured via `colors`.

type BuiltinMotif = {
  description: string;
  /** Colour slots, in the order `colors` overrides them. */
  defaultColors: string[];
  /** Height / width. */
  aspect: number;
  svg: (colors: string[]) => string;
};

const VIEW = 200;

function wrap(body: string, height = VIEW): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW}" height="${height}" viewBox="0 0 ${VIEW} ${height}">${body}</svg>`;
}

function petals(
  count: number,
  rx: number,
  ry: number,
  cy: number,
  fill: string,
): string {
  return Array.from({ length: count }, (_, i) => {
    const angle = (360 / count) * i;
    return `<ellipse cx="100" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" transform="rotate(${angle} 100 100)"/>`;
  }).join("");
}

export const BUILTIN_MOTIFS: Record<string, BuiltinMotif> = {
  flower: {
    description: "Five-petal flower (petals, centre)",
    defaultColors: ["#c8553d", "#f2d0a4"],
    aspect: 1,
    svg: ([petal, center]) =>
      wrap(
        `${petals(5, 28, 45, 55, petal!)}<circle cx="100" cy="100" r="22" fill="${center}"/>`,
      ),
  },
  daisy: {
    description: "Daisy with many thin petals (petals, centre)",
    defaultColors: ["#ffffff", "#f2b134"],
    aspect: 1,
    svg: ([petal, center]) =>
      wrap(
        `${petals(12, 12, 40, 50, petal!)}<circle cx="100" cy="100" r="24" fill="${center}"/>`,
      ),
  },
  bud: {
    description: "Closed flower bud on a short stem (bud, stem)",
    defaultColors: ["#d97a8c", "#5b7f5c"],
    aspect: 1.6,
    svg: ([bud, stem]) =>
      wrap(
        `<path d="M100 320 L100 150" stroke="${stem}" stroke-width="8" fill="none"/>` +
          `<path d="M100 250 C130 230 150 210 150 190 C125 195 108 215 100 240Z" fill="${stem}"/>` +
          `<path d="M100 20 C150 60 150 140 100 170 C50 140 50 60 100 20Z" fill="${bud}"/>`,
        320,
      ),
  },
  leaf: {
    description: "Single leaf with a midrib (leaf, vein)",
    defaultColors: ["#6b8f71", "#3d5a40"],
    aspect: 2,
    svg: ([leaf, vein]) =>
      wrap(
        `<path d="M100 10 C175 110 175 290 100 390 C25 290 25 110 100 10Z" fill="${leaf}"/>` +
          `<path d="M100 30 L100 375" stroke="${vein}" stroke-width="6"/>`,
        400,
      ),
  },
  sprig: {
    description: "Stem with alternating leaves (leaves, stem)",
    defaultColors: ["#7a9e7e", "#4f6d52"],
    aspect: 1.8,
    svg: ([leaf, stem]) => {
      const leaves = [70, 140, 210, 280]
        .map((y, i) => {
          const dir = i % 2 === 0 ? 1 : -1;
          const tip = 100 + dir * 85;
          return `<path d="M100 ${y} C${100 + dir * 30} ${y - 40} ${tip} ${y - 35} ${tip} ${y - 35} C${tip - dir * 10} ${y + 5} ${100 + dir * 30} ${y + 15} 100 ${y}Z" fill="${leaf}"/>`;
        })
        .join("");
      return wrap(
        `<path d="M100 355 L100 25" stroke="${stem}" stroke-width="7"/>${leaves}<ellipse cx="100" cy="25" rx="18" ry="26" fill="${leaf}"/>`,
        360,
      );
    },
  },
  dot: {
    description: "Solid dot (fill)",
    defaultColors: ["#f28f3b"],
    aspect: 1,
    svg: ([fill]) => wrap(`<circle cx="100" cy="100" r="92" fill="${fill}"/>`),
  },
  ring: {
    description: "Open ring (stroke)",
    defaultColors: ["#2a6f97"],
    aspect: 1,
    svg: ([stroke]) =>
      wrap(
        `<circle cx="100" cy="100" r="78" fill="none" stroke="${stroke}" stroke-width="24"/>`,
      ),
  },
  star: {
    description: "Five-point star (fill)",
    defaultColors: ["#e9c46a"],
    aspect: 1,
    svg: ([fill]) =>
      wrap(
        `<polygon points="100,8 127,72 196,76 143,121 160,190 100,152 40,190 57,121 4,76 73,72" fill="${fill}"/>`,
      ),
  },
  diamond: {
    description: "Geometric diamond with inner diamond (outer, inner)",
    defaultColors: ["#264653", "#e9c46a"],
    aspect: 1,
    svg: ([outer, inner]) =>
      wrap(
        `<polygon points="100,4 196,100 100,196 4,100" fill="${outer}"/><polygon points="100,52 148,100 100,148 52,100" fill="${inner}"/>`,
      ),
  },
};

export function isBuiltinSource(source: string): boolean {
  return source.startsWith("builtin:");
}

export function getBuiltinMotif(source: string): BuiltinMotif {
  const name = source.slice("builtin:".length);
  const motif = BUILTIN_MOTIFS[name];
  if (!motif) {
    throw new Error(
      `Unknown built-in motif "${name}". Available: ${Object.keys(BUILTIN_MOTIFS).join(", ")}`,
    );
  }
  return motif;
}

export function renderBuiltinMotif(source: string, colors?: string[]): Buffer {
  const motif = getBuiltinMotif(source);
  const resolved = motif.defaultColors.map((c, i) => colors?.[i] ?? c);
  return Buffer.from(motif.svg(resolved));
}

/** One line per motif, for tool descriptions. */
export function describeBuiltinMotifs(): string {
  return Object.entries(BUILTIN_MOTIFS)
    .map(([name, m]) => `builtin:${name} — ${m.description}`)
    .join("; ");
}
