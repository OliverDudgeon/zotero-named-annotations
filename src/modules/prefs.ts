import { config } from "../../package.json";
let registeredPaneID: string | undefined;

const logError = (error: unknown) => {
  const normalized = error instanceof Error ? error : new Error(String(error));
  Zotero.logError(normalized);
};

export async function registerPrefs(): Promise<void> {
  try {
    if (registeredPaneID) {
      return;
    }

    const paneOptions = {
      pluginID: config.addonID,
      id: `${config.addonRef}-prefs`,
      src: `${rootURI}chrome/content/preferences.xhtml`,
      label: config.addonName,
      image: `chrome://${config.addonRef}/content/icons/favicon@32x32.png`,
      scripts: [`chrome://${config.addonRef}/content/scripts/prefsPane.js`],
    } as _ZoteroTypes._PreferencePaneOption;

    registeredPaneID = await Zotero.PreferencePanes.register(paneOptions);
  } catch (error) {
    logError(error);
  }
}

export function unregisterPrefs(): void {
  if (!registeredPaneID) {
    return;
  }
  try {
    Zotero.PreferencePanes.unregister(registeredPaneID);
  } catch (error) {
    logError(error);
  } finally {
    registeredPaneID = undefined;
  }
}
