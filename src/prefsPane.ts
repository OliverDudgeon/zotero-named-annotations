import {
  DEFAULT_COLORS,
  getColorName,
  setColorName,
} from "./modules/annotationNames";
import { refreshActiveReaderColorNames } from "./modules/reader";

const logError = (error: unknown) => {
  try {
    const normalized = error instanceof Error ? error : new Error(String(error));
    Zotero.logError(normalized);
  } catch (_err) {
    // Ignore logging errors in case Zotero isn't available yet
  }
};

const renderAnnotationNamePrefs = (doc: Document) => {
  const container = doc.querySelector("#annotation-name-list") as HTMLElement | null;
  if (!container) {
    doc.defaultView?.setTimeout(() => renderAnnotationNamePrefs(doc), 50);
    return;
  }

  container.replaceChildren();

  DEFAULT_COLORS.forEach((color) => {
    const row = doc.createElement("div");

    const swatch = doc.createElement("span");
    swatch.style.backgroundColor = color.hex;
    swatch.style.display = "inline-block";
    swatch.style.width = "18px";
    swatch.style.height = "18px";
    swatch.style.borderRadius = "4px";
    swatch.style.border = "1px solid rgba(0, 0, 0, 0.2)";

    const fallbackLabel = doc.createElement("span");
    fallbackLabel.style.display = "inline-block";
    fallbackLabel.style.minWidth = "72px";
    fallbackLabel.style.margin = "0 8px";
    fallbackLabel.textContent = color.fallbackLabel;

    const input = doc.createElement("input");
    input.type = "text";
    input.value = getColorName(color.id);
    input.placeholder = color.fallbackLabel;
    input.style.flex = "1";
    input.style.padding = "4px 8px";

    const clearButton = doc.createElement("button");
    clearButton.type = "button";
    clearButton.textContent = "Clear";

    const commitChange = async () => {
      setColorName(color.id, input.value);
      await refreshActiveReaderColorNames();
    };

    input.addEventListener("input", () => {
      setColorName(color.id, input.value);
    });
    input.addEventListener("change", commitChange);
    input.addEventListener("blur", commitChange);

    clearButton.addEventListener("click", async () => {
      if (!input.value) {
        return;
      }
      input.value = "";
      setColorName(color.id, "");
      await refreshActiveReaderColorNames();
    });

    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.padding = "6px 0";
    row.style.borderBottom = "1px solid rgba(0, 0, 0, 0.1)";

    row.appendChild(swatch);
    row.appendChild(fallbackLabel);
    row.appendChild(input);
    row.appendChild(clearButton);

    container.appendChild(row);
  });
};

const mountPreferences = async () => {
  try {
    renderAnnotationNamePrefs(document);
  } catch (error) {
    const container = document.querySelector("#annotation-name-list");
    if (container) {
      container.textContent = "Unable to load annotation colors.";
    }
    logError(error);
  }
};

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", () => {
    mountPreferences();
  });
} else {
  mountPreferences();
}
