// src/renderer/electron-api.d.ts
import type { PreloadElectronAPI } from "../preload/index";

export {};

declare global {
  interface Window {
    electronAPI: PreloadElectronAPI;
  }
}
