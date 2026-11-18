import {
  ColorToken,
  GeneratedPromptSections,
  SpatialMetrics,
} from '@/types/reference';

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function formatAspectRatio(w: number, h: number): string {
  const ratio = w / h;
  if (Math.abs(ratio - 16 / 9) < 0.06) return '16:9';
  if (Math.abs(ratio - 16 / 10) < 0.06) return '16:10';
  if (Math.abs(ratio - 4 / 3) < 0.06) return '4:3';
  if (Math.abs(ratio - 3 / 2) < 0.06) return '3:2';
  if (Math.abs(ratio - 1) < 0.05) return '1:1';
  if (h / w >= 1.8 && w >= 500) {
    return `1:${(h / w).toFixed(1)} Full-Page Scroll`;
  }
  if (ratio < 0.7 && w < 500) return '9:19.5 Mobile';
  const divisor = gcd(w, h);
  const rw = Math.round(w / divisor);
  const rh = Math.round(h / divisor);
  if (rw > 32 || rh > 32) {
    return `${ratio.toFixed(2)}:1`;
  }
  return `${rw}:${rh}`;
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return { r: 16, g: 16, b: 16 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function getLuminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function getSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  if (max === min) return 0;
  const l = (max + min) / 2;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

function colorDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
): number {
  return Math.sqrt(
    Math.pow(a.r - b.r, 2) + Math.pow(a.g - b.g, 2) + Math.pow(a.b - b.b, 2)
  );
}

function getHueDegrees(r: number, g: number, b: number): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === rn) {
    h = ((gn - bn) / d) % 6;
  } else if (max === gn) {
    h = (bn - rn) / d + 2;
  } else {
    h = (rn - gn) / d + 4;
  }
  const deg = Math.round(h * 60);
  return deg < 0 ? deg + 360 : deg;
}

function classifyGroundTone(
  hex: string,
  dominantLuminance: SpatialMetrics['dominantLuminance']
): string {
  const { r, g, b } = hexToRgb(hex);
  const sat = getSaturation(r, g, b);
  const hue = getHueDegrees(r, g, b);

  if (dominantLuminance === 'High-Contrast Split') {
    return 'High-Contrast Split';
  }

  if (dominantLuminance === 'Dark Ground') {
    if (sat > 0.18 && hue >= 195 && hue <= 255) return 'Midnight Navy';
    if (sat > 0.18 && hue >= 255 && hue <= 300) return 'Deep Indigo';
    if (sat > 0.14 && hue >= 15 && hue <= 50) return 'Warm Obsidian';
    if (getLuminance(r, g, b) < 0.08) return 'Obsidian Dark';
    return 'Carbon Slate';
  }

  // Light ground
  if (r > b + 8 && g > b + 4) return 'Warm Vellum';
  if (b > r + 6) return 'Cool Alabaster';
  if (getLuminance(r, g, b) > 0.96) return 'Crisp Daylight';
  return 'Editorial Ivory';
}

function classifyAccentTone(palette: ColorToken[]): string {
  let bestToken: ColorToken | null = null;
  let bestSat = -1;

  for (const token of palette.slice(1)) {
    const { r, g, b } = hexToRgb(token.hex);
    const sat = getSaturation(r, g, b);
    if (sat > bestSat) {
      bestSat = sat;
      bestToken = token;
    }
  }

  if (!bestToken || bestSat < 0.16) {
    return 'Monochrome';
  }

  const { r, g, b } = hexToRgb(bestToken.hex);
  const hue = getHueDegrees(r, g, b);

  if (hue >= 345 || hue < 16) return 'Crimson Signal';
  if (hue >= 16 && hue < 42) return 'Burnt Orange';
  if (hue >= 42 && hue < 68) return 'Amber Ochre';
  if (hue >= 68 && hue < 162) return 'Emerald Signal';
  if (hue >= 162 && hue < 202) return 'Hydrographic Teal';
  if (hue >= 202 && hue < 248) return 'Cobalt Blue';
  if (hue >= 248 && hue < 292) return 'Spectrum Indigo';
  return 'Rose Magenta';
}

