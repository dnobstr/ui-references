'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AIProvider,
  ColorToken,
  GeneratedPromptSections,
  IngestionMethod,
  SpatialMetrics,
  UIReferenceItem,
} from '@/types/reference';
import {
  analyzeImageOnCanvas,
  buildLocalStructuredPrompts,
} from '@/lib/vision-analyzer';
import MarkdownOutput, { stripMarkdownForExcerpt } from '@/components/MarkdownOutput';

type DossierTabKey = keyof GeneratedPromptSections;

const DOSSIER_TABS: { key: DossierTabKey; label: string }[] = [
  { key: 'masterPrompt', label: 'Master Prompt' },
  { key: 'layoutAnatomy', label: 'Layout Anatomy' },
  { key: 'typographyAndHierarchy', label: 'Typography' },
  { key: 'colorTokensCss', label: 'CSS Tokens' },
  { key: 'interactionAndStates', label: 'Interactions' },
];

const EMPTY_PROMPTS: GeneratedPromptSections = {
  masterPrompt: '',
  layoutAnatomy: '',
  typographyAndHierarchy: '',
  colorTokensCss: '',
  interactionAndStates: '',
};

const DEFAULT_MODELS: Record<AIProvider, string> = {
  heuristic: 'canvas-spatial-v1',
  gemini: 'gemini-3.8-flash',
  openai: 'gpt-4o',
  anthropic: 'claude-3-7-sonnet-latest',
};

