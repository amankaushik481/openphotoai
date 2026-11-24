/** Curated one-click instructions for the Edit tab, per edit kind. */
import type { EDIT_KINDS } from "@/types/domain";

export type EditKind = (typeof EDIT_KINDS)[number];

export interface EditPreset {
  /** Chip label. */
  label: string;
  /** Instruction sent to the edit job (slots into the kind's server-side template). */
  instruction: string;
}

export interface EditKindInfo {
  label: string;
  /** Textarea label for this kind. */
  prompt: string;
  placeholder: string;
}

export const EDIT_KIND_INFO: Record<EditKind, EditKindInfo> = {
  outfit: { label: "Outfit", prompt: "New outfit", placeholder: "e.g. a charcoal blazer over a white t-shirt" },
  background: { label: "Background", prompt: "New background", placeholder: "e.g. a bright, modern office with plants" },
  hair: { label: "Hair", prompt: "New hairstyle", placeholder: "e.g. shoulder-length hair with soft waves" },
  expression: { label: "Expression", prompt: "New expression", placeholder: "e.g. a relaxed, friendly smile" },
  custom: { label: "Anything", prompt: "Describe the change", placeholder: "e.g. add thin gold-rimmed glasses" },
};

export const EDIT_PRESETS: Record<EditKind, readonly EditPreset[]> = {
  outfit: [
    { label: "Navy suit", instruction: "a tailored navy suit with a crisp white shirt" },
    { label: "Smart casual", instruction: "a fitted knit sweater over a collared shirt" },
    { label: "Black turtleneck", instruction: "a slim black turtleneck" },
    { label: "Linen shirt", instruction: "a light beige linen shirt" },
    { label: "Leather jacket", instruction: "a black leather jacket over a plain white t-shirt" },
    { label: "Denim jacket", instruction: "a classic blue denim jacket over a grey t-shirt" },
  ],
  background: [
    { label: "Studio grey backdrop", instruction: "a seamless mid-grey studio backdrop with soft, even lighting" },
    { label: "Soft white backdrop", instruction: "a clean, softly lit white studio backdrop" },
    { label: "Modern office", instruction: "a bright modern office, softly out of focus" },
    { label: "City at golden hour", instruction: "a city street at golden hour, softly out of focus" },
    { label: "Beach at sunset", instruction: "a calm beach at sunset, softly out of focus" },
    { label: "Library", instruction: "warm wooden bookshelves in a quiet library, softly out of focus" },
  ],
  hair: [
    { label: "Short fade haircut", instruction: "a short, neat fade haircut" },
    { label: "Shoulder-length waves", instruction: "shoulder-length hair with soft natural waves" },
    { label: "Slicked back", instruction: "neatly slicked-back hair" },
    { label: "Natural curls", instruction: "defined natural curls" },
    { label: "Sleek bun", instruction: "hair pulled back into a sleek low bun" },
    { label: "Buzz cut", instruction: "a short, even buzz cut" },
  ],
  expression: [
    { label: "Warm smile", instruction: "a warm, natural smile with teeth showing slightly" },
    { label: "Confident smile", instruction: "a confident, closed-mouth smile" },
    { label: "Laughing", instruction: "a genuine, candid laugh" },
    { label: "Serious", instruction: "a calm, serious and focused look" },
    { label: "Approachable", instruction: "a relaxed, approachable expression with soft eyes" },
  ],
  custom: [
    { label: "Add glasses", instruction: "add thin black-rimmed glasses" },
    { label: "Remove glasses", instruction: "remove the glasses" },
    { label: "Golden hour light", instruction: "relight the photo with warm golden-hour sunlight" },
    { label: "Studio lighting", instruction: "relight the photo with soft, flattering studio lighting" },
    { label: "Tidy flyaway hair", instruction: "tidy up flyaway hairs while keeping the hairstyle" },
  ],
};

/** Quick picks for the Brush tab: what to paint into the brushed area. */
export const BRUSH_PRESETS: readonly EditPreset[] = [
  { label: "Remove it", instruction: "clean background that continues the surroundings, with nothing in front of it" },
  { label: "Natural hand", instruction: "a natural, relaxed hand with five well-formed fingers" },
  { label: "Smooth fabric", instruction: "smooth, wrinkle-free fabric matching the rest of the outfit" },
  { label: "Tidy hair", instruction: "neat hair that matches the rest of the hairstyle" },
  { label: "Sunglasses", instruction: "stylish dark sunglasses" },
];

/** Images per edit job offered in the UI. */
export const EDIT_COUNTS = [1, 2] as const;
/** Images per pose-copy job offered in the UI. */
export const POSE_COUNTS = [1, 2, 3, 4] as const;
