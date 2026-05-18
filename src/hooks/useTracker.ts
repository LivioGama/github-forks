"use client";

import { usePlausible } from "next-plausible";

export const useTracker = () => {
  const plausible = usePlausible();

  const track = (
    event: string,
    properties?: Record<string, string | number>,
  ) => {
    try {
      plausible(event, properties ? { props: properties } : undefined);
    } catch (e) {
      console.error("[plausible]", e);
    }
  };

  return { track };
};
