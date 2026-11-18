import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { UIReferenceItem } from '@/types/reference';

const execFileAsync = promisify(execFile);

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'references.json');
const PUBLIC_REFS_DIR = path.join(process.cwd(), 'public', 'references');

async function ensureCatalogInitialized(): Promise<UIReferenceItem[]> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(PUBLIC_REFS_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // File does not exist or is invalid JSON — initialize an empty array
  }
  await fs.writeFile(DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
  return [];
}

function getNextCatalogNumber(references: UIReferenceItem[]): number {
  let maxNum = 0;
  for (const item of references) {
    const match = item.catalogCode?.match(/QUAD-(\d+)/i);
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (!Number.isNaN(parsed) && parsed > maxNum) {
        maxNum = parsed;
      }
    }
  }
  return Math.max(maxNum, references.length) + 1;
}

export async function GET() {
  try {
    const references = await ensureCatalogInitialized();
    return NextResponse.json({ references });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not read catalog';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.imageUrl !== 'string' || !body.imageUrl.trim()) {
      return NextResponse.json(
        { error: 'Stage a screenshot before saving to the repository catalog.' },
        { status: 400 }
      );
    }

    const references = await ensureCatalogInitialized();

    const requestedId =
      typeof body.id === 'string' && body.id.trim() ? body.id.trim() : '';
    const existingIndex = requestedId
      ? references.findIndex((item) => item.id === requestedId)
      : -1;
    const existingItem = existingIndex !== -1 ? references[existingIndex] : null;

    const id = existingItem
      ? existingItem.id
      : requestedId || `ref-${Date.now()}`;
    const catalogCode = existingItem
      ? existingItem.catalogCode
      : `QUAD-${String(getNextCatalogNumber(references)).padStart(3, '0')}`;

    let savedImageUrl: string = body.imageUrl.trim();

    if (savedImageUrl.startsWith('data:image/')) {
      const match = savedImageUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (match) {
        const rawExt = match[1].toLowerCase();
        const ext = rawExt === 'jpeg' ? 'jpg' : rawExt === 'svg+xml' ? 'svg' : 'png';
        const fileName = `${catalogCode.toLowerCase()}-${Date.now()}.${ext}`;
        const filePath = path.join(PUBLIC_REFS_DIR, fileName);
        const buffer = Buffer.from(match[2], 'base64');
        await fs.writeFile(filePath, buffer);
        savedImageUrl = `/references/${fileName}`;

        try {
          await execFileAsync(
            '/home/nobstr/.gemini/config/skills/impeccable/scripts/impeccable',
            [
              'embed-prompt',
              filePath,
              '--prompt',
              `User-captured UI reference screenshot (${body.sourceLabel || body.sourceType || 'upload'}): ${body.title || catalogCode}`,
            ]
          );
        } catch {
          // Best-effort provenance embedding
        }
      }
    }

    const upsertedItem: UIReferenceItem = {
      id,
      catalogCode,
      title: (body.title || existingItem?.title || 'Untitled UI Specimen').trim(),
      sourceType: body.sourceType || existingItem?.sourceType || 'paste',
      sourceLabel:
        body.sourceLabel || existingItem?.sourceLabel || 'REPO SPECIMEN · SAVED',
      imageUrl: savedImageUrl,
      createdAt: existingItem ? existingItem.createdAt : new Date().toISOString(),
      providerUsed:
        body.providerUsed || existingItem?.providerUsed || 'Local Vision Dissector',
      tags:
        Array.isArray(body.tags) && body.tags.length > 0
          ? body.tags
          : existingItem?.tags || ['UI Specimen'],
      metrics: body.metrics || existingItem?.metrics,
      palette: body.palette || existingItem?.palette || [],
      prompts: body.prompts || existingItem?.prompts,
    };

    const updated =
      existingIndex !== -1
        ? references.map((item, idx) =>
            idx === existingIndex ? upsertedItem : item
          )
        : [upsertedItem, ...references];

    await fs.writeFile(DATA_FILE, JSON.stringify(updated, null, 2), 'utf-8');

    return NextResponse.json({
      item: upsertedItem,
      references: updated,
      isUpdate: existingIndex !== -1,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not save reference to repository';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing reference id' }, { status: 400 });
    }
    const references = await ensureCatalogInitialized();
    const updated = references.filter((item) => item.id !== id);
    await fs.writeFile(DATA_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    return NextResponse.json({ references: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not delete reference';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
