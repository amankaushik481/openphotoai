/**
 * Phones only get "Select all loaded" through the selection bar's "More actions" menu (the bar's own
 * "Select all" button is sm+ only), so that menu must open before anything is selected.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SelectionBar, type SelectionBarProps } from "@/components/gallery/selection-bar";

function moreActionsButton(props: Partial<SelectionBarProps>): string {
  const html = renderToStaticMarkup(
    <SelectionBar
      count={0}
      total={6}
      allSelected={false}
      onSelectAll={() => undefined}
      onClear={() => undefined}
      onExit={() => undefined}
      busy={null}
      onAction={async () => undefined}
      onDownload={async () => undefined}
      {...props}
    />,
  );
  const button = html.match(/<button[^>]*aria-label="More actions"[^>]*>/)?.[0];
  expect(button).toBeDefined();
  return button!;
}

describe("SelectionBar", () => {
  it("keeps More actions usable with nothing selected, so phones can select all", () => {
    expect(moreActionsButton({ count: 0 })).not.toMatch(/\sdisabled=""/);
  });

  it("disables More actions while a bulk action runs or when there is nothing to select", () => {
    expect(moreActionsButton({ count: 2, busy: "hide" })).toMatch(/\sdisabled=""/);
    expect(moreActionsButton({ total: 0 })).toMatch(/\sdisabled=""/);
  });
});
