export type IngestionMethod = 'paste' | 'file' | 'url';

export type AIProvider = 'heuristic' | 'gemini' | 'openai' | 'anthropic';

export interface ColorToken {
  hex: string;
  role: string;
  ratio: string;
}

export interface SpatialMetrics {
  width: number;
  height: number;
  aspectRatio: string;
  gridColumns: string;
  densityProfile: string;
  dominantLuminance: 'Light Ground' | 'Dark Ground' | 'High-Contrast Split';
}

export interface GeneratedPromptSections {
  masterPrompt: string;
  layoutAnatomy: string;
  typographyAndHierarchy: string;
  colorTokensCss: string;
  interactionAndStates: string;
}

export interface UIReferenceItem {
  id: string;
  catalogCode: string;
  title: string;
  sourceType: IngestionMethod;
  sourceLabel: string;
  imageUrl: string;
  createdAt: string;
  providerUsed: string;
  tags: string[];
  metrics: SpatialMetrics;
  palette: ColorToken[];
  prompts: GeneratedPromptSections;
}