function isGenericSourceHint(hint?: string): boolean {
  if (!hint) return true;
  const cleaned = hint.trim();
  if (cleaned.length < 3) return true;
  if (/^(clipboard|image|img|screenshot|screen[_ -]?shot|capture|captured|paste|pasted|untitled|frame|photo|download|file|clean[_ -]?shot|scrnli|monosnap|snip|specimen|uploaded|linked)/i.test(cleaned)) {
    return true;
  }
  if (/^\d+([_ -]\d+)*$/.test(cleaned)) {
    return true;
  }
  return false;
}

export function synthesizeSpecimenTitle(
  metrics: SpatialMetrics,
  palette: ColorToken[],
  sourceHint?: string
): string {
  const groundHex = palette[0]?.hex || '#12151A';
  const groundTone = classifyGroundTone(groundHex, metrics.dominantLuminance);
  const accentTone = classifyAccentTone(palette);

  const isTallScroll = metrics.height / metrics.width >= 1.8 && metrics.width >= 500;
  const sectionMatch = metrics.gridColumns.match(/(\d+)-Section/i);
  const sectionPrefix = sectionMatch ? `${sectionMatch[1]}-Section ` : '';

  let archetype = 'Modular Interface';
  if (metrics.width < 500) {
    archetype = 'Mobile Viewport Interface';
  } else if (isTallScroll) {
    archetype = `${sectionPrefix}Editorial Landing Page`;
  } else if (
    metrics.gridColumns.includes('Left Navigation Rail') &&
    metrics.gridColumns.includes('Top Command Bar')
  ) {
    archetype = 'Command & Split Inspector Workbench';
  } else if (metrics.gridColumns.includes('Left Sidebar Rail')) {
    archetype = 'Sidebar Application Workspace';
  } else if (metrics.gridColumns.includes('Top Navigation Masthead')) {
    archetype = 'Masthead & Multi-Column Dashboard';
  } else {
    archetype = '12-Column Responsive Web Interface';
  }

  if (sourceHint && !isGenericSourceHint(sourceHint)) {
    const cleanHint = sourceHint.trim();
    if (cleanHint.length <= 36 && !cleanHint.includes('—')) {
      return `${cleanHint} — ${groundTone} ${archetype}`;
    }
    return cleanHint;
  }

  return `${groundTone} & ${accentTone} — ${archetype}`;
}

