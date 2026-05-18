import { config } from "../../package.json";
let registeredPaneID: string | undefined;

const logError = (error: unknown) => {
  const message =
    error instanceof Error
      ? `${error.message}\n${error.stack ?? ""}`
      : String(error);
  // Loud logging: registerPrefs failures used to vanish silently and present
  // as "no settings option for the plugin". Surface them in the Zotero log so
  // future regressions are diagnosable from a user's report.
  try {
    Zotero.debug(`[${config.addonName}] registerPrefs failed: ${message}`);
  } catch (_err) {
    // ignore
  }
  const normalized = error instanceof Error ? error : new Error(String(error));
  Zotero.logError(normalized);
};

export async function registerPrefs(): Promise<void> {
  try {
    if (registeredPaneID) {
      return;
    }

    // Use rootURI for every URI so registration doesn't depend on
    // chrome://<addonRef>/ being registered via bootstrap's
    // aomStartup.registerChrome call. rootURI is provided by Zotero's plugin
    // loader and always resolves correctly via Zotero.Plugins.resolveURI.
    const paneOptions = {
      pluginID: config.addonID,
      id: `${config.addonRef}-prefs`,
      src: `${rootURI}chrome/content/preferences.xhtml`,
      label: config.addonName,
      image: `${rootURI}chrome/content/icons/logo-96x96.png`,
      scripts: [`${rootURI}chrome/content/scripts/prefsPane.js`],
    } as _ZoteroTypes._PreferencePaneOption;

    Zotero.debug(
      `[${config.addonName}] Registering preference pane: ${JSON.stringify({
        ...paneOptions,
        scripts: paneOptions.scripts,
      })}`
    );

    registeredPaneID = await Zotero.PreferencePanes.register(paneOptions);

    Zotero.debug(
      `[${config.addonName}] Preference pane registered with ID: ${registeredPaneID}`
    );
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
