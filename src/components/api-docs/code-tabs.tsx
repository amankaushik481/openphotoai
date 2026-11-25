"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeBlock } from "./primitives";
import type { CodeSampleSet } from "./quickstart";

/** Language tabs for code samples. Every panel is server-rendered (hidden when inactive) for search + no-JS. */
export function CodeTabs({ samples, label }: { samples: CodeSampleSet[]; label: string }) {
  return (
    <Tabs defaultValue={samples[0]?.id} className="min-w-0 gap-0">
      <TabsList
        aria-label={label}
        className="h-auto gap-0 rounded-[3px] rounded-b-none bg-darkroom-raised p-0 text-darkroom-muted"
      >
        {samples.map((s) => (
          <TabsTrigger
            key={s.id}
            value={s.id}
            className="h-9 rounded-none border-0 border-b-2 border-transparent px-4 font-mono text-[11px] tracking-[0.14em] text-darkroom-muted uppercase outline-darkroom-safelight [--focus-offset:-2px] hover:text-darkroom-foreground data-[state=active]:border-darkroom-safelight data-[state=active]:bg-darkroom data-[state=active]:text-darkroom-foreground data-[state=active]:shadow-none pointer-coarse:h-11 dark:text-darkroom-muted dark:data-[state=active]:border-darkroom-safelight dark:data-[state=active]:bg-darkroom dark:data-[state=active]:text-darkroom-foreground"
          >
            {s.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {samples.map((s) => (
        <TabsContent key={s.id} value={s.id} forceMount className="min-w-0 data-[state=inactive]:hidden">
          <div className="[&>div]:rounded-tl-none">
            <CodeBlock code={s.code} label={s.label} language={s.language} />
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