export async function analyzeImageOnCanvas(
  imageDataUrl: string,
  sourceHint?: string
): Promise<{
  metrics: SpatialMetrics;
  palette: ColorToken[];
  suggestedTags: string[];
  suggestedTitle: string;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const width = img.naturalWidth || 1280;
      const height = img.naturalHeight || 800;
      const isTallScroll = height / width >= 1.8 && width >= 500;
      const sampleW = 180;
      const sampleH = isTallScroll ? 280 : 120;
      const canvas = document.createElement('canvas');
      canvas.width = sampleW;
      canvas.height = sampleH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, sampleW, sampleH);
      const data = ctx.getImageData(0, 0, sampleW, sampleH).data;

      const buckets = new Map<
        string,
        { r: number; g: number; b: number; count: number }
      >();
      let totalLum = 0;
      let darkCount = 0;
      let lightCount = 0;

      let leftRailDiff = 0;
      let topBarDiff = 0;
      const rowLuminance: number[] = new Array(sampleH).fill(0);

      for (let y = 0; y < sampleH; y++) {
        let rowLumSum = 0;
        for (let x = 0; x < sampleW; x++) {
          const idx = (y * sampleW + x) * 4;
          const a = data[idx + 3];
          if (a < 128) continue;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          const lum = getLuminance(r, g, b);
          totalLum += lum;
          rowLumSum += lum;
          if (lum < 0.32) darkCount++;
          else if (lum > 0.68) lightCount++;

          const qr = Math.round(r / 16) * 16;
          const qg = Math.round(g / 16) * 16;
          const qb = Math.round(b / 16) * 16;
          const key = `${qr},${qg},${qb}`;
          const prev = buckets.get(key);
          if (prev) {
            prev.count++;
          } else {
            buckets.set(key, { r: qr, g: qg, b: qb, count: 1 });
          }

          if (x === 32 && x + 2 < sampleW) {
            const nextIdx = (y * sampleW + (x + 2)) * 4;
            leftRailDiff += Math.abs(r - data[nextIdx]) + Math.abs(g - data[nextIdx + 1]);
          }
          if (y === 9 && y + 2 < sampleH) {
            const belowIdx = ((y + 2) * sampleW + x) * 4;
            topBarDiff += Math.abs(r - data[belowIdx]) + Math.abs(g - data[belowIdx + 1]);
          }
        }
        rowLuminance[y] = rowLumSum / sampleW;
      }

      // Count distinct horizontal bands/sections across the vertical axis
      let horizontalBandTransitions = 1;
      for (let y = 6; y < sampleH - 6; y += 6) {
        if (Math.abs(rowLuminance[y] - rowLuminance[y - 6]) > 0.08) {
          horizontalBandTransitions++;
        }
      }
      const estimatedSections = Math.max(
        3,
        Math.min(10, Math.round(horizontalBandTransitions * 0.75))
      );

      const totalPixels = sampleW * sampleH;
      const avgLum = totalLum / totalPixels;

      const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
      const distinct: { r: number; g: number; b: number; count: number }[] = [];

      for (const item of sorted) {
        if (distinct.length >= 6) break;
        const tooClose = distinct.some((d) => colorDistance(d, item) < 38);
        if (!tooClose) {
          distinct.push(item);
        }
      }

      // Ensure high-contrast foreground ink is captured even if thin text occupies <2% of pixels
      const groundLum = distinct[0]
        ? getLuminance(distinct[0].r, distinct[0].g, distinct[0].b)
        : avgLum;

      const hasHighContrastInk = distinct.some(
        (d) => Math.abs(getLuminance(d.r, d.g, d.b) - groundLum) > 0.55
      );
      if (!hasHighContrastInk) {
        const highContrastCandidate = sorted.find(
          (item) =>
            Math.abs(getLuminance(item.r, item.g, item.b) - groundLum) > 0.55 &&
            distinct.every((d) => colorDistance(d, item) >= 32)
        );
        if (highContrastCandidate && distinct.length >= 3) {
          distinct[2] = highContrastCandidate;
        }
      }

      // Ensure vivid interactive accent is captured even if CTA buttons occupy <2% of pixels
      const hasAccent = distinct.some((d) => getSaturation(d.r, d.g, d.b) > 0.38);
      if (!hasAccent) {
        const vivid = sorted.find(
          (item) =>
            getSaturation(item.r, item.g, item.b) > 0.38 &&
            distinct.every((d) => colorDistance(d, item) >= 32)
        );
        if (vivid && distinct.length > 0) {
          if (distinct.length < 6) {
            distinct.push(vivid);
          } else {
            distinct[distinct.length - 1] = vivid;
          }
        }
      }

      const distinctTotal =
        distinct.reduce((acc, item) => acc + item.count, 0) || 1;

      const palette: ColorToken[] = distinct.slice(0, 6).map((item, idx) => {
        const sat = getSaturation(item.r, item.g, item.b);
        const lum = getLuminance(item.r, item.g, item.b);
        const contrastDelta = Math.abs(lum - groundLum);

        let role = 'Supporting Surface Token';
        if (idx === 0) {
          role = lum < 0.3 ? 'Primary Dark Canvas Ground' : 'Primary Light Canvas Ground';
        } else if (sat > 0.38) {
          role = 'Primary Interactive CTA Accent';
        } else if (contrastDelta > 0.52) {
          role = 'Primary Display & Headline Ink';
        } else if (contrastDelta > 0.28) {
          role = 'Secondary Body & Muted Copy Ink';
        } else if (idx === 1) {
          role = 'Elevated Card & Section Surface';
        } else {
          role = 'Structural Hairline & Grid Border';
        }

        const pct = Math.max(
          2,
          Math.round((item.count / distinctTotal) * 100)
        );
        return {
          hex: rgbToHex(item.r, item.g, item.b),
          role,
          ratio: `${pct}%`,
        };
      });

      const hasLeftRail = !isTallScroll && leftRailDiff / sampleH > 20;
      const hasTopHeader = topBarDiff / sampleW > 14;

      let gridColumns = '12-Column Responsive Container Grid';
      if (width < 500) {
        gridColumns = 'Single-Column Mobile Viewport Stack';
      } else if (isTallScroll) {
        gridColumns = `12-Column Editorial Grid · ${estimatedSections}-Section Full-Page Vertical Scroll`;
      } else if (hasLeftRail && hasTopHeader) {
        gridColumns = '240px Left Navigation Rail + Top Command Bar + Split Workspace';
      } else if (hasLeftRail) {
        gridColumns = 'Fixed Left Sidebar Rail + Multi-Column Main Canvas';
      } else if (hasTopHeader) {
        gridColumns = 'Top Navigation Masthead + Multi-Column Content Grid';
      }

      let dominantLuminance: SpatialMetrics['dominantLuminance'] = 'Light Ground';
      if (avgLum < 0.38) {
        dominantLuminance = 'Dark Ground';
      } else if (darkCount > totalPixels * 0.25 && lightCount > totalPixels * 0.25) {
        dominantLuminance = 'High-Contrast Split';
      }

      const suggestedTags: string[] = [
        dominantLuminance === 'Dark Ground' ? 'Dark UI' : 'Light UI',
      ];
      if (isTallScroll) {
        suggestedTags.push('Full-Page Landing', `${estimatedSections}-Section Scroll`, 'Editorial Grid');
      } else if (width < 500) {
        suggestedTags.push('Mobile Screen');
      } else {
        suggestedTags.push('Desktop Web');
        if (hasLeftRail) suggestedTags.push('Sidebar Shell');
        if (hasTopHeader) suggestedTags.push('Command Header');
      }

      const computedMetrics: SpatialMetrics = {
        width,
        height,
        aspectRatio: formatAspectRatio(width, height),
        gridColumns,
        densityProfile: isTallScroll
          ? `Multi-Section Editorial Rhythm (${estimatedSections} Vertical Bands · 80px–120px Section Padding)`
          : distinct.length >= 4
          ? 'Structured Operational (8px Spatial Rhythm · 24px–32px Card Gutters)'
          : 'Minimal Editorial (Generous Negative Space)',
        dominantLuminance,
      };

      const suggestedTitle = synthesizeSpecimenTitle(
        computedMetrics,
        palette,
        sourceHint
      );

      resolve({
        metrics: computedMetrics,
        palette,
        suggestedTags,
        suggestedTitle,
      });
    };
    img.onerror = () => reject(new Error('Could not decode image data for analysis'));
    img.src = imageDataUrl;
  });
}

