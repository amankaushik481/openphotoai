import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Slider } from "@/components/ui/slider";

const thumbs = (html: string) => html.match(/<span[^>]*role="slider"[^>]*>/g) ?? [];

describe("Slider accessible names", () => {
  it("defaults the thumb name to 'Value'", () => {
    const [thumb] = thumbs(renderToStaticMarkup(<Slider defaultValue={[10]} />));
    expect(thumb).toContain('aria-label="Value"');
  });

  it("forwards aria-label / aria-labelledby to the thumb", () => {
    expect(thumbs(renderToStaticMarkup(<Slider defaultValue={[10]} aria-label="Brush size" />))[0]).toContain(
      'aria-label="Brush size"',
    );
    const labelled = thumbs(renderToStaticMarkup(<Slider defaultValue={[10]} aria-labelledby="brush-label" />))[0]!;
    expect(labelled).toContain('aria-labelledby="brush-label"');
    expect(labelled).not.toContain("aria-label=");
  });

  it("names each thumb of a range slider", () => {
    const html = renderToStaticMarkup(<Slider defaultValue={[10, 90]} thumbLabels={["Minimum", "Maximum"]} />);
    const [min, max] = thumbs(html);
    expect(min).toContain('aria-label="Minimum"');
    expect(max).toContain('aria-label="Maximum"');
  });
});
