"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeBlock } from "./primitives";
import type { CodeSampleSet } from "./quickstart";

/** Language tabs for code samples. Every panel is server-rendered (hidden when inactive) for search + no-JS. */
export function CodeTabs({ samples, label }: { samples: CodeSampleSet[]; label: string }) {
  return (
    <Tabs defaultValue={samples[0]?.id} className="min-w-0">
      <TabsList aria-label={label}>
        {samples.map((s) => (
          <TabsTrigger key={s.id} value={s.id} className="px-3">
            {s.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {samples.map((s) => (
        <TabsContent key={s.id} value={s.id} forceMount className="min-w-0 data-[state=inactive]:hidden">
          <CodeBlock code={s.code} label={s.label} language={s.language} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
