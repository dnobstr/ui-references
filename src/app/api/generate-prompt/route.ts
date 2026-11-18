import { NextRequest, NextResponse } from 'next/server';
import { ColorToken, GeneratedPromptSections, SpatialMetrics } from '@/types/reference';
import { synthesizeSpecimenTitle } from '@/lib/vision-analyzer';

const SYSTEM_INSTRUCTION = `You are a Principal Design Systems Architect and Staff Frontend UI Dissector.
Analyze the provided UI screenshot alongside its measured spatial metrics and pixel color palette.
Your goal is to produce an exhaustive, blueprint-grade UI replication specification so that an AI coding assistant or frontend engineer can reconstruct the interface 1:1 with zero guesswork.

Return ONLY a valid JSON object with the exact following keys (all values strings, plus a tags string array):
{
  "title": "Concise, specific descriptive title of the UI screen (e.g. 'Prime Realty Estate Luxury Property Landing Page' or 'Stripe Metered Usage & Billing Ledger')",
  "masterPrompt": "An exhaustive, multi-section UI replication prompt (500–900+ words) formatted with clear Markdown headings:\n### 1. Executive Summary & Aesthetic Direction\nSpecify screen archetype, product domain, visual persona, viewport dimensions & aspect ratio, luminance polarity, surface depth strategy, and atmospheric treatments (lighting, subtle background grid hairlines, photography grading).\n### 2. Spatial Grid & Viewport Topology\nSpecify max-width container, column grid system (e.g., 12-column CSS Grid with vertical guide hairlines or fixed-rail application split), outer horizontal padding, inter-column gap rhythm, and vertical section spacing.\n### 3. Surface & Chromatic Token System\nDocument every surface plane and ink tier with exact hex codes: primary canvas ground, secondary/elevated cards, glassmorphic/translucent overlays (with backdrop-filter blur and alpha values), border hairlines, primary headline ink, secondary body copy ink, muted metadata ink, and primary/secondary interactive accent colors.\n### 4. Typography & Scannable Hierarchy\nDefine font family pairings (--font-display, --font-sans, --font-mono), exact px/rem sizes, font weights, line-heights, letter-spacing, inline section kicker patterns (such as parenthetical labels like '(About Us)' indented inline with large display headings), and numeric discipline (tabular-nums, oversized index numerals 01–04).\n### 5. Section-by-Section & Component Anatomy (Top to Bottom)\nWalk through EVERY visible horizontal band, navigation bar, hero banner, split content block, card grid, data visualization, sidebar, inspector, CTA banner, and footer in strict top-to-bottom sequence. For every section, detail: exact layout mode (Grid/Flex), column proportions, card dimensions & border-radius, internal padding, exact visible headings/copy/button labels, badge/icon treatments, and image aspect ratios or cutout overlaps.\n### 6. Implementation & CSS Architecture Guardrails\nProvide concrete CSS Grid/Flexbox implementation rules, semantic HTML structure, aspect-ratio locking, and responsive collapse behavior.",
  "layoutAnatomy": "Detailed bulleted specification (8–12 bullets) covering:\n• Viewport & Capture Profile (dimensions, aspect ratio, single viewport vs. full-page vertical scroll vs. app workbench)\n• Global Structural Grid (column count, container width, outer margins, column gap, background vertical grid hairlines)\n• Sequential Top-to-Bottom Section Breakdown (every horizontal band/region with relative height, padding-block, and column split ratios)\n• Card, Media & Container Geometry (exact border-radius values, 1px border treatments, overlapping architectural cutouts, staggered masonry offsets)",
  "typographyAndHierarchy": "Detailed bulleted specification (6–10 bullets) covering:\n• Display & Hero Headlines (font family archetype, px/rem size, weight, line-height, tracking, color hex, max-width measure)\n• Section Headers & Inline Kickers (size, weight, how parenthetical or uppercase micro-labels align or indent into multi-line H2 headlines)\n• Index Numerals, KPIs & Tabular Readouts (oversized 01–04 section counters, metric numerals, font-variant-numeric: tabular-nums)\n• Body Copy, Card Subtitles & Navigation Links (px size, line-height, readable measure, secondary/muted ink hex codes and contrast ratios)\n• Footer & Display Wordmarks (oversized full-width clipped brand wordmarks, form labels, legal micro-copy)",
  "colorTokensCss": "Complete, well-commented :root { ... } CSS block organized into logical groups (/* Canvas & Surface Planes */, /* Glass & Translucent Overlays */, /* Typography & Ink Hierarchy */, /* Interactive Accents & Signals */, /* Structural Borders & Grid Hairlines */, /* Spacing & Radius Tokens */) with exact hex/rgba values and usage notes.",
  "interactionAndStates": "Detailed bulleted specification (6–8 bullets) covering:\n• Primary & Secondary CTA Buttons (exact background hex, pill/rounded border-radius, padding, hover brightness/elevation shift, active press, :focus-visible outline)\n• Navigation & Wayfinding States (active link indicator icon/color, sticky header backdrop blur, directional arrow link 'Learn More ↗' hover translation)\n• Card & Media Hover Micro-Interactions (subtle image scale(1.03) zoom within overflow-hidden frames, border highlight transitions, glass card hover states)\n• Form Controls & Responsive Breakpoints (composite pill input with embedded submit button, desktop 12-col -> tablet 2-col -> mobile single-column stack rules)",
  "tags": ["Tag 1", "Tag 2", "Tag 3", "Tag 4", "Tag 5"]
}`;

