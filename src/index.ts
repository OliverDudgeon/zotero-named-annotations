import { BasicTool } from "zotero-plugin-toolkit/dist/basic";
import Addon from "./addon";
import { config } from "../package.json";

const basicTool = new BasicTool();

if (!basicTool.getGlobal("Zotero")[config.addonInstance]) {
  _globalThis.Zotero = basicTool.getGlobal("Zotero");
  _globalThis.ZoteroPane = basicTool.getGlobal("ZoteroPane");
  _globalThis.Zotero_Tabs = basicTool.getGlobal("Zotero_Tabs");
  _globalThis.window = basicTool.getGlobal("window");
  _globalThis.document = basicTool.getGlobal("document");
  _globalThis.addon = new Addon();

  const zoteroGlobal = _globalThis.Zotero as typeof Zotero;
  zoteroGlobal[config.addonInstance] = addon;
  zoteroGlobal.__addonInstance__ = addon;

  addon.hooks.onStartup();
}
