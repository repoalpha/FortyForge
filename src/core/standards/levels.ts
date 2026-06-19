import type { PresentationLevel } from "../model/types";

export const PRESENTATION_LEVELS: PresentationLevel[] = ["1", "1.5", "2.5", "3.5"];

export function isPresentationLevel(value: string): value is PresentationLevel {
  return PRESENTATION_LEVELS.includes(value as PresentationLevel);
}