function normalizeGeminiModelName(raw: string): string {
  const cleaned = raw.trim().replace(/^models\//i, '');
  if (!cleaned) return 'gemini-3.8-flash';
  const lower = cleaned.toLowerCase();
  if (
    lower === 'gemini-2.5-flash' ||
    lower.startsWith('gemini-2.5-flash-') ||
    lower.startsWith('gemini-2.0-flash') ||
    lower.startsWith('gemini-1.5-flash') ||
    lower.startsWith('gemini-1.5-pro')
  ) {
    return 'gemini-3.8-flash';
  }
  return cleaned;
}

function parseBase64DataUrl(dataUrl: string): { mimeType: string; base64Data: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64Data: match[2] };
}

function extractJsonBlock(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  }
  return JSON.parse(candidate);
}

async function callGeminiGenerateContent(
  modelId: string,
  apiKey: string,
  mimeType: string,
  base64Data: string,
  telemetryContext: string
) {
  const cleanModel = modelId.replace(/^models\//i, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            { text: telemetryContext },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        maxOutputTokens: 8192,
      },
    }),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      provider = 'gemini',
      apiKey = '',
      model = '',
      imageDataUrl = '',
      title = 'Captured UI Specimen',
      metrics,
      palette,
    }: {
      provider: 'gemini' | 'openai' | 'anthropic';
      apiKey: string;
      model: string;
      imageDataUrl: string;
      title: string;
      metrics: SpatialMetrics;
      palette: ColorToken[];
    } = body;

    const parsedImage = parseBase64DataUrl(imageDataUrl);
    if (!parsedImage) {
      return NextResponse.json(
        { error: 'Screenshot must be a valid base64 data URL for vision model ingestion.' },
        { status: 400 }
      );
    }

    const isTallScroll =
      metrics?.height && metrics?.width && metrics.height / metrics.width >= 1.8;

    const fallbackTitle = metrics
      ? synthesizeSpecimenTitle(metrics, palette || [], title)
      : title || 'Captured UI Specimen';

    const telemetryContext = `Dissect this UI screenshot with extreme architectural precision and produce a comprehensive, section-by-section replication dossier.
Always generate a specific, descriptive "title" in the returned JSON based on the visible brand/header text, product domain, and UI layout archetype in the screenshot (e.g., "Prime Realty Estate — Dark Luxury Property Landing Page" or "Linear Triage — Carbon Slate Issue Workbench").
Measured Viewport: ${metrics?.width || 1280}×${metrics?.height || 800} (${metrics?.aspectRatio || '16:10'})
Capture Format: ${isTallScroll ? 'Full-Page Vertical Scrolling Capture (dissect EVERY horizontal section from top navbar and hero down to the footer in sequential order)' : 'Single Viewport Capture (dissect all primary regions, rails, headers, cards, and interactive controls)'}
Grid Hypothesis: ${metrics?.gridColumns || '12-Column Grid'}
Density Profile: ${metrics?.densityProfile || 'Structured Operational'}
Dominant Polarity: ${metrics?.dominantLuminance || 'Light Ground'}
Quantized Pixel Palette: ${(palette || []).map((p) => `${p.hex} (${p.role}, ${p.ratio})`).join(', ')}`;

    if (provider === 'gemini') {
      const resolvedKey = apiKey.trim() || process.env.GEMINI_API_KEY || '';
      if (!resolvedKey) {
        return NextResponse.json(
          { error: 'Enter a Google Gemini API key in the Provider Configuration drawer (or switch to Local Vision Dissector for instant offline analysis).' },
          { status: 401 }
        );
      }

      const geminiModel = normalizeGeminiModelName(model);
      let res = await callGeminiGenerateContent(
        geminiModel,
        resolvedKey,
        parsedImage.mimeType,
        parsedImage.base64Data,
        telemetryContext
      );

      let data = await res.json();

      // If a legacy or unavailable model was still requested, automatically retry with gemini-3.8-flash
      if (!res.ok && geminiModel !== 'gemini-3.8-flash') {
        const errMsg = String(data?.error?.message || '');
        if (
          res.status === 404 ||
          res.status === 400 ||
          errMsg.includes('no longer available') ||
          errMsg.includes('not found')
        ) {
          res = await callGeminiGenerateContent(
            'gemini-3.8-flash',
            resolvedKey,
            parsedImage.mimeType,
            parsedImage.base64Data,
            telemetryContext
          );
          data = await res.json();
        }
      }

      if (!res.ok) {
        const msg = data?.error?.message || `Gemini API error (${res.status})`;
        return NextResponse.json({ error: msg }, { status: res.status });
      }

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const parsed = extractJsonBlock(text);
      const resolvedTitle =
        typeof parsed.title === 'string' && parsed.title.trim()
          ? parsed.title.trim()
          : fallbackTitle;
      return NextResponse.json({
        title: resolvedTitle,
        modelUsed: geminiModel,
        tags: Array.isArray(parsed.tags) ? parsed.tags : undefined,
        prompts: {
          masterPrompt: String(parsed.masterPrompt || ''),
          layoutAnatomy: String(parsed.layoutAnatomy || ''),
          typographyAndHierarchy: String(parsed.typographyAndHierarchy || ''),
          colorTokensCss: String(parsed.colorTokensCss || ''),
          interactionAndStates: String(parsed.interactionAndStates || ''),
        } satisfies GeneratedPromptSections,
      });
    }

    if (provider === 'openai') {
      const resolvedKey = apiKey.trim() || process.env.OPENAI_API_KEY || '';
      if (!resolvedKey) {
        return NextResponse.json(
          { error: 'Enter an OpenAI API key in the Provider Configuration drawer (or switch to Local Vision Dissector).' },
          { status: 401 }
        );
      }
      const openaiModel = model.trim() || 'gpt-4o';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resolvedKey}`,
        },
        body: JSON.stringify({
          model: openaiModel,
          response_format: { type: 'json_object' },
          max_tokens: 4096,
          messages: [
            { role: 'system', content: SYSTEM_INSTRUCTION },
            {
              role: 'user',
              content: [
                { type: 'text', text: telemetryContext },
                {
                  type: 'image_url',
                  image_url: { url: imageDataUrl },
                },
              ],
            },
          ],
          temperature: 0.2,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error?.message || `OpenAI API error (${res.status})`;
        return NextResponse.json({ error: msg }, { status: res.status });
      }
      const text = data?.choices?.[0]?.message?.content || '{}';
      const parsed = extractJsonBlock(text);
      const resolvedTitle =
        typeof parsed.title === 'string' && parsed.title.trim()
          ? parsed.title.trim()
          : fallbackTitle;
      return NextResponse.json({
        title: resolvedTitle,
        tags: Array.isArray(parsed.tags) ? parsed.tags : undefined,
        prompts: {
          masterPrompt: String(parsed.masterPrompt || ''),
          layoutAnatomy: String(parsed.layoutAnatomy || ''),
          typographyAndHierarchy: String(parsed.typographyAndHierarchy || ''),
          colorTokensCss: String(parsed.colorTokensCss || ''),
          interactionAndStates: String(parsed.interactionAndStates || ''),
        } satisfies GeneratedPromptSections,
      });
    }

    if (provider === 'anthropic') {
      const resolvedKey = apiKey.trim() || process.env.ANTHROPIC_API_KEY || '';
      if (!resolvedKey) {
        return NextResponse.json(
          { error: 'Enter an Anthropic API key in the Provider Configuration drawer (or switch to Local Vision Dissector).' },
          { status: 401 }
        );
      }
      const claudeModel = model.trim() || 'claude-3-7-sonnet-latest';
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': resolvedKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: claudeModel,
          max_tokens: 4096,
          system: SYSTEM_INSTRUCTION,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: parsedImage.mimeType,
                    data: parsedImage.base64Data,
                  },
                },
                { type: 'text', text: telemetryContext },
              ],
            },
          ],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error?.message || `Anthropic API error (${res.status})`;
        return NextResponse.json({ error: msg }, { status: res.status });
      }
      const text = data?.content?.[0]?.text || '{}';
      const parsed = extractJsonBlock(text);
      const resolvedTitle =
        typeof parsed.title === 'string' && parsed.title.trim()
          ? parsed.title.trim()
          : fallbackTitle;
      return NextResponse.json({
        title: resolvedTitle,
        tags: Array.isArray(parsed.tags) ? parsed.tags : undefined,
        prompts: {
          masterPrompt: String(parsed.masterPrompt || ''),
          layoutAnatomy: String(parsed.layoutAnatomy || ''),
          typographyAndHierarchy: String(parsed.typographyAndHierarchy || ''),
          colorTokensCss: String(parsed.colorTokensCss || ''),
          interactionAndStates: String(parsed.interactionAndStates || ''),
        } satisfies GeneratedPromptSections,
      });
    }

    return NextResponse.json({ error: 'Unsupported AI provider.' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Vision prompt generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
