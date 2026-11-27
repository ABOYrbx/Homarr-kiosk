import { describe, expect, it } from "vitest";

import { isIdleBackgroundTarget, isIdleInteractiveTarget, isIdleOverlayInteractiveTarget } from "./carousel-gesture";

describe("idle carousel gesture targets", () => {
  it("accepts clock, music and empty layer backgrounds", () => {
    const surface = document.createElement("div");
    const content = document.createElement("div");
    surface.append(content);

    expect(isIdleBackgroundTarget(surface)).toBe(true);
    expect(isIdleBackgroundTarget(content)).toBe(true);
  });

  it("ignores every gesture that starts inside a widget slot", () => {
    const slot = document.createElement("div");
    slot.setAttribute("data-idle-widget-slot", "");
    const content = document.createElement("div");
    slot.append(content);

    expect(isIdleBackgroundTarget(slot)).toBe(false);
    expect(isIdleBackgroundTarget(content)).toBe(false);
  });

  it.each([
    ["button", document.createElement("button")],
    ["input", document.createElement("input")],
    ["textarea", document.createElement("textarea")],
    ["select", document.createElement("select")],
    ["link", document.createElement("a")],
    ["iframe", document.createElement("iframe")],
    ["editable", document.createElement("div")],
    ["focusable control", document.createElement("div")],
    ["draggable control", document.createElement("div")],
    ["slider", document.createElement("div")],
  ])("ignores interactive %s targets", (_name, target) => {
    if (target instanceof HTMLAnchorElement) target.href = "https://example.com";
    if (_name === "editable") target.setAttribute("contenteditable", "true");
    if (_name === "focusable control") target.tabIndex = 0;
    if (_name === "draggable control") target.draggable = true;
    if (_name === "slider") target.setAttribute("role", "slider");
    const child = document.createElement("span");
    target.append(child);

    expect(isIdleInteractiveTarget(target)).toBe(true);
    expect(isIdleInteractiveTarget(child)).toBe(true);
    expect(isIdleBackgroundTarget(target)).toBe(false);
    expect(isIdleBackgroundTarget(child)).toBe(false);
  });
});

describe("idle carousel keyboard targets", () => {
  it("does not exclude an interactive settings target outside the overlay", () => {
    const button = document.createElement("button");
    const child = document.createElement("span");
    button.append(child);

    expect(isIdleOverlayInteractiveTarget(button)).toBe(false);
    expect(isIdleOverlayInteractiveTarget(child)).toBe(false);
  });

  it("excludes interactive controls inside the overlay", () => {
    const overlay = document.createElement("div");
    overlay.setAttribute("data-idle-screen", "");
    const button = document.createElement("button");
    const child = document.createElement("span");
    button.append(child);
    overlay.append(button);

    expect(isIdleOverlayInteractiveTarget(button)).toBe(true);
    expect(isIdleOverlayInteractiveTarget(child)).toBe(true);
  });

  it("does not exclude non-interactive overlay backgrounds", () => {
    const overlay = document.createElement("div");
    overlay.setAttribute("data-idle-screen", "");
    const background = document.createElement("div");
    overlay.append(background);

    expect(isIdleOverlayInteractiveTarget(overlay)).toBe(false);
    expect(isIdleOverlayInteractiveTarget(background)).toBe(false);
  });
});
