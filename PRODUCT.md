# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js / React framework app

## Users

Designers, frontend engineers, and developers building interfaces with AI coding assistants who collect UI screenshots for inspiration and need structured, high-precision prompts to replicate or adapt those designs.

## Product Purpose

A personal and repository-backed UI reference studio that accepts screenshots via file upload, direct image URL, or clipboard copy-paste, uses vision AI to dissect the interface and generate a comprehensive UI replication/design prompt, and catalogs both the visual reference and its generated prompt directly into the repository as a browsable library.

## Positioning

Unlike generic bookmarking tools that only store images or one-off prompt generators that discard outputs after a single copy, this app bridges visual inspiration and AI-assisted implementation by turning every screenshot into a persistent, searchable repo artifact pairing the original capture with structured design analysis and ready-to-use prompts.

## Operating Context

Used during active UI exploration and development workflows: a user spots a compelling interface, captures a screenshot to their clipboard (or copies an image URL / saves a file), drops or pastes it directly into the app, runs vision analysis through their preferred provider (Gemini, OpenAI, or Claude), refines or copies the prompt, and saves the entry into the local repository catalog.

## Capabilities and Constraints

- **Three-way screenshot ingestion:** Drag-and-drop / file picker upload, direct image URL fetching, and instant `Ctrl+V` / `Cmd+V` clipboard image pasting.
- **Multi-provider AI vision generation:** Configurable API keys and model selection in the UI supporting Google Gemini, OpenAI, and Anthropic Claude vision models.
- **Repo-persisted reference catalog:** Saves uploaded screenshots and their structured metadata/prompts directly to the repository filesystem so the library can be browsed, searched, inspected, and committed to Git.
- **Prompt extraction & copying:** Generates structured UI prompts covering layout topology, typography, color tokens, component anatomy, and interaction details, with one-click copy.

## Evidence on Hand

Greenfield repository with no pre-existing assets, screenshots, or brand commitments. Demo/seed entries must be clearly marked as sample references or kept distinct from user-saved captures.

## Product Principles

1. **Zero-friction capture:** Pasting from clipboard, dropping a file, or pasting a URL should immediately stage the screenshot without modal Ceremony or extra clicks.
2. **Actionable prompt fidelity:** Generated prompts should articulate concrete visual mechanics—hierarchy, spacing rhythm, surface palette, and typography—rather than vague aesthetic adjectives.
3. **Repo-native permanence:** Every saved reference belongs to the repository on disk in a clean, version-controllable structure alongside its image file.
4. **Bring-your-own-model flexibility:** Switching between Gemini, OpenAI, and Claude or updating API keys happens seamlessly in the interface without requiring server restarts.
