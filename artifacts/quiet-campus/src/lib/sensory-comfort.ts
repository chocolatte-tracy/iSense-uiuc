import type { AcceptanceKey, AcceptanceLevel } from './route-scoring';
import { physicalThresholds } from './physical-sensory-levels';

export const comfortFactors = [
  { key: 'noiseAcceptance', title: 'Noise', costKey: 'noiseCost' },
  { key: 'crowdAcceptance', title: 'Crowds', costKey: 'crowdCost' },
  { key: 'sunAcceptance', title: 'Sun Exposure', costKey: 'sunExposureCost' },
] as const;

export const comfortLevels: AcceptanceLevel[] = ['low', 'medium', 'high'];

// Acceptance ranges are cumulative; Medium also accepts the Low band.
// These notes explain physical trials, not the prototype ranking cutoffs.
export const comfortRangeNotes: Record<AcceptanceKey, Record<AcceptanceLevel, { range: string; levels: string }>> = {
  noiseAcceptance: {
    low: { range: `Trial: <${physicalThresholds.noise.lowUpperDbA} dB(A)`, levels: 'Low noise' },
    medium: { range: `Trial: <${physicalThresholds.noise.mediumUpperDbA} dB(A)`, levels: 'Low + Medium noise' },
    high: { range: 'No dB(A) cutoff', levels: 'All known noise levels' },
  },
  crowdAcceptance: {
    low: { range: `Trial: 0–<${physicalThresholds.crowds.lowUpperPeoplePerM2} people/m²`, levels: 'Reviewed Empty + Low' },
    medium: { range: `Trial: 0–<${physicalThresholds.crowds.mediumUpperPeoplePerM2} people/m²`, levels: 'Reviewed Empty + Low + Medium' },
    high: { range: 'No density cutoff', levels: 'All known crowd levels' },
  },
  sunAcceptance: {
    low: { range: 'Prototype index: ≤33/100', levels: 'No validated physical range' },
    medium: { range: 'Prototype index: ≤66/100', levels: 'No validated physical range' },
    high: { range: 'Prototype index: ≤100/100', levels: 'No validated physical range' },
  },
};

export const comfortOptions: Record<AcceptanceKey, Record<AcceptanceLevel, { label: string; description: string }>> = {
  noiseAcceptance: {
    low: { label: 'Very Quiet', description: 'Prefer environments with very little noise.' },
    medium: { label: 'Quiet', description: 'Some noise is okay, but quieter surroundings feel more comfortable.' },
    high: { label: 'No Noise Limit', description: 'Do not exclude routes based on noise. Lower noise still helps when Noise is important to you.' },
  },
  crowdAcceptance: {
    low: { label: 'Nearly Empty', description: 'Prefer environments with very few people.' },
    medium: { label: 'Not Too Crowded', description: 'Some people are okay, but prefer less crowded surroundings.' },
    high: { label: 'No Crowd Limit', description: 'Do not exclude routes based on crowds. Lower crowd exposure still helps when Crowds is important to you.' },
  },
  sunAcceptance: {
    low: { label: 'Mostly Shaded', description: 'Prefer environments with a lower sun-exposure index.' },
    medium: { label: 'Some Sun Is Okay', description: 'Some sun exposure feels comfortable; prefer avoiding higher exposure.' },
    high: { label: 'No Sun Exposure Limit', description: 'Do not exclude routes based on sun exposure. Lower exposure still helps when Sun Exposure is important to you.' },
  },
};
