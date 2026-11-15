import { describe, expect, it } from 'vitest';
import { clampSidebarWidth, PLAYER_MIN_WIDTH, SIDEBAR_MIN_WIDTH } from './sidebarWidth';

describe('clampSidebarWidth', () => {
  it('keeps a width that leaves the player its room', () => {
    expect(clampSidebarWidth(500.4, 1600)).toBe(500);
  });

  it('stops at the narrowest panel and at the room the player needs', () => {
    expect(clampSidebarWidth(100, 1600)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clampSidebarWidth(5000, 1600)).toBe(1600 - PLAYER_MIN_WIDTH);
  });

  it('never goes below the narrowest panel, even in a window too small for both', () => {
    expect(clampSidebarWidth(600, 800)).toBe(SIDEBAR_MIN_WIDTH);
  });
});
