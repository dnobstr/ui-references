import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawUrl = typeof body?.url === 'string' ? body.url.trim() : '';

    if (!rawUrl || (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://') && !rawUrl.startsWith('/'))) {
      return NextResponse.json(
        { error: 'Enter a valid http://, https://, or local /references/ image URL.' },
        { status: 400 }
      );
    }

    if (rawUrl.startsWith('/')) {
      return NextResponse.json({ dataUrl: rawUrl });
    }

    const response = await fetch(rawUrl, {
      headers: {
        'User-Agent': 'UI-References-Quadrangle/1.0',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Remote server returned HTTP ${response.status}. Paste the image directly with Ctrl+V or download the file.` },
        { status: 422 }
      );
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mime = contentType.split(';')[0].trim() || 'image/png';

    return NextResponse.json({
      dataUrl: `data:${mime};base64,${base64}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to fetch remote URL';
    return NextResponse.json(
      { error: `Could not fetch remote URL (${message}). Try pasting the image directly from clipboard (Ctrl+V).` },
      { status: 500 }
    );
  }
}
