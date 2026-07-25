import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

if (Element.prototype.scrollIntoView === undefined) {
  Element.prototype.scrollIntoView = () => undefined;
}

if (globalThis.ResizeObserver === undefined) {
  globalThis.ResizeObserver = class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

afterEach(() => {
  cleanup();
});
