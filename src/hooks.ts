import { config } from "../package.json";
import { registerPrefs, unregisterPrefs } from "./modules/prefs";
import {
  applyColorNamesToReader,
  refreshActiveReaderColorNames,
} from "./modules/reader";

async function onStartup() {
  await registerPrefs();
  const notifierID = Zotero.Notifier.registerObserver(
    { notify: onNotify },
    ["tab"]
  );
  addon.data.notifierID = notifierID;

  window.addEventListener(
    "unload",
    () => {
      if (addon.data.notifierID !== undefined) {
        Zotero.Notifier.unregisterObserver(addon.data.notifierID);
        delete addon.data.notifierID;
      }
    },
    false
  );

  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  await refreshActiveReaderColorNames();
}

function onShutdown() {
  unregisterPrefs();
  if (addon.data.notifierID !== undefined) {
    Zotero.Notifier.unregisterObserver(addon.data.notifierID);
    delete addon.data.notifierID;
  }
  addon.data.alive = false;
  delete Zotero[config.addonInstance];
  if (Zotero.__addonInstance__ === addon) {
    delete Zotero.__addonInstance__;
  }
}

async function onNotify(
  event: _ZoteroTypes.Notifier.Event,
  type: _ZoteroTypes.Notifier.Type,
  ids: string[] | number[],
  extraData: Record<string, any>
) {
  if (event !== "select" || type !== "tab") {
    return;
  }
  const firstId = ids[0];
  if (typeof firstId !== "string") {
    return;
  }
  if (extraData?.[firstId]?.type === "reader") {
    const readerTool = addon.data.reader;
    const reader = await readerTool.getReader();
    if (reader) {
      applyColorNamesToReader(reader);
    }
  }
}

export default {
  onStartup,
  onShutdown,
  onNotify,
  refreshActiveReaderColorNames,
};
