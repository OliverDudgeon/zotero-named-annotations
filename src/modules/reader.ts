import {
  AnnotationLabelTuple,
  buildHexToLabelMap,
  buildOrderedLabelTuples,
  normalizeHex,
} from "./annotationNames";

const WINDOW_STATE_KEY = "__zoteroNamedAnnotationsState";
const COLOR_SCRIPT_ID = "__zoteroNamedAnnotationsColors";
const COLOR_SCRIPT_ATTR = "data-zotero-named-annotation-colors";
const COLOR_PATCH_STATE_KEY = "__zoteroNamedAnnotationsColorPatch";
const LEGACY_GLOBAL_KEY = "_annotationColors";

type ReaderWindow = Window & typeof globalThis & {
  [WINDOW_STATE_KEY]?: ReaderWindowState;
};

interface ReaderWindowState {
  observer?: MutationObserver;
  intervalId?: number;
}

const logError = (error: unknown) => {
  const normalized = error instanceof Error ? error : new Error(String(error));
  Zotero.logError?.(normalized);
};

export async function refreshActiveReaderColorNames(): Promise<void> {
  try {
    const readerInstance = addon.data.reader;
    const reader = await readerInstance.getReader();
    if (reader) {
      applyColorNamesToReader(reader);
    }
  } catch (error) {
    logError(error);
  }
}

export function applyColorNamesToReader(reader: _ZoteroTypes.ReaderInstance): void {
  const win = getReaderWindow(reader);
  if (!win) {
    return;
  }

  if (!win.document || !win.document.body) {
    win.addEventListener(
      "DOMContentLoaded",
      () => {
        applyColorNamesToReader(reader);
      },
      { once: true }
    );
    return;
  }

  teardownWindowState(win);

  const colorMap = buildHexToLabelMap();
  const orderedTuples = buildOrderedLabelTuples();
  injectAnnotationColorOverrides(win, orderedTuples);
  const applyTooltips = () => annotatePalette(win, colorMap);
  applyTooltips();

  const observer = new win.MutationObserver(applyTooltips);
  observer.observe(win.document.body, { childList: true, subtree: true });

  const intervalId = win.setInterval(applyTooltips, 2000);

  win[WINDOW_STATE_KEY] = {
    observer,
    intervalId,
  };

  win.addEventListener(
    "unload",
    () => {
      teardownWindowState(win);
    },
    { once: true }
  );
}

function teardownWindowState(win: ReaderWindow) {
  const state = win[WINDOW_STATE_KEY];
  if (!state) {
    return;
  }
  state.observer?.disconnect();
  if (state.intervalId) {
    win.clearInterval(state.intervalId);
  }
  delete win[WINDOW_STATE_KEY];
}

function annotatePalette(win: Window, colorMap: Record<string, string>) {
  const buttons = collectColorButtons(win.document);
  buttons.forEach((button) => {
    const hex = extractColorHex(win, button);
    if (!hex) {
      return;
    }
    const label = colorMap[hex];
    if (!label) {
      return;
    }
    if (button.getAttribute("title") !== label) {
      button.setAttribute("title", label);
    }
    button.setAttribute("aria-label", label);
  });
}

function injectAnnotationColorOverrides(
  win: ReaderWindow,
  tuples: AnnotationLabelTuple[]
): void {
  const doc = win.document;
  if (!doc) {
    return;
  }
  const serialized = JSON.stringify(tuples);
  const existingScript = doc.getElementById(COLOR_SCRIPT_ID);
  const scriptMatches = existingScript?.getAttribute(COLOR_SCRIPT_ATTR) === serialized;
  if (!scriptMatches) {
    existingScript?.remove();
    const script = doc.createElement("script");
    script.id = COLOR_SCRIPT_ID;
    script.type = "text/javascript";
    script.setAttribute(COLOR_SCRIPT_ATTR, serialized);
    script.textContent = buildColorOverrideSource(serialized);
    const appendTarget = doc.head || doc.documentElement || doc.body;
    appendTarget?.appendChild(script);
  }

  setLegacyWindowColors(win, tuples);
}

