"use client";

import * as React from "react";
import { ContrastIcon, FocusIcon, LightbulbIcon, LoaderCircleIcon, PlusIcon, Undo2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PROMPT_HELPER_MAX_LENGTH,
  PROMPT_HELPER_MIN_LENGTH,
  PROMPT_MAX_LENGTH,
  appendToPrompt,
  classifySuggestion,
  describeApiError,
  pushHistory,
  type SuggestionAction,
} from "@/components/create/logic";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface PromptHelperResponse {
  prompt: string;
  negativePrompt?: string;
  suggestions?: string[];
}

export interface PromptFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Sent to the prompt helper so it words the prompt for this model's subject. */
  modelId?: string | null;
  label?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  /** Ctrl/Cmd+Enter. */
  onSubmitShortcut?: () => void;
  /** Example requests offered as one-tap starters while the field is empty. */
  starters?: readonly string[];
  className?: string;
}

/** Prompt textarea with a character count and the "Improve" prompt helper (suggestion chips + undo). */
export function PromptField({
  id,
  value,
  onChange,
  modelId,
  label = "Prompt",
  placeholder = "e.g. me on a yacht at sunset, linen shirt, relaxed smile",
  hint,
  required = false,
  onSubmitShortcut,
  starters,
  className,
}: PromptFieldProps) {
  const fallbackId = React.useId();
  const fieldId = id ?? fallbackId;
  const countId = `${fieldId}-count`;
  const hintId = `${fieldId}-hint`;
  const [history, setHistory] = React.useState<string[]>([]);
  const [suggestions, setSuggestions] = React.useState<SuggestionAction[]>([]);
  const [improving, setImproving] = React.useState(false);
  const [helperError, setHelperError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState("");

  const trimmed = value.trim();
  const tooShort = trimmed.length < PROMPT_HELPER_MIN_LENGTH;
  const tooLong = trimmed.length > PROMPT_HELPER_MAX_LENGTH;
  const nearLimit = value.length > PROMPT_MAX_LENGTH * 0.9;
  const showHint = Boolean(hint) || value.includes("{subject}");

  /** Replace the prompt, keeping the old text on the undo stack. */
  const replaceWith = (next: string) => {
    setHistory((h) => pushHistory(h, value));
    onChange(next.slice(0, PROMPT_MAX_LENGTH));
  };

  async function improve() {
    if (tooShort || tooLong || improving) return;
    setImproving(true);
    setHelperError(null);
    try {
      const res = await api<PromptHelperResponse>("/api/prompt-helper", {
        method: "POST",
        body: { request: trimmed, ...(modelId ? { modelId } : {}) },
      });
      replaceWith(res.prompt);
      setSuggestions((res.suggestions ?? []).map(classifySuggestion).slice(0, 4));
      setStatus("Prompt improved. You can undo it.");
    } catch (err) {
      const e = describeApiError(err);
      setHelperError(e.code === "content_blocked" ? `${e.message} ${e.hint ?? ""}`.trim() : e.message);
    } finally {
      setImproving(false);
    }
  }

  function undo() {
    const prev = history[history.length - 1];
    if (prev === undefined) return;
    setHistory((h) => h.slice(0, -1));
    onChange(prev);
    setStatus("Undone.");
  }

  function applySuggestion(s: SuggestionAction) {
    if (s.kind === "tip") return;
    replaceWith(s.kind === "append" ? appendToPrompt(value, s.text) : s.text);
    setSuggestions((list) => list.filter((x) => x !== s));
    setStatus(s.kind === "append" ? `Added “${s.text}”.` : "Prompt replaced with the suggestion. You can undo it.");
  }

  function applyStarter(text: string) {
    onChange(text);
    setStatus(`Added “${text}”. Edit it, or press Improve for a detailed prompt.`);
    document.getElementById(fieldId)?.focus();
  }

  const chips = suggestions.filter((s) => s.kind !== "tip");
  const tips = suggestions.filter((s) => s.kind === "tip");
  const helperHint = tooLong
    ? `The helper works on requests up to ${PROMPT_HELPER_MAX_LENGTH} characters.`
    : tooShort
      ? "Write a few words, then press Improve: the helper turns them into a detailed prompt."
      : undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-end justify-between gap-2">
        <Label htmlFor={fieldId} className="font-mono text-[0.6875rem] tracking-[0.16em] text-muted-foreground uppercase">
          {label}
          {required && <span className="sr-only"> (required)</span>}
        </Label>
        <span
          id={countId}
          className={cn("font-mono text-[0.625rem] tracking-[0.08em] text-muted-foreground tabular-nums", nearLimit && "text-warning")}
        >
          {value.length.toLocaleString("en-US")}/{PROMPT_MAX_LENGTH.toLocaleString("en-US")}
        </span>
      </div>
      <Textarea
        id={fieldId}
        value={value}
        required={required}
        maxLength={PROMPT_MAX_LENGTH}
        rows={4}
        placeholder={placeholder}
        aria-describedby={showHint ? `${countId} ${hintId}` : countId}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmitShortcut) {
            e.preventDefault();
            onSubmitShortcut();
          }
        }}
        className="max-h-72 min-h-24 resize-y"
      />
      {starters && starters.length > 0 && !trimmed && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Try:</span>
          {starters.map((text) => (
            <button
              key={text}
              type="button"
              onClick={() => applyStarter(text)}
              className="inline-flex max-w-full items-center truncate rounded-xs border border-foreground/20 bg-background px-2.5 py-1 text-xs transition-colors hover:border-foreground/50 hover:bg-foreground/[0.04] pointer-coarse:min-h-9 pointer-coarse:px-3"
            >
              {text}
            </button>
          ))}
        </div>
      )}
      {showHint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {value.includes("{subject}") ? "{subject} is replaced with you. " : ""}
          {hint}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={improve}
          // aria-disabled (not `disabled`) keeps it focusable so the reason (helper hint) can be read.
          aria-disabled={improving || tooShort || tooLong || undefined}
          className="aria-disabled:opacity-50"
          aria-describedby={helperHint ? `${fieldId}-helper` : undefined}
        >
          {improving ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : <FocusIcon aria-hidden="true" className="text-safelight-ink" />}
          {improving ? "Improving…" : "Improve"}
        </Button>
        {history.length > 0 && (
          <Button type="button" size="sm" variant="ghost" onClick={undo}>
            <Undo2Icon aria-hidden="true" />
            Undo
          </Button>
        )}
        {helperHint && (
          <span id={`${fieldId}-helper`} className="text-xs text-muted-foreground">
            {helperHint}
          </span>
        )}
      </div>

      {helperError && (
        <p role="alert" className="text-xs text-destructive">
          {helperError}
        </p>
      )}

      {chips.length > 0 && (
        <ul aria-label="Prompt suggestions" className="flex flex-wrap gap-1.5">
          {chips.map((s) => (
            <li key={`${s.kind}:${s.text}`} className="min-w-0 max-w-full">
              <button
                type="button"
                onClick={() => applySuggestion(s)}
                title={s.text}
                aria-label={s.kind === "append" ? `Add “${s.text}” to the prompt` : `Use suggested prompt: ${s.text}`}
                className="inline-flex max-w-full items-center gap-1 truncate rounded-xs border border-foreground/20 bg-background px-2.5 py-1 text-xs transition-colors hover:border-foreground/50 hover:bg-foreground/[0.04] pointer-coarse:min-h-9 pointer-coarse:px-3"
              >
                {s.kind === "append" ? (
                  <PlusIcon aria-hidden="true" className="size-3 shrink-0 text-safelight-ink" />
                ) : (
                  <ContrastIcon aria-hidden="true" className="size-3 shrink-0 text-safelight-ink" />
                )}
                <span className="truncate">{s.kind === "append" ? s.text : s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {tips.length > 0 && (
        <ul aria-label="Tips" className="flex flex-col gap-1">
          {tips.map((s) => (
            <li key={s.text} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <LightbulbIcon aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
              {s.text}
            </li>
          ))}
        </ul>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    </div>
  );
}
