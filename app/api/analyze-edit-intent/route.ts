import { NextRequest, NextResponse } from 'next/server';
import { createGroq } from '@ai-sdk/groq';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject, type LanguageModel } from 'ai';
import { z } from 'zod';
import type { FileManifest } from '@/types/file-manifest';

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
});

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

// ✅ Schema
const searchPlanSchema = z.object({
  editType: z.enum([
    'UPDATE_COMPONENT',
    'ADD_FEATURE', 
    'FIX_ISSUE',
    'UPDATE_STYLE',
    'REFACTOR',
    'ADD_DEPENDENCY',
    'REMOVE_ELEMENT'
  ]),
  reasoning: z.string(),
  searchTerms: z.array(z.string()),
  regexPatterns: z.array(z.string()).optional(),
  fileTypesToSearch: z.array(z.string()).default(['.jsx', '.tsx', '.js', '.ts']),
  expectedMatches: z.number().min(1).max(10).default(1),
  fallbackSearch: z.object({
    terms: z.array(z.string()),
    patterns: z.array(z.string()).optional()
  }).optional()
});

export async function POST(request: NextRequest) {
  try {
    const { prompt, manifest, model = 'openai/gpt-oss-20b' } = await request.json();

    if (!prompt || !manifest) {
      return NextResponse.json({ error: 'prompt and manifest are required' }, { status: 400 });
    }

    // ✅ Choose model properly
    let aiModel: LanguageModel;
    if (model.startsWith('anthropic/')) {
      aiModel = anthropic(model.replace('anthropic/', ''));
    } else if (model.startsWith('openai/')) {
      aiModel = model.includes('gpt-oss')
        ? groq(model)
        : openai(model.replace('openai/', ''));
    } else if (model.startsWith('google/')) {
      aiModel = google(model.replace('google/', ''));  // ✅ FIXED
    } else {
      aiModel = groq(model);
    }

    // ✅ Generate search plan
    const result = await generateObject({
      model: aiModel,
      schema: searchPlanSchema,
      messages: [
        { role: 'system', content: `You are an expert at planning code searches...` },
        { role: 'user', content: `User request: "${prompt}"` }
      ]
    });

    return NextResponse.json({
      success: true,
      searchPlan: result.object
    });

  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
  }
