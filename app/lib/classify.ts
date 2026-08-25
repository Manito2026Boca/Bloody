import { CATEGORY_HEURISTICS } from './categories';
import type { ServiceMode } from './types';

export type NeedClassification = {
  categorySlug: string | null;
  categoryName: string | null;
  suggestedMode: ServiceMode;
  confidence: number;
  matchedKeywords: string[];
};

const urgentWords = ['urgente', 'ahora', 'ya', 'inundacion', 'perdida', 'afuera'];
const quoteWords = ['reforma', 'pintar', 'obra', 'mudanza', 'presupuesto'];
const scheduledWords = ['manana', 'semana', 'turno', 'programar', 'martes'];

function normalize(input: string) {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function modeFromText(text: string, fallback: ServiceMode): ServiceMode {
  if (urgentWords.some((word) => text.includes(word))) return 'immediate';
  if (quoteWords.some((word) => text.includes(word))) return 'quote';
  if (scheduledWords.some((word) => text.includes(word))) return 'scheduled';
  return fallback;
}

export function classifyNeed(rawText: string): NeedClassification {
  const text = normalize(rawText);

  if (!text) {
    return {
      categorySlug: null,
      categoryName: null,
      suggestedMode: 'immediate',
      confidence: 0,
      matchedKeywords: [],
    };
  }

  const ranked = CATEGORY_HEURISTICS.map((category) => {
    const matchedKeywords = category.keywords.filter((keyword) =>
      text.includes(normalize(keyword)),
    );
    const score =
      matchedKeywords.length * 2 +
      (text.includes(normalize(category.name)) ? 3 : 0);

    return { category, score, matchedKeywords };
  }).sort((a, b) => b.score - a.score);

  const winner = ranked[0];

  if (!winner || winner.score === 0) {
    return {
      categorySlug: null,
      categoryName: null,
      suggestedMode: modeFromText(text, 'immediate'),
      confidence: 0.22,
      matchedKeywords: [],
    };
  }

  return {
    categorySlug: winner.category.slug,
    categoryName: winner.category.name,
    suggestedMode: modeFromText(text, winner.category.preferredMode),
    confidence: Math.min(0.96, 0.48 + winner.score * 0.08),
    matchedKeywords: winner.matchedKeywords,
  };
}