function resolveSemanticTokens(
  palette: ColorToken[],
  dominantLuminance: SpatialMetrics['dominantLuminance']
) {
  const isDark = dominantLuminance === 'Dark Ground';
  const groundToken = palette[0] || {
    hex: isDark ? '#0F0F12' : '#F7F8FA',
    role: 'Primary Canvas Ground',
    ratio: '60%',
  };
  const groundRgb = hexToRgb(groundToken.hex);
  const groundLum = getLuminance(groundRgb.r, groundRgb.g, groundRgb.b);

  // Find accent token (highest saturation)
  let accentToken = palette.find((t) => t.role.toLowerCase().includes('accent'));
  if (!accentToken) {
    let bestSat = -1;
    for (const t of palette.slice(1)) {
      const rgb = hexToRgb(t.hex);
      const sat = getSaturation(rgb.r, rgb.g, rgb.b);
      if (sat > bestSat) {
        bestSat = sat;
        accentToken = t;
      }
    }
  }
  const accentHex = accentToken?.hex || (isDark ? '#F08020' : '#635BFF');

  // Find primary high-contrast ink token
  let inkToken = palette.find(
    (t) =>
      t.hex !== accentHex &&
      (t.role.toLowerCase().includes('headline') ||
        t.role.toLowerCase().includes('specification ink'))
  );
  if (!inkToken) {
    let bestContrast = -1;
    for (const t of palette.slice(1)) {
      if (t.hex === accentHex) continue;
      const rgb = hexToRgb(t.hex);
      const contrast = Math.abs(getLuminance(rgb.r, rgb.g, rgb.b) - groundLum);
      if (contrast > bestContrast) {
        bestContrast = contrast;
        inkToken = t;
      }
    }
  }
  const inkRgb = inkToken ? hexToRgb(inkToken.hex) : null;
  const inkContrast = inkRgb
    ? Math.abs(getLuminance(inkRgb.r, inkRgb.g, inkRgb.b) - groundLum)
    : 0;
  const inkHex =
    inkContrast >= 0.45
      ? inkToken!.hex
      : isDark
      ? '#F4F4F6'
      : '#12161F';

  // Find secondary muted copy ink
  const mutedCandidate = palette.find(
    (t) =>
      t.hex !== groundToken.hex &&
      t.hex !== accentHex &&
      t.hex !== inkHex &&
      Math.abs(
        getLuminance(hexToRgb(t.hex).r, hexToRgb(t.hex).g, hexToRgb(t.hex).b) - groundLum
      ) > 0.22
  );
  const mutedInkHex = mutedCandidate?.hex || (isDark ? '#9A9AA2' : '#525866');

  // Find elevated surface token (close to ground luminance)
  const surfaceCandidate = palette.find(
    (t) =>
      t.hex !== groundToken.hex &&
      t.hex !== accentHex &&
      t.hex !== inkHex &&
      Math.abs(
        getLuminance(hexToRgb(t.hex).r, hexToRgb(t.hex).g, hexToRgb(t.hex).b) - groundLum
      ) <= 0.22
  );
  const surfaceHex = surfaceCandidate?.hex || (isDark ? '#1A1B1E' : '#FFFFFF');

  // Find hairline border token
  const borderCandidate = palette.find(
    (t) =>
      t.hex !== groundToken.hex &&
      t.hex !== surfaceHex &&
      t.hex !== accentHex &&
      t.hex !== inkHex
  );
  const borderHex = borderCandidate?.hex || (isDark ? '#2A2B30' : '#E2E6EE');

  return {
    groundHex: groundToken.hex,
    groundRatio: groundToken.ratio,
    surfaceHex,
    inkHex,
    mutedInkHex,
    accentHex,
    borderHex,
    isDark,
  };
}

