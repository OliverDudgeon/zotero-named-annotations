/* Copyright 2012 Will Shanks.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Zotero 7+ injects Zotero, Services, Cc, Ci, etc. into the bootstrap scope,
// so no module imports are needed. In Zotero 9 (Firefox 140), the old
// `ChromeUtils.import("resource://gre/modules/Services.jsm")` shim points at
// `Services.sys.mjs`, which no longer exists, so importing it throws and the
// whole bootstrap startup aborts - leaving the plugin "enabled" but inert.

var chromeHandle;

function install(data, reason) {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  await Zotero.initializationPromise;

  // String 'rootURI' introduced in Zotero 7
  if (!rootURI) {
    rootURI = resourceURI.spec;
  }

  var aomStartup = Cc[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Ci.amIAddonManagerStartup);
  var manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ["content", "__addonRef__", rootURI + "chrome/content/"],
    ["locale", "__addonRef__", "en-US", rootURI + "chrome/locale/en-US/"],
    ["locale", "__addonRef__", "zh-CN", rootURI + "chrome/locale/zh-CN/"],
  ]);

  // Global variables for plugin code
  const ctx = {
    rootURI,
  };
  ctx._globalThis = ctx;

  Services.scriptloader.loadSubScript(
    `${rootURI}/chrome/content/scripts/index.js`,
    ctx
  );

  // Await the plugin's onStartup so PreferencePanes.register() completes
  // before Zotero finishes the bootstrap. Without this the registration
  // raced with the user opening Settings; on Zotero 9 the prefs window's
  // init() reads pluginPanes synchronously and the pane was missing.
  try {
    await Zotero.__addonInstance__?.hooks?.onStartup?.();
  } catch (e) {
    Zotero.logError(e);
  }
}

function shutdown({ id, version, resourceURI, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) {
    return;
  }
  Zotero.__addonInstance__?.hooks?.onShutdown?.();

  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}

function uninstall(data, reason) {}