function buildColorOverrideSource(serializedTuples: string): string {
  return `
    (function() {
      const STATE_KEY = "${COLOR_PATCH_STATE_KEY}";
      const DATA = ${serializedTuples};
      const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

      const normalize = (tuple) => [
        String(tuple[0] || ""),
        String(tuple[1] || "").toLowerCase()
      ];

      const normalized = Array.isArray(DATA) ? DATA.map(normalize) : [];

      const isAnnotationTuple = (value) =>
        Array.isArray(value) &&
        value.length === 2 &&
        typeof value[0] === "string" &&
        typeof value[1] === "string" &&
        HEX_PATTERN.test(value[1]);

      const shouldPatch = (value) =>
        Array.isArray(value) &&
        value.length > 0 &&
        value.every(isAnnotationTuple);

      if (window[STATE_KEY] && typeof window[STATE_KEY].cleanup === "function") {
        window[STATE_KEY].cleanup();
      }

      const originalMap = Array.prototype.map;

      const patched = function() {
        if (shouldPatch(this)) {
          this.length = normalized.length;
          for (let i = 0; i < normalized.length; i++) {
            this[i] = [normalized[i][0], normalized[i][1]];
          }
        }
        return originalMap.apply(this, arguments);
      };

      const cleanup = () => {
        if (Array.prototype.map === patched) {
          Array.prototype.map = originalMap;
        }
        window.removeEventListener("unload", cleanup);
        delete window[STATE_KEY];
      };

      Array.prototype.map = patched;
      window[STATE_KEY] = { cleanup };
      window.addEventListener("unload", cleanup, { once: true });
    })();
  `;
}

function setLegacyWindowColors(
  win: ReaderWindow,
  tuples: AnnotationLabelTuple[]
): void {
  try {
    const sanitized = JSON.stringify(tuples);
    if (typeof win.eval === "function") {
      win.eval(`window.${LEGACY_GLOBAL_KEY} = ${sanitized}`);
    } else {
      (win as any)[LEGACY_GLOBAL_KEY] = tuples;
    }
  } catch (error) {
    logError(error);
  }
}

function collectColorButtons(doc: Document): HTMLElement[] {
  const selectors = [
    "button[data-color]",
    "button[color]",
    "button.annotation-color",
    "button[class*='annotation-toolbar-color']",
    "button.grid-tile",
  ];
  const nodes = new Set<HTMLElement>();
  selectors.forEach((selector) => {
    doc.querySelectorAll(selector).forEach((el) => {
      if (el instanceof doc.defaultView!.HTMLElement) {
        nodes.add(el as HTMLElement);
      }
    });
  });
  return Array.from(nodes);
}

function extractColorHex(win: Window, element: HTMLElement): string | null {
  const colorAttr = element.getAttribute("data-color") || element.getAttribute("color");
  if (colorAttr) {
    return normalizeHex(colorAttr);
  }
  const inlineColor = element.style.backgroundColor;
  if (inlineColor) {
    return normalizeCssColor(inlineColor);
  }
  const computedStyles = win.getComputedStyle?.(element);
  if (!computedStyles) {
    return null;
  }
  const computed = computedStyles.getPropertyValue("background-color");
  return normalizeCssColor(computed);
}

function normalizeCssColor(value: string): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) {
    return normalizeHex(trimmed);
  }
  const rgbMatch = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgbMatch) {
    return null;
  }
  const [r, g, b] = rgbMatch.slice(1, 4).map((component) => {
    return Number(component).toString(16).padStart(2, "0");
  });
  return `#${r}${g}${b}`.toLowerCase();
}

function getReaderWindow(reader: _ZoteroTypes.ReaderInstance): ReaderWindow | undefined {
  const internalReader = (reader as any)?._internalReader;
  const possibleWindows = [
    (reader as any)?._iframeWindow,
    internalReader?._primaryView?._iframeWindow,
    internalReader?._lastView?._iframeWindow,
  ];

  for (const candidate of possibleWindows) {
    if (candidate) {
      return (candidate.wrappedJSObject as ReaderWindow) || candidate;
    }
  }

  return undefined;
}