function sanitizeStoredModel(provider: AIProvider, rawModel: string | null): string {
  const fallback = DEFAULT_MODELS[provider];
  if (!rawModel || !rawModel.trim()) return fallback;
  const cleaned = rawModel.trim().replace(/^models\//i, '');
  if (provider === 'gemini') {
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
  }
  return cleaned;
}

const PROVIDER_LABELS: Record<AIProvider, string> = {
  heuristic: 'Local Vision Dissector',
  gemini: 'Google Gemini Vision',
  openai: 'OpenAI GPT-4o Vision',
  anthropic: 'Anthropic Claude Vision',
};

const LOCAL_STORAGE_CATALOG_KEY = 'ui_ref_catalog';

function readCatalogFromLocalStorage(): UIReferenceItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CATALOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCatalogToLocalStorage(items: UIReferenceItem[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_CATALOG_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota or private mode errors
  }
}

function upsertReferenceById(
  list: UIReferenceItem[],
  item: UIReferenceItem
): UIReferenceItem[] {
  const existingIndex = list.findIndex((entry) => entry.id === item.id);
  if (existingIndex !== -1) {
    return list.map((entry, idx) => (idx === existingIndex ? item : entry));
  }
  return [item, ...list];
}

export default function UIReferencesStudioPage() {
  const [references, setReferences] = useState<UIReferenceItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');

  // Active Workbench State
  const [ingestMode, setIngestMode] = useState<IngestionMethod>('paste');
  const [stagedImageUrl, setStagedImageUrl] = useState<string>('');
  const [stagedSourceType, setStagedSourceType] = useState<IngestionMethod>('paste');
  const [stagedSourceLabel, setStagedSourceLabel] = useState<string>('AWAITING CAPTURE');
  const [specimenTitle, setSpecimenTitle] = useState<string>('');
  const [metrics, setMetrics] = useState<SpatialMetrics | null>(null);
  const [palette, setPalette] = useState<ColorToken[]>([]);
  const [prompts, setPrompts] = useState<GeneratedPromptSections>(EMPTY_PROMPTS);
  const [tags, setTags] = useState<string[]>([]);

  // UI Controls State
  const [activeTab, setActiveTab] = useState<DossierTabKey>('masterPrompt');
  const [isEditingMarkdown, setIsEditingMarkdown] = useState<boolean>(false);
  const [showReticule, setShowReticule] = useState<boolean>(true);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [urlInput, setUrlInput] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [copiedPromptState, setCopiedPromptState] = useState<string | null>(null);

  // Provider Config State
  const [showProviderConfig, setShowProviderConfig] = useState<boolean>(false);
  const [provider, setProvider] = useState<AIProvider>('heuristic');
  const [apiKey, setApiKey] = useState<string>('');
  const [modelName, setModelName] = useState<string>(DEFAULT_MODELS.heuristic);

  // Repository Archive Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<'all' | IngestionMethod>('all');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadItemIntoStage = useCallback((item: UIReferenceItem) => {
    setActiveId(item.id);
    setStagedImageUrl(item.imageUrl);
    setStagedSourceType(item.sourceType);
    setStagedSourceLabel(item.sourceLabel);
    setSpecimenTitle(item.title);
    setMetrics(item.metrics);
    setPalette(item.palette || []);
    setPrompts(item.prompts || EMPTY_PROMPTS);
    setTags(item.tags || []);
  }, []);

  const resetWorkbenchStage = useCallback(() => {
    setActiveId('');
    setStagedImageUrl('');
    setStagedSourceType('paste');
    setStagedSourceLabel('AWAITING CAPTURE');
    setSpecimenTitle('');
    setMetrics(null);
    setPalette([]);
    setPrompts(EMPTY_PROMPTS);
    setTags([]);
  }, []);

  // Load saved catalog and provider preferences
  useEffect(() => {
    async function fetchCatalog() {
      try {
        const res = await fetch('/api/references');
        if (res.ok) {
          const data = await res.json();
          const savedRefs: UIReferenceItem[] = Array.isArray(data.references)
            ? data.references
            : [];
          setReferences(savedRefs);
          writeCatalogToLocalStorage(savedRefs);
          if (savedRefs.length > 0) {
            loadItemIntoStage(savedRefs[0]);
          } else {
            resetWorkbenchStage();
          }
          return;
        }
      } catch {
        // Fallback to localStorage below if API cannot be reached
      }

      const cachedRefs = readCatalogFromLocalStorage();
      if (cachedRefs.length > 0) {
        setReferences(cachedRefs);
        loadItemIntoStage(cachedRefs[0]);
      } else {
        resetWorkbenchStage();
      }
    }
    fetchCatalog();

    try {
      const savedProvider = localStorage.getItem('ui_ref_provider') as AIProvider | null;
      const savedKey = localStorage.getItem('ui_ref_api_key');
      const savedModel = localStorage.getItem('ui_ref_model');
      if (savedProvider && DEFAULT_MODELS[savedProvider]) {
        setProvider(savedProvider);
        const normalizedModel = sanitizeStoredModel(savedProvider, savedModel);
        setModelName(normalizedModel);
        localStorage.setItem('ui_ref_model', normalizedModel);
      }
      if (savedKey) {
        setApiKey(savedKey);
      }
    } catch {
      // Ignore storage errors
    }
  }, [loadItemIntoStage, resetWorkbenchStage]);

  const handleProviderChange = (nextProvider: AIProvider) => {
    setProvider(nextProvider);
    const nextModel = DEFAULT_MODELS[nextProvider];
    setModelName(nextModel);
    try {
      localStorage.setItem('ui_ref_provider', nextProvider);
      localStorage.setItem('ui_ref_model', nextModel);
    } catch {
      // Ignore
    }
  };

  const handleModelNameChange = (val: string) => {
    const normalized = sanitizeStoredModel(provider, val);
    setModelName(val);
    try {
      localStorage.setItem('ui_ref_model', normalized);
    } catch {
      // Ignore
    }
  };

  const handleApiKeyChange = (val: string) => {
    setApiKey(val);
    try {
      localStorage.setItem('ui_ref_api_key', val);
    } catch {
      // Ignore
    }
  };

  const stageAndAnalyzeImage = useCallback(
    async (
      dataUrl: string,
      method: IngestionMethod,
      label: string,
      suggestedTitle: string
    ) => {
      const nextStagedId = `ref-${Date.now()}`;
      setIsAnalyzing(true);
      setStagedImageUrl(dataUrl);
      setStagedSourceType(method);
      setStagedSourceLabel(label);
      setSpecimenTitle(suggestedTitle);
      setActiveId(nextStagedId);
      setStatusMessage({
        text: `Staging screenshot from ${label} and running spatial & pixel analysis...`,
      });

      try {
        const analysis = await analyzeImageOnCanvas(dataUrl, suggestedTitle);
        setMetrics(analysis.metrics);
        setPalette(analysis.palette);
        setTags(analysis.suggestedTags);
        setSpecimenTitle(analysis.suggestedTitle);

        const localPrompts = buildLocalStructuredPrompts(
          analysis.suggestedTitle,
          analysis.metrics,
          analysis.palette
        );
        setPrompts(localPrompts);

        if (provider !== 'heuristic') {
          const effectiveModel = sanitizeStoredModel(provider, modelName);
          if (effectiveModel !== modelName) {
            setModelName(effectiveModel);
            try {
              localStorage.setItem('ui_ref_model', effectiveModel);
            } catch {
              // Ignore
            }
          }
          const res = await fetch('/api/generate-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider,
              apiKey,
              model: effectiveModel,
              imageDataUrl: dataUrl,
              title: analysis.suggestedTitle,
              metrics: analysis.metrics,
              palette: analysis.palette,
            }),
          });
          const aiData = await res.json();
          if (res.ok && aiData.prompts) {
            setPrompts(aiData.prompts);
            if (aiData.title) setSpecimenTitle(aiData.title);
            if (Array.isArray(aiData.tags) && aiData.tags.length > 0) {
              setTags(aiData.tags);
            }
            setStatusMessage({
              text: `Vision analysis complete via ${PROVIDER_LABELS[provider]}. Ready to copy or save to repo.`,
            });
          } else {
            setStatusMessage({
              text: `${aiData.error || 'External API unavailable'} — fallback local vision specification generated.`,
              isError: true,
            });
          }
        } else {
          setStatusMessage({
            text: `Captured ${analysis.metrics.width}×${analysis.metrics.height} (${analysis.metrics.aspectRatio}) specimen and synthesized replication prompt.`,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Image analysis failed';
        setStatusMessage({ text: msg, isError: true });
      } finally {
        setIsAnalyzing(false);
      }
    },
    [apiKey, modelName, provider]
  );

  // Handle File Upload
  const processFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        setStatusMessage({
          text: `Unsupported file type (${file.type || 'unknown'}). Upload a PNG, JPG, WEBP, or SVG screenshot.`,
          isError: true,
        });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const cleanName = file.name
            .replace(/\.[^/.]+$/, '')
            .replace(/[-_]+/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
          stageAndAnalyzeImage(
            reader.result,
            'file',
            `FILE UPLOAD · ${file.name.toUpperCase()}`,
            cleanName || 'Uploaded UI Screenshot'
          );
        }
      };
      reader.readAsDataURL(file);
    },
    [stageAndAnalyzeImage]
  );

  // Handle URL Ingestion
  const handleUrlSubmit = useCallback(
    async (overrideUrl?: string) => {
      const targetUrl = (overrideUrl ?? urlInput).trim();
      if (!targetUrl) {
        setStatusMessage({
          text: 'Enter a valid direct image URL (http:// or https://).',
          isError: true,
        });
        return;
      }
      setIsAnalyzing(true);
      setStatusMessage({ text: `Fetching image from ${targetUrl}...` });

      try {
        const res = await fetch('/api/fetch-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl }),
        });
        const data = await res.json();
        if (!res.ok || !data.dataUrl) {
          setStatusMessage({
            text: data.error || 'Could not fetch image from URL.',
            isError: true,
          });
          setIsAnalyzing(false);
          return;
        }
        const urlSegment =
          targetUrl
            .split('/')
            .pop()
            ?.split('?')[0]
            ?.replace(/\.[^/.]+$/, '')
            .replace(/[-_]+/g, ' ') || 'Linked UI Screenshot';
        const formattedTitle = urlSegment.replace(/\b\w/g, (c) => c.toUpperCase());
        await stageAndAnalyzeImage(
          data.dataUrl,
          'url',
          `DIRECT LINK · ${targetUrl.slice(0, 38)}`,
          formattedTitle
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'URL fetch failed';
        setStatusMessage({ text: msg, isError: true });
        setIsAnalyzing(false);
      }
    },
    [stageAndAnalyzeImage, urlInput]
  );

  // Global Ctrl+V / Cmd+V Paste Handler (supports both image blobs and pasted URLs)
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            setIngestMode('paste');
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string') {
                stageAndAnalyzeImage(
                  reader.result,
                  'paste',
                  'CLIPBOARD PASTE · IMAGE BUFFER',
                  `Clipboard UI Capture (${new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })})`
                );
              }
            };
            reader.readAsDataURL(blob);
          }
          return;
        }
      }

      // If user pasted an image URL while not typing inside a text input
      if (!isEditingInput) {
        const pastedText = e.clipboardData?.getData('text/plain')?.trim() || '';
        if (
          pastedText.startsWith('http://') ||
          pastedText.startsWith('https://') ||
          pastedText.startsWith('data:image/')
        ) {
          e.preventDefault();
          if (pastedText.startsWith('data:image/')) {
            setIngestMode('paste');
            stageAndAnalyzeImage(
              pastedText,
              'paste',
              'CLIPBOARD PASTE · DATA URI',
              'Clipboard Data URI Specimen'
            );
          } else {
            setIngestMode('url');
            setUrlInput(pastedText);
            handleUrlSubmit(pastedText);
          }
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [handleUrlSubmit, stageAndAnalyzeImage]);

  // Explicit Clipboard Read Button Handler
  const handleReadClipboardClick = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        setStatusMessage({
          text: 'Press Ctrl+V (or Cmd+V) anywhere on this page to paste your screenshot from clipboard.',
        });
        return;
      }
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find((t) => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') {
              stageAndAnalyzeImage(
                reader.result,
                'paste',
                'CLIPBOARD PASTE · DIRECT READ',
                `Clipboard UI Capture (${new Date().toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })})`
              );
            }
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
      setStatusMessage({
        text: 'No image found in system clipboard. Copy any screenshot and press Ctrl+V.',
        isError: true,
      });
    } catch {
      setStatusMessage({
        text: 'Browser blocked direct clipboard read permission — press Ctrl+V (or Cmd+V) anywhere on the page instead.',
      });
    }
  };

  // Re-run AI Prompt Generation on Current Staged Screenshot
  const handleRegeneratePrompt = async () => {
    if (!stagedImageUrl) {
      setStatusMessage({
        text: 'Stage a screenshot first by pasting from clipboard (Ctrl+V), uploading a file, or fetching an image URL.',
        isError: true,
      });
      return;
    }

    setIsAnalyzing(true);
    setStatusMessage({
      text: `Synthesizing UI replication prompt via ${PROVIDER_LABELS[provider]}...`,
    });

    try {
      let currentImageUrl = stagedImageUrl;
      if (currentImageUrl.startsWith('/')) {
        // Convert local path to base64 dataUrl if calling external provider
        const imgRes = await fetch(currentImageUrl);
        const blob = await imgRes.blob();
        currentImageUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result));
          reader.readAsDataURL(blob);
        });
      }

      const analysis = await analyzeImageOnCanvas(currentImageUrl, specimenTitle);
      setMetrics(analysis.metrics);
      setPalette(analysis.palette);

      const effectiveTitle = analysis.suggestedTitle;
      setSpecimenTitle(effectiveTitle);

      if (provider === 'heuristic') {
        const generated = buildLocalStructuredPrompts(
          effectiveTitle,
          analysis.metrics,
          analysis.palette
        );
        setPrompts(generated);
        setStatusMessage({
          text: `Updated replication prompt dossier using Local Vision Dissector (${analysis.metrics.width}×${analysis.metrics.height}).`,
        });
      } else {
        const effectiveModel = sanitizeStoredModel(provider, modelName);
        if (effectiveModel !== modelName) {
          setModelName(effectiveModel);
          try {
            localStorage.setItem('ui_ref_model', effectiveModel);
          } catch {
            // Ignore
          }
        }
        const res = await fetch('/api/generate-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            apiKey,
            model: effectiveModel,
            imageDataUrl: currentImageUrl,
            title: effectiveTitle,
            metrics: analysis.metrics,
            palette: analysis.palette,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setStatusMessage({
            text: data.error || 'Vision API request failed.',
            isError: true,
          });
        } else {
          setPrompts(data.prompts);
          if (data.title) setSpecimenTitle(data.title);
          if (Array.isArray(data.tags)) setTags(data.tags);
          setStatusMessage({
            text: `AI prompt generated via ${PROVIDER_LABELS[provider]} (${effectiveModel}).`,
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Prompt synthesis failed';
      setStatusMessage({ text: msg, isError: true });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Save or Update Staged Reference in Repository & Local Storage (Upsert by ID)
  const handleSaveToRepo = async () => {
    if (!stagedImageUrl || !metrics) {
      setStatusMessage({
        text: 'Stage and analyze a screenshot before saving to the repository catalog.',
        isError: true,
      });
      return;
    }

    const targetId = activeId || `ref-${Date.now()}`;
    const isUpdatingExisting = references.some((item) => item.id === targetId);

    setIsSaving(true);
    setStatusMessage({
      text: isUpdatingExisting
        ? 'Updating existing specimen in repository catalog...'
        : 'Committing screenshot and prompt dossier to repository catalog...',
    });
    try {
      const res = await fetch('/api/references', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: targetId,
          title: specimenTitle.trim() || 'Untitled UI Specimen',
          sourceType: stagedSourceType,
          sourceLabel: stagedSourceLabel,
          imageUrl: stagedImageUrl,
          providerUsed: `${PROVIDER_LABELS[provider]} (${modelName})`,
          tags,
          metrics,
          palette,
          prompts,
        }),
      });
      const data = await res.json();
      if (res.ok && data.item) {
        const upsertedList = Array.isArray(data.references)
          ? data.references
          : upsertReferenceById(references, data.item);
        setReferences(upsertedList);
        writeCatalogToLocalStorage(upsertedList);
        setActiveId(data.item.id);
        setStagedImageUrl(data.item.imageUrl);
        setStatusMessage({
          text:
            data.isUpdate || isUpdatingExisting
              ? `Updated ${data.item.catalogCode} ("${data.item.title}") in repository catalog.`
              : `Saved ${data.item.catalogCode} ("${data.item.title}") to repository catalog at ${data.item.imageUrl}.`,
        });
      } else {
        setStatusMessage({
          text: data.error || 'Could not save reference to repository.',
          isError: true,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Repository save failed';
      setStatusMessage({ text: msg, isError: true });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectReference = (item: UIReferenceItem) => {
    loadItemIntoStage(item);
    setStatusMessage({
      text: `Loaded ${item.catalogCode} ("${item.title}") into the survey stage.`,
    });
  };

  const handleDeleteReference = async (id: string, code: string) => {
    try {
      const res = await fetch(`/api/references?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.references)) {
        const remaining: UIReferenceItem[] = data.references;
        setReferences(remaining);
        writeCatalogToLocalStorage(remaining);
        if (id === activeId) {
          if (remaining.length > 0) {
            loadItemIntoStage(remaining[0]);
          } else {
            resetWorkbenchStage();
          }
        }
        setStatusMessage({ text: `Removed ${code} from repository catalog.` });
      }
    } catch {
      setStatusMessage({ text: 'Failed to remove reference.', isError: true });
    }
  };

  const copyTextToClipboard = async (text: string, label: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPromptState(label);
      setTimeout(() => setCopiedPromptState(null), 2200);
    } catch {
      setStatusMessage({ text: 'Clipboard write failed.', isError: true });
    }
  };

  const copyHexSwatch = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopiedToken(hex);
      setTimeout(() => setCopiedToken(null), 1600);
    } catch {
      // Ignore
    }
  };

  const hasStagedSpecimen = Boolean(stagedImageUrl);
  const isExistingSpecimen = Boolean(
    activeId && references.some((item) => item.id === activeId)
  );

  const fullMarkdownDossier = hasStagedSpecimen
    ? `# ${specimenTitle || 'Untitled UI Specimen'}

## Master UI Replication Prompt
${prompts.masterPrompt}

## Spatial & Layout Anatomy (${
        metrics ? `${metrics.width}x${metrics.height} · ${metrics.aspectRatio}` : 'Unmeasured'
      })
${prompts.layoutAnatomy}

## Typography & Hierarchy
${prompts.typographyAndHierarchy}

## Extracted Color Tokens
\`\`\`css
${prompts.colorTokensCss}
\`\`\`

## Interaction & States
${prompts.interactionAndStates}
`
    : '';

  const filteredReferences = references.filter((item) => {
    const matchesSource =
      sourceFilter === 'all' ? true : item.sourceType === sourceFilter;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return matchesSource;
    const hay = `${item.catalogCode} ${item.title} ${(item.tags || []).join(' ')} ${
      item.prompts?.masterPrompt || ''
    } ${(item.palette || []).map((p) => p.hex).join(' ')}`.toLowerCase();
    return matchesSource && hay.includes(q);
  });

  return (
    <div>
      {/* Top Survey Command Shell */}
      <header className="command-shell">
        <div className="command-shell-inner">
          <div className="brand-cluster">
            <h1 className="brand-title">UI References Quadrangle</h1>
            <span className="brand-coordinates">
              REPO ARCHIVE · {references.length} SPECIMENS REGISTERED
            </span>
          </div>

          <div className="command-controls">
            <button
              type="button"
              className={`capsule-btn ${ingestMode === 'paste' ? 'is-live' : ''}`}
              onClick={() => setIngestMode('paste')}
            >
              <span className="capsule-chip" />
              <span>CLIPBOARD PASTE (CTRL+V)</span>
            </button>

            <button
              type="button"
              className={`capsule-btn ${ingestMode === 'file' ? 'is-live' : ''}`}
              onClick={() => {
                setIngestMode('file');
                fileInputRef.current?.click();
              }}
            >
              <span className="capsule-chip" />
              <span>UPLOAD IMAGE FILE</span>
            </button>

            <button
              type="button"
              className={`capsule-btn ${ingestMode === 'url' ? 'is-live' : ''}`}
              onClick={() => setIngestMode('url')}
            >
              <span className="capsule-chip" />
              <span>FETCH IMAGE LINK</span>
            </button>

            <button
              type="button"
              className={`capsule-btn is-teal`}
              onClick={() => setShowProviderConfig((prev) => !prev)}
              aria-expanded={showProviderConfig}
            >
              <span className="capsule-chip" />
              <span>AI ENGINE: {PROVIDER_LABELS[provider].toUpperCase()}</span>
            </button>
          </div>
        </div>

        {/* Multi-Provider AI Vision Configuration Bar */}
        {showProviderConfig && (
          <div className="provider-drawer">
            <div className="provider-drawer-inner">
              <div className="field-group">
                <label htmlFor="ai-provider-select" className="field-label">
                  VISION AI PROVIDER
                </label>
                <select
                  id="ai-provider-select"
                  className="survey-select-dark"
                  value={provider}
                  onChange={(e) =>
                    handleProviderChange(e.target.value as AIProvider)
                  }
                >
                  <option value="heuristic">
                    Local Vision Dissector (Instant Canvas Heuristics · No Key)
                  </option>
                  <option value="gemini">Google Gemini Vision API</option>
                  <option value="openai">OpenAI Vision API (GPT-4o)</option>
                  <option value="anthropic">Anthropic Claude Vision API</option>
                </select>
              </div>

              <div className="field-group">
                <label htmlFor="ai-model-input" className="field-label">
                  VISION MODEL IDENTIFIER
                </label>
                <input
                  id="ai-model-input"
                  type="text"
                  className="survey-input-dark"
                  value={modelName}
                  onChange={(e) => handleModelNameChange(e.target.value)}
                  placeholder="e.g. gemini-3.8-flash, gpt-4o, claude-3-7-sonnet-latest"
                />
              </div>

              <div className="field-group">
                <label htmlFor="ai-key-input" className="field-label">
                  PROVIDER API KEY (STORED LOCALLY IN BROWSER)
                </label>
                <input
                  id="ai-key-input"
                  type="password"
                  className="survey-input-dark"
                  value={apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder={
                    provider === 'heuristic'
                      ? 'No API key needed for Local Vision Dissector'
                      : `Paste your ${PROVIDER_LABELS[provider]} API key...`
                  }
                  disabled={provider === 'heuristic'}
                />
              </div>

              <div className="field-group">
                <button
                  type="button"
                  className="btn-primary-copper"
                  onClick={() => {
                    setShowProviderConfig(false);
                    if (stagedImageUrl) {
                      handleRegeneratePrompt();
                    }
                  }}
                >
                  Apply &amp; Re-Analyze Stage
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Studio Container */}
      <main className="studio-container">
        {statusMessage && (
          <div
            className={`status-callout ${
              statusMessage.isError ? 'is-error' : ''
            }`}
            role="status"
          >
            <span>{statusMessage.text}</span>
            <button
              type="button"
              className="btn-outline-slate"
              style={{ padding: '4px 10px', fontSize: '0.74rem' }}
              onClick={() => setStatusMessage(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Split Survey Stage & AI Replication Dossier */}
        <section className="workbench-grid" aria-label="Screenshot Dissection Workbench">
          {/* Left Panel: Orthophoto Survey Stage */}
          <div className="survey-sheet">
            <div>
              <div className="sheet-header">
                <h2 className="sheet-heading">Screenshot Survey Stage</h2>
                <span className="sheet-datum-badge">
                  {stagedSourceLabel}
                </span>
              </div>

              {/* Three-Way Ingestion Tabs */}
              <div className="ingestion-toolbar" role="tablist" aria-label="Screenshot Ingestion Methods">
                <button
                  type="button"
                  role="tab"
                  aria-selected={ingestMode === 'paste'}
                  className={`ingest-mode-tab ${
                    ingestMode === 'paste' ? 'is-active' : ''
                  }`}
                  onClick={() => setIngestMode('paste')}
                >
                  <span>Paste Clipboard</span>
                  <span className="ingest-shortcut">CTRL+V</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={ingestMode === 'file'}
                  className={`ingest-mode-tab ${
                    ingestMode === 'file' ? 'is-active' : ''
                  }`}
                  onClick={() => setIngestMode('file')}
                >
                  <span>Upload Image File</span>
                  <span className="ingest-shortcut">DROP / BROWSE</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={ingestMode === 'url'}
                  className={`ingest-mode-tab ${
                    ingestMode === 'url' ? 'is-active' : ''
                  }`}
                  onClick={() => setIngestMode('url')}
                >
                  <span>Image Link URL</span>
                  <span className="ingest-shortcut">HTTPS</span>
                </button>
              </div>

              {/* Context-Specific Ingestion Bar */}
              <div className="ingestion-action-strip">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) processFile(file);
                    e.target.value = '';
                  }}
                />

                {ingestMode === 'paste' && (
                  <>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn-primary-copper"
                        onClick={handleReadClipboardClick}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                          <rect x="8" y="2" width="8" height="4" rx="1" />
                          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                        </svg>
                        <span>Read Image from Clipboard</span>
                      </button>
                    </div>
                    <span className="field-label-light">
                      Press Ctrl+V / Cmd+V anywhere on the page
                    </span>
                  </>
                )}

                {ingestMode === 'file' && (
                  <>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn-primary-copper"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <span>Select Screenshot File (PNG, JPG, WEBP)</span>
                      </button>
                    </div>
                    <span className="field-label-light">
                      Or drag and drop an image file directly onto the survey frame below
                    </span>
                  </>
                )}

                {ingestMode === 'url' && (
                  <div className="url-form-row">
                    <input
                      type="url"
                      className="survey-input-light"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="Paste direct screenshot URL (https://...)"
                      aria-label="Direct screenshot image URL"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleUrlSubmit();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn-primary-copper"
                      onClick={() => handleUrlSubmit()}
                      disabled={isAnalyzing}
                    >
                      Fetch &amp; Stage URL
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Coordinate Neatline & Orthophoto Viewport Stage */}
            <div
              className="orthophoto-stage-wrapper"
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  setIngestMode('file');
                  processFile(file);
                }
              }}
            >
              <div className="neatline-ruler">
                <span>ORIGIN 000px W · 000px N</span>
                <span>
                  {metrics
                    ? `FRAME ${metrics.width}×${metrics.height}px · ASPECT ${metrics.aspectRatio}`
                    : 'FRAME AWAITING CAPTURE'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowReticule((prev) => !prev)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: 'var(--teal-survey)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {showReticule ? 'HIDE SURVEY GRID' : 'SHOW SURVEY GRID'}
                </button>
              </div>

              <div
                className={`neatline-viewport ${
                  isDraggingOver ? 'is-dragging' : ''
                }`}
              >
                {hasStagedSpecimen ? (
                  <img
                    src={stagedImageUrl}
                    alt={specimenTitle || 'Staged UI reference screenshot'}
                  />
                ) : (
                  <div className="neatline-empty-stage">
                    <h3 className="neatline-empty-title">
                      No Screenshot Staged in Survey Frame
                    </h3>
                    <p className="neatline-empty-copy">
                      Press <strong>Ctrl+V</strong> to paste a screenshot from your clipboard, drag and drop an image file onto this frame, or browse a file from disk.
                    </p>
                    <button
                      type="button"
                      className="btn-primary-copper"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Browse Screenshot File
                    </button>
                  </div>
                )}
                {showReticule && <div className="survey-reticule-overlay" />}
                {isAnalyzing && <div className="scan-beam" />}
              </div>

              <div className="neatline-ruler">
                <span>
                  POLARITY: {metrics ? metrics.dominantLuminance.toUpperCase() : 'UNMEASURED'}
                </span>
                <span>DROP FILE OR PRESS CTRL+V ANYWHERE TO STAGE</span>
                <span>EXTENT {metrics ? `${metrics.width}px E` : '—'}</span>
              </div>
            </div>

            {/* Live Spatial Telemetry & Color Token Legend */}
            <div className="telemetry-bar">
              <div className="telemetry-metrics-row">
                <div className="metric-cell">
                  <span className="metric-value">
                    {metrics
                      ? `${metrics.width}×${metrics.height} (${metrics.aspectRatio})`
                      : '—'}
                  </span>
                  <span className="metric-label">MEASURED RESOLUTION</span>
                </div>
                <div className="metric-cell">
                  <span className="metric-value">
                    {metrics ? metrics.dominantLuminance : '—'}
                  </span>
                  <span className="metric-label">SURFACE POLARITY</span>
                </div>
                <div className="metric-cell">
                  <span className="metric-value">
                    {metrics ? metrics.gridColumns : 'Awaiting Screenshot'}
                  </span>
                  <span className="metric-label">DETECTED TOPOLOGY</span>
                </div>
              </div>

              {palette.length > 0 && (
                <div className="palette-swatch-bar" aria-label="Extracted Pixel Color Tokens">
                  {palette.map((token, idx) => (
                    <button
                      key={`${token.hex}-${idx}`}
                      type="button"
                      className="swatch-chip-btn"
                      onClick={() => copyHexSwatch(token.hex)}
                      title={`Click to copy ${token.hex} (${token.role})`}
                    >
                      <div
                        className="swatch-color-preview"
                        style={{ backgroundColor: token.hex }}
                      />
                      <span className="swatch-hex">
                        {copiedToken === token.hex ? 'COPIED' : token.hex}
                      </span>
                      <span className="swatch-ratio">
                        {token.ratio} · {token.role.split(' ')[0]}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: AI Replication Prompt Dossier */}
          <div className="survey-sheet">
            <div>
              <div className="sheet-header">
                <h2 className="sheet-heading">AI Replication Prompt Dossier</h2>
                <button
                  type="button"
                  className="btn-secondary-teal"
                  onClick={handleRegeneratePrompt}
                  disabled={isAnalyzing || !hasStagedSpecimen}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                    <path d="M16 16h5v5" />
                  </svg>
                  <span>
                    {isAnalyzing ? 'Analyzing Screenshot...' : 'Generate AI Prompt'}
                  </span>
                </button>
              </div>

              {/* Dossier Perspective Tabs */}
              <div className="dossier-toolbar" role="tablist" aria-label="Prompt Specification Sections">
                {DOSSIER_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.key}
                    className={`dossier-tab ${
                      activeTab === tab.key ? 'is-active' : ''
                    }`}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Editable Specimen Title & View Mode Toggle */}
              <div className="dossier-meta-bar">
                <input
                  type="text"
                  className="survey-input-light"
                  value={specimenTitle}
                  onChange={(e) => setSpecimenTitle(e.target.value)}
                  aria-label="Specimen reference title"
                  placeholder="Enter UI reference specimen title..."
                />
                <div className="dossier-mode-toggle" role="group" aria-label="Markdown view mode">
                  <button
                    type="button"
                    className={`mode-toggle-btn ${!isEditingMarkdown ? 'is-active' : ''}`}
                    onClick={() => setIsEditingMarkdown(false)}
                  >
                    Rendered Output
                  </button>
                  <button
                    type="button"
                    className={`mode-toggle-btn ${isEditingMarkdown ? 'is-active' : ''}`}
                    onClick={() => setIsEditingMarkdown(true)}
                  >
                    Edit Raw MD
                  </button>
                </div>
              </div>
            </div>

            {/* Rendered Markdown Output or Raw Markdown Editor */}
            <div className="dossier-body">
              {isEditingMarkdown ? (
                <textarea
                  className="prompt-editor"
                  value={prompts[activeTab]}
                  onChange={(e) =>
                    setPrompts((prev) => ({
                      ...prev,
                      [activeTab]: e.target.value,
                    }))
                  }
                  placeholder="Stage a screenshot to synthesize or edit its UI replication specification..."
                  aria-label={`${
                    DOSSIER_TABS.find((t) => t.key === activeTab)?.label || 'Prompt'
                  } specification text`}
                />
              ) : (
                <div
                  className="prompt-markdown-viewport"
                  aria-label={`${
                    DOSSIER_TABS.find((t) => t.key === activeTab)?.label || 'Prompt'
                  } rendered markdown output`}
                >
                  <MarkdownOutput
                    content={prompts[activeTab]}
                    isCssTab={activeTab === 'colorTokensCss'}
                  />
                </div>
              )}

              {tags.length > 0 && (
                <div className="tags-row" aria-label="Detected UI Classification Tags">
                  {tags.map((tag, i) => (
                    <span key={`${tag}-${i}`} className="specimen-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Primary Prompt Copy & Repository Commit Actions */}
            <div className="dossier-footer">
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-outline-slate"
                  disabled={!prompts[activeTab]}
                  onClick={() =>
                    copyTextToClipboard(prompts[activeTab], 'active')
                  }
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>
                    {copiedPromptState === 'active'
                      ? 'Copied Active Section'
                      : 'Copy Active Prompt'}
                  </span>
                </button>

                <button
                  type="button"
                  className="btn-outline-slate"
                  disabled={!hasStagedSpecimen}
                  onClick={() =>
                    copyTextToClipboard(fullMarkdownDossier, 'full')
                  }
                >
                  <span>
                    {copiedPromptState === 'full'
                      ? 'Copied Full Dossier'
                      : 'Copy Full Markdown Dossier'}
                  </span>
                </button>
              </div>

              <button
                type="button"
                className="btn-primary-copper"
                onClick={handleSaveToRepo}
                disabled={isSaving || !hasStagedSpecimen}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                <span>
                  {isSaving
                    ? isExistingSpecimen
                      ? 'Updating in Repo...'
                      : 'Saving to Repo...'
                    : isExistingSpecimen
                    ? 'Update Specimen in Repo'
                    : 'Save Specimen to Repo'}
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* Registered Repository Catalog Matrix */}
        <section className="catalog-section" aria-label="Registered Repository Reference Archive">
          <div className="catalog-header-bar">
            <h2 className="catalog-heading">
              Registered Repository Reference Catalog
            </h2>

            <div className="catalog-filter-row">
              <input
                type="search"
                className="survey-input-light"
                style={{ width: '280px' }}
                placeholder="Filter by title, QUAD code, tag, or hex..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Filter repository references"
              />

              {(['all', 'paste', 'file', 'url'] as const).map((filterKey) => (
                <button
                  key={filterKey}
                  type="button"
                  className={
                    sourceFilter === filterKey
                      ? 'btn-secondary-teal'
                      : 'btn-outline-slate'
                  }
                  onClick={() => setSourceFilter(filterKey)}
                >
                  {filterKey === 'all'
                    ? `All (${references.length})`
                    : filterKey === 'paste'
                    ? 'Clipboard'
                    : filterKey === 'file'
                    ? 'File Upload'
                    : 'Image URL'}
                </button>
              ))}
            </div>
          </div>

          {filteredReferences.length === 0 ? (
            <div
              style={{
                padding: '36px 24px',
                border: '1.5px solid var(--neatline-strong)',
                backgroundColor: 'var(--vellum-elevated)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <h3 style={{ fontSize: '1.15rem', marginBottom: '6px' }}>
                  {references.length === 0
                    ? 'No UI reference specimens saved in repository catalog yet'
                    : 'No matching UI specimens in current filter'}
                </h3>
                <p style={{ color: 'var(--slate-secondary)', fontSize: '0.9rem' }}>
                  {references.length === 0
                    ? 'Paste a screenshot (Ctrl+V), upload an image file, or fetch an image URL above, then click "Save Specimen to Repo".'
                    : 'Reset the search filter or stage a new screenshot above and click "Save Specimen to Repo".'}
                </p>
              </div>
              {(searchQuery || sourceFilter !== 'all') && (
                <button
                  type="button"
                  className="btn-outline-slate"
                  onClick={() => {
                    setSearchQuery('');
                    setSourceFilter('all');
                  }}
                >
                  Reset Catalog Filters
                </button>
              )}
            </div>
          ) : (
            <div className="catalog-matrix">
              {filteredReferences.map((item) => {
                const isSelected = item.id === activeId;
                return (
                  <article
                    key={item.id}
                    className={`specimen-plate ${
                      isSelected ? 'is-selected' : ''
                    }`}
                  >
                    <div className="specimen-plate-header">
                      <h3 className="specimen-plate-title">{item.title}</h3>
                      <span className="specimen-code-pill">
                        {item.catalogCode}
                      </span>
                    </div>

                    <div
                      className="specimen-thumb-frame"
                      onClick={() => handleSelectReference(item)}
                      title="Click to inspect this specimen in the survey stage"
                    >
                      <img src={item.imageUrl} alt={item.title} loading="lazy" />
                      <span className="specimen-source-ribbon">
                        {`REPO · ${item.sourceType.toUpperCase()}`}
                      </span>
                    </div>

                    <div className="specimen-plate-body">
                      <div
                        className="specimen-swatch-strip"
                        title="Extracted specimen color palette"
                      >
                        {(item.palette || []).map((sw, idx) => (
                          <span
                            key={`${item.id}-${sw.hex}-${idx}`}
                            style={{ backgroundColor: sw.hex }}
                          />
                        ))}
                      </div>

                      <p className="specimen-prompt-excerpt">
                        {stripMarkdownForExcerpt(item.prompts?.masterPrompt || '')}
                      </p>

                      <div className="tags-row">
                        {(item.tags || []).slice(0, 3).map((t, idx) => (
                          <span key={`${item.id}-tag-${idx}`} className="specimen-tag">
                            {t}
                          </span>
                        ))}
                        {item.metrics && (
                          <span className="specimen-tag tabular-readout">
                            {item.metrics.width}×{item.metrics.height}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="specimen-plate-footer">
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn-outline-slate"
                          style={{ padding: '6px 11px', fontSize: '0.78rem' }}
                          onClick={() => handleSelectReference(item)}
                        >
                          Inspect in Stage
                        </button>
                        <button
                          type="button"
                          className="btn-secondary-teal"
                          style={{ padding: '6px 11px', fontSize: '0.78rem' }}
                          onClick={() =>
                            copyTextToClipboard(
                              item.prompts?.masterPrompt || '',
                              item.id
                            )
                          }
                        >
                          {copiedPromptState === item.id
                            ? 'Copied Prompt'
                            : 'Copy Prompt'}
                        </button>
                      </div>

                      <button
                        type="button"
                        className="btn-outline-slate"
                        style={{
                          padding: '6px 10px',
                          fontSize: '0.76rem',
                          color: 'var(--status-danger)',
                        }}
                        onClick={() =>
                          handleDeleteReference(item.id, item.catalogCode)
                        }
                        title={`Delete ${item.catalogCode}`}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
