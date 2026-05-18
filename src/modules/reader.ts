import {
  DEFAULT_COLORS,
  buildHexToLabelMap,
  getColorName,
  normalizeHex,
} from "./annotationNames";

const WINDOW_STATE_KEY = "__zoteroNamedAnnotationsState";

// Fluent message IDs that the Zotero reader uses for the default annotation
// colors. The reader's createColorContextMenu resolves them via
// reader._getString(label), which delegates to the bundled FluentBundle.
const FLUENT_COLOR_IDS: Record<string, string> = {
  "#ffd400": "general-yellow",
  "#ff6666": "general-red",
  "#5fb236": "general-green",
  "#2ea8e5": "general-blue",
  "#a28ae5": "general-purple",
  "#e56eee": "general-magenta",
  "#f19837": "general-orange",
  "#aaaaaa": "general-gray",
};

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
  installGetStringPatch(win, reader, buildFluentOverrides());

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

function buildFluentOverrides(): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const color of DEFAULT_COLORS) {
    const hex = normalizeHex(color.hex);
    const fluentId = FLUENT_COLOR_IDS[hex];
    if (!fluentId) {
      continue;
    }
    const label = getColorName(color.id).trim();
    if (label) {
      overrides[fluentId] = label;
    }
  }
  return overrides;
}

// Override _getString on the internal Reader so context-menu.js's
// `colors.map(([label, color]) => ({ label: reader._getString(label), ... }))`
// returns our custom labels. Patches both the live instance (so the change
// is visible immediately on a refresh) and window.createReader (so future
// reader instances created in this window get the patch too).
function installGetStringPatch(
  win: ReaderWindow,
  reader: _ZoteroTypes.ReaderInstance,
  fluentOverrides: Record<string, string>
): void {
  try {
    const evalFn = (win as any).eval;
    if (typeof evalFn === "function") {
      evalFn(buildGetStringPatchSource(JSON.stringify(fluentOverrides)));
    }
  } catch (error) {
    logError(error);
  }

  try {
    const internalReader = (reader as any)?._internalReader;
    if (
      internalReader &&
      typeof internalReader._getString === "function" &&
      !internalReader.__zoteroNamedAnnotationsPatched
    ) {
      const original = internalReader._getString.bind(internalReader);
      internalReader.__zoteroNamedAnnotationsOverrides = fluentOverrides;
      internalReader._getString = function (name: string, args: unknown) {
        const o = internalReader.__zoteroNamedAnnotationsOverrides || {};
        if (name && Object.prototype.hasOwnProperty.call(o, name)) {
          return o[name];
        }
        return original(name, args);
      };
      internalReader.__zoteroNamedAnnotationsPatched = true;
    } else if (internalReader?.__zoteroNamedAnnotationsPatched) {
      // Refresh the override table so live edits take effect without
      // recreating the patch closure.
      internalReader.__zoteroNamedAnnotationsOverrides = fluentOverrides;
    }
  } catch (error) {
    logError(error);
  }
}

function buildGetStringPatchSource(serializedOverrides: string): string {
  return `
    (function() {
      const overrides = ${serializedOverrides};
      const FLAG = "__zoteroNamedAnnotationsPatched";

      function patch(reader) {
        if (!reader) return;
        if (reader[FLAG]) {
          reader.__zoteroNamedAnnotationsOverrides = overrides;
          return;
        }
        if (typeof reader._getString !== "function") return;
        const original = reader._getString.bind(reader);
        reader.__zoteroNamedAnnotationsOverrides = overrides;
        reader._getString = function (name, args) {
          const o = reader.__zoteroNamedAnnotationsOverrides || {};
          if (name && Object.prototype.hasOwnProperty.call(o, name)) {
            return o[name];
          }
          return original(name, args);
        };
        reader[FLAG] = true;
      }

      if (window._reader) {
        patch(window._reader);
      }
      if (typeof window.createReader === "function" && !window.createReader.__zoteroNamedAnnotationsHooked) {
        const orig = window.createReader;
        const hooked = function (options) {
          const reader = orig.call(this, options);
          patch(window._reader || reader);
          return reader;
        };
        hooked.__zoteroNamedAnnotationsHooked = true;
        window.createReader = hooked;
      }
    })();
  `;
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
