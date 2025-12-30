// Test setup for Vitest
import { beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';

// Extend global interface for JSDOM types
declare global {
  var window: Window & typeof globalThis;
  var document: Document;
  var navigator: Navigator;
  var Image: typeof window.Image;
  var FileReader: typeof window.FileReader;
  var URL: typeof window.URL;
  var Blob: typeof window.Blob;
  var File: typeof window.File;
}

// Setup JSDOM environment
beforeAll(() => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost',
  });
  
  // Make JSDOM globals available in Node
  global.window = dom.window as unknown as Window & typeof globalThis;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.Image = dom.window.Image;
  global.FileReader = dom.window.FileReader;
  global.URL = dom.window.URL;
  global.Blob = dom.window.Blob;
  global.File = dom.window.File;
});
