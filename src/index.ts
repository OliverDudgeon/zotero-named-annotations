import { BasicTool } from "zotero-plugin-toolkit/dist/basic";
import Addon from "./addon";
import { config } from "../package.json";

const basicTool = new BasicTool();

if (!basicTool.getGlobal("Zotero")[config.addonInstance]) {
  _globalThis.Zotero = basicTool.getGlobal("Zotero");
  _globalThis.window = basicTool.getGlobal("window");
  _globalThis.addon = new Addon();

  const zoteroGlobal = _globalThis.Zotero as typeof Zotero;
  zoteroGlobal[config.addonInstance] = addon;
  zoteroGlobal.__addonInstance__ = addon;

  // onStartup is awaited from bootstrap.js so the preference pane
  // registration completes inside the bootstrap promise that Zotero awaits.
}
