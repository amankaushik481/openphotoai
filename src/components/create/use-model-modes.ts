"use client";

import * as React from "react";
import { useModels } from "@/hooks/use-models";
import { modelModesFrom, type IdentityMode } from "./logic";

/**
 * Identity mode per model id from the models list (`IdentityModelDTO.mode`); `fallback` covers ids
 * the list doesn't have (yet). Also returns the list itself (undefined while loading).
 */
export function useModelModes(fallback?: Readonly<Record<string, IdentityMode>>) {
  const { models } = useModels();
  const modes = React.useMemo(() => modelModesFrom(models, fallback), [models, fallback]);
  return { modes, models };
}