export function buildLocalStructuredPrompts(
  title: string,
  metrics: SpatialMetrics,
  palette: ColorToken[]
): GeneratedPromptSections {
  const {
    groundHex,
    groundRatio,
    surfaceHex,
    inkHex,
    mutedInkHex,
    accentHex,
    borderHex,
    isDark,
  } = resolveSemanticTokens(palette, metrics.dominantLuminance);

  const isTallScroll = metrics.height / metrics.width >= 1.8 && metrics.width >= 500;

  const sectionWalkthrough = isTallScroll
    ? `1. **Top Navigation & Hero Showcase (Y: 0%–16%)**:
   - Sticky horizontal navigation bar (\`height: 72px\`, \`padding: 0 56px\`) with left brand mark, centered horizontal navigation links (\`14px\`, ${mutedInkHex} with active link highlighted in ${accentHex}), and right-aligned pill CTA button (\`background: ${accentHex}\`, \`border-radius: 999px\`, \`padding: 10px 22px\`).
   - Full-width split hero banner featuring a left editorial headline stack (\`clamp(2.25rem, 4vw, 3.5rem)\`, \`line-height: 1.12\`, \`color: ${inkHex}\`), supporting lead paragraph (\`15px\`, \`max-width: 46ch\`, \`color: ${mutedInkHex}\`), primary ${accentHex} CTA button, and a right-aligned high-contrast hero subject cutout overlapping the subtle background vertical grid hairlines.
2. **Asymmetric Split Introduction / About Block (Y: 16%–32%)**:
   - Centered or offset section header pairing an inline parenthetical micro-kicker (e.g., \`(About Us)\` in \`12px\` ${mutedInkHex}) indented ahead of a multi-line display statement (\`28px–34px\`, ${inkHex}).
   - Two-column asymmetric grid (\`7fr 5fr\`, \`gap: 48px\`) with a large framed feature photograph on the left (\`border-radius: 4px\`, \`overflow: hidden\`) and an editorial copy stack + ${accentHex} CTA button + secondary offset thumbnail on the right.
3. **Full-Bleed Atmospheric Overlay & Glassmorphic Card Strip (Y: 32%–46%)**:
   - Darkened atmospheric background banner with centered inline-kicker display heading and a 3-column horizontal strip of translucent glassmorphic cards (\`background: rgba(255, 255, 255, 0.04)\`, \`backdrop-filter: blur(12px)\`, \`border: 1px solid ${borderHex}\`, \`min-height: 220px\`, \`padding: 24px\`) plus a 4th column of narrative supporting copy.
4. **Numbered Service / Feature Index Row (Y: 46%–62%)**:
   - Section headline above a 4-column horizontal card grid (\`grid-template-columns: repeat(4, minmax(220px, 1fr))\`, \`gap: 24px\`).
   - Each column is anchored by an oversized tabular numeral (\`01\`, \`02\`, \`03\`, \`04\` in \`44px\` light sans, ${inkHex}), bold card title (\`16px\`), concise 3-line description (\`13px\`, ${mutedInkHex}), interactive \`Learn More ↗\` link, and a bottom rectangular preview thumbnail (\`aspect-ratio: 16 / 10\`, \`border-radius: 8px\`).
5. **Secondary Split Value Proposition Block (Y: 62%–74%)**:
   - Balanced 2-column split (\`1fr 1fr\`, \`gap: 56px\`, \`align-items: center\`) pairing a tall architectural/product showcase image on the left with a parenthetical kicker, display heading, two-paragraph value narrative, and primary ${accentHex} CTA button on the right.
6. **Staggered 3-Column Portfolio / Case Study Grid (Y: 74%–86%)**:
   - Section header followed by a 3-column gallery grid (\`grid-template-columns: repeat(3, 1fr)\`, \`gap: 28px\`) where the middle column is vertically offset (\`margin-top: 40px\`) for editorial rhythm. Each item pairs a vertical portrait image (\`aspect-ratio: 4 / 5\`, \`border-radius: 6px\`) with a bold title and 2-line caption below.
7. **Elevated Conversion CTA Banner & Multi-Column Footer (Y: 86%–100%)**:
   - Contained CTA card (\`background: ${surfaceHex}\`, \`border: 1px solid ${borderHex}\`, \`border-radius: 12px\`, \`padding: 48px\`) with left-aligned conversion copy + ${accentHex} button and right-aligned overlapping visual cutout.
   - 4-column footer (Brand & Social Icons, Quick Links, Services, Contact + Pill Newsletter Input with embedded ${accentHex} \`Subscribe Now ↗\` button) culminating in an oversized, full-bleed clipped display wordmark across the bottom edge.`
    : `1. **Top Command & Navigation Header**:
   - Full-width horizontal header bar (\`height: 60px–68px\`, \`background: ${surfaceHex}\`, \`border-bottom: 1px solid ${borderHex}\`, \`padding: 0 32px\`) housing primary brand/breadcrumb identity on the left, global context switches in the center, and a high-contrast primary action button (\`background: ${accentHex}\`, \`color: #FFFFFF\`, \`border-radius: 8px\`) on the right.
2. **Primary Structural Workspace (${metrics.gridColumns})**:
   - Anchored on a ${groundHex} canvas ground with subtle \`1px solid ${borderHex}\` structural dividers and an 8px spatial spacing scale.
   - Left/Upper primary content zone featuring elevated ${surfaceHex} cards (\`border: 1px solid ${borderHex}\`, \`border-radius: 8px–10px\`, \`padding: 24px\`) with bold ${inkHex} headers, ${mutedInkHex} specification metadata, and semantic status badges.
3. **Secondary Inspector / Analytical Detail Zone**:
   - Synchronized detail panels and data tables using \`font-variant-numeric: tabular-nums\` for all coordinates, metrics, timestamps, and percentage deltas.`;

  const masterPrompt = `Build a production-grade "${title}" interface matching a ${metrics.width}×${metrics.height} (${metrics.aspectRatio}) capture with ${metrics.dominantLuminance.toLowerCase()} polarity.

### 1. Executive Summary & Aesthetic Direction
- **Screen Archetype**: ${isTallScroll ? 'Multi-section editorial landing page & visual showcase' : 'High-precision operational web interface'}
- **Luminance & Atmosphere**: ${metrics.dominantLuminance} architecture anchored on ${groundHex} (${groundRatio} canvas coverage) with elevated ${surfaceHex} containers, subtle \`1px solid ${borderHex}\` structural hairlines, crisp ${inkHex} display typography, and high-saturation ${accentHex} interactive calls-to-action.
- **Visual Discipline**: Combine generous negative space with exposed structural column rules, sharp typographic hierarchy, and zero unmotivated decorative clutter.

### 2. Spatial Grid & Viewport Topology
- **Measured Frame**: \`${metrics.width}px × ${metrics.height}px\` (${metrics.aspectRatio})
- **Grid Architecture**: ${metrics.gridColumns}
- **Container & Gutters**: \`max-width: 1280px\` centered container with \`48px–56px\` outer horizontal padding, \`24px–32px\` column gutters, and subtle full-height vertical grid guide hairlines (\`1px solid rgba(255, 255, 255, 0.05)\` on dark ground / \`rgba(0, 0, 0, 0.06)\` on light ground).
- **Density & Vertical Rhythm**: ${metrics.densityProfile}.

### 3. Surface & Chromatic Token System
- **Primary Canvas Ground**: \`${groundHex}\` (main viewport background and negative space)
- **Elevated Surface / Card Plane**: \`${surfaceHex}\` (contained cards, banners, and structural modules)
- **Glassmorphic / Translucent Overlay**: \`${isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.82)'}\` with \`backdrop-filter: blur(12px)\` and \`1px solid ${borderHex}\`
- **Primary Display & Headline Ink**: \`${inkHex}\` (H1/H2 display titles, numeric counters, active labels)
- **Secondary Body & Muted Ink**: \`${mutedInkHex}\` (body paragraphs, section kickers, navigation links, captions)
- **Primary Interactive CTA Accent**: \`${accentHex}\` (pill CTA buttons, active navigation indicators, focus rings)
- **Structural Hairline & Grid Border**: \`${borderHex}\` (card borders, section dividers, input outlines)

### 4. Typography & Scannable Hierarchy
- **Hero & Display Headlines (H1/H2)**: Geometric/Neo-grotesque sans-serif, \`32px–48px\` (\`clamp(2rem, 3.6vw, 3rem)\`), weight \`500–600\`, tight tracking (\`-0.025em\`), line-height \`1.15\`, set in \`${inkHex}\`.
- **Inline Section Kickers**: Parenthetical or uppercase micro-labels (\`12px–13px\`, \`${mutedInkHex}\`) positioned inline or indented ahead of the first line of section headings (\`text-indent: 9rem\` on desktop).
- **Card Titles & Index Numerals**: Oversized tabular index counters (\`36px–44px\`, weight \`400\`, \`font-variant-numeric: tabular-nums\`) paired with \`16px–18px\` weight \`600\` subheadings in \`${inkHex}\`.
- **Body Copy & Captions**: \`14px–15px\` regular weight (\`400\`), line-height \`1.65\`, comfortable \`55ch–65ch\` measure in \`${mutedInkHex}\`.

### 5. Section-by-Section & Component Anatomy (Top to Bottom)
${sectionWalkthrough}

### 6. Implementation & CSS Architecture Guardrails
- Use semantic HTML5 landmarks (\`<header>\`, \`<main>\`, \`<section>\`, \`<article>\`, \`<footer>\`) and CSS custom properties for all colors, spacing, and radii.
- Enforce \`font-variant-numeric: tabular-nums\` on all numbered lists, metrics, and counters.
- Lock media containers with explicit \`aspect-ratio\` and \`object-fit: cover\` so layout geometry never shifts during image loading.`;

  const layoutAnatomy = `• Viewport & Capture Profile: ${metrics.width}×${metrics.height}px (${metrics.aspectRatio}) — ${isTallScroll ? 'Full-page vertical scrolling layout' : 'Single-viewport application frame'}
• Global Structural Grid: ${metrics.gridColumns} (1280px max-width container, 48px–56px horizontal padding, 24px–32px grid gaps)
• Background Grid Guides: Full-height 4-column or 12-column subtle vertical hairline rules (${borderHex} at 35% opacity) anchoring section alignments
• Density & Vertical Rhythm: ${metrics.densityProfile}
• Luminance Polarity: ${metrics.dominantLuminance} (${groundHex} base canvas with ${surfaceHex} elevated surfaces and translucent glass cards)
• Card & Media Geometry: 6px–12px border-radius on cards and architectural thumbnails, 999px pill radius on primary ${accentHex} CTA buttons and newsletter inputs`;

  const typographyAndHierarchy = `• Hero & Section Display Headings: 32px–48px (clamp(2rem, 3.6vw, 3rem)), weight 500–600, line-height 1.15, letter-spacing -0.025em in ${inkHex}
• Inline Parenthetical Kickers: 12px–13px muted labels (${mutedInkHex}) aligned with or indented ahead of multi-line section headings
• Editorial Index Numerals: 36px–44px tabular-nums counters (01, 02, 03, 04) in ${inkHex} with 16px bold card titles below
• Body & Specification Copy: 14px–15px (line-height 1.65, 60ch max measure) in ${mutedInkHex} with ≥4.5:1 AA contrast against ${groundHex}
• Interactive Links & Buttons: 13px–14px weight 500 button labels and directional action links ('Learn More ↗') with crisp icon alignment`;

  const colorTokensCss = `:root {
  /* Canvas & Surface Planes */
  --surface-ground: ${groundHex}; /* Primary Canvas Ground (${groundRatio}) */
  --surface-elevated: ${surfaceHex}; /* Elevated Card & Module Surface */
  --surface-glass: ${isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.82)'}; /* Translucent Overlay Card */

  /* Typography & Ink Hierarchy */
  --ink-primary: ${inkHex}; /* Display Headlines & Primary Numerals */
  --ink-secondary: ${mutedInkHex}; /* Body Copy, Kickers & Navigation Links */
  --ink-on-accent: #FFFFFF; /* High-Contrast CTA Button Label */

  /* Interactive Accents & Signals */
  --accent-primary: ${accentHex}; /* Primary CTA Button & Active Indicator */
  --accent-hover: ${accentHex}E6; /* Hover State Fill (90% Opacity / Brightened) */

  /* Structural Borders & Grid Hairlines */
  --border-hairline: ${borderHex}; /* 1px Card & Section Divider Rule */
  --border-grid-guide: ${isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}; /* Vertical Column Guide Line */

  /* Layout & Radius Tokens */
  --radius-pill: 9999px;
  --radius-card: 10px;
  --radius-media: 6px;
  --container-max: 1280px;
}`;

  const interactionAndStates = `• Primary Pill CTA Buttons: Solid ${accentHex} background, #FFFFFF 13px medium label, 9999px pill radius, 10px 22px padding; hover applies subtle upward translateY(-1px) and warm glow shadow
• Directional Action Links ('Learn More ↗'): ${inkHex} text with 45-degree diagonal arrow icon that translates 2px up-right on hover
• Card & Thumbnail Hover States: Media frames use overflow: hidden with smooth 300ms transform: scale(1.03) on image hover and border color transition from ${borderHex} to ${accentHex}
• Glassmorphic Overlay Cards: backdrop-filter: blur(12px) with 1px solid ${borderHex} border, brightening surface alpha from 0.04 to 0.08 on hover
• Keyboard & Focus Accessibility: 2px solid ${accentHex} :focus-visible outline with 2px offset across all interactive buttons, links, and form inputs
• Responsive Breakpoint Collapse: 12-column desktop grid collapses to 2-column tablet grid (<1024px) and single-column vertical flow (<640px) with 24px horizontal padding`;

  return {
    masterPrompt,
    layoutAnatomy,
    typographyAndHierarchy,
    colorTokensCss,
    interactionAndStates,
  };
}
