import { config } from "../../package.json";

export interface AnnotationColorDefinition {
  id: string;
  hex: string;
  fallbackLabel: string;
}

export interface AnnotationColorEntry extends AnnotationColorDefinition {
  label: string;
}

export type AnnotationLabelTuple = [string, string];

export const PREF_BRANCH = `extensions.zotero.${config.addonRef}`;
const COLOR_PREF_PREFIX = `${PREF_BRANCH}.colorNames`;

export const DEFAULT_COLORS: AnnotationColorDefinition[] = [
  { id: "general.yellow", hex: "#ffd400", fallbackLabel: "Yellow" },
  { id: "general.red", hex: "#ff6666", fallbackLabel: "Red" },
  { id: "general.green", hex: "#5fb236", fallbackLabel: "Green" },
  { id: "general.blue", hex: "#2ea8e5", fallbackLabel: "Blue" },
  { id: "general.purple", hex: "#a28ae5", fallbackLabel: "Purple" },
  { id: "general.magenta", hex: "#e56eee", fallbackLabel: "Magenta" },
  { id: "general.orange", hex: "#f19837", fallbackLabel: "Orange" },
  { id: "general.gray", hex: "#aaaaaa", fallbackLabel: "Gray" },
];

export function getColorName(id: string): string {
  return (Zotero.Prefs.get(`${COLOR_PREF_PREFIX}.${id}`) as string) || "";
}

export function setColorName(id: string, value: string): void {
  Zotero.Prefs.set(`${COLOR_PREF_PREFIX}.${id}`, value.trim());
}

export function getColorEntries(): AnnotationColorEntry[] {
  return DEFAULT_COLORS.map((color) => ({
    ...color,
    label: getColorName(color.id),
  }));
}

export function buildOrderedLabelTuples(): AnnotationLabelTuple[] {
  return DEFAULT_COLORS.map((color) => {
    const label = getColorName(color.id).trim() || color.fallbackLabel;
    return [label, normalizeHex(color.hex)];
  });
}

export function buildHexToLabelMap(): Record<string, string> {
  const entries = getColorEntries();
  return entries.reduce<Record<string, string>>((acc, entry) => {
    acc[normalizeHex(entry.hex)] = entry.label?.trim() || entry.fallbackLabel;
    return acc;
  }, {});
}

export function normalizeHex(input: string): string {
  let value = input.trim().toLowerCase();
  if (!value) {
    return value;
  }
  if (!value.startsWith("#")) {
    value = `#${value}`;
  }
  if (value.length === 4) {
    const [, r, g, b] = value.split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (value.length === 7) {
    return value;
  }
  return value.slice(0, 7);
}
