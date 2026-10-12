"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * False during server render and hydration, true afterwards. Use it for output
 * that depends on the reader's clock or time zone, so hydration never mismatches.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
