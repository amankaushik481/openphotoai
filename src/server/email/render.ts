/** Render a template to subject + HTML + plain text. */
import { render } from "@react-email/render";
import { createElement, type ReactElement } from "react";
import { EMAIL_COMPONENTS, EMAIL_SUBJECTS } from "@/emails";
import type { EmailTemplateName, EmailTemplates } from "./index";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Keep headings in their original case in the plain-text version (html-to-text uppercases them by default). */
const plainTextOptions = {
  selectors: [
    { selector: "h1", options: { uppercase: false } },
    { selector: "h2", options: { uppercase: false } },
  ],
};

export async function renderEmail<T extends EmailTemplateName>(template: T, props: EmailTemplates[T]): Promise<RenderedEmail> {
  // The mapped registry types can't be correlated with the generic T by TypeScript.
  const component = EMAIL_COMPONENTS[template] as unknown as (p: EmailTemplates[T]) => ReactElement;
  const subjectOf = EMAIL_SUBJECTS[template] as (p: EmailTemplates[T]) => string;
  const element = createElement(component, props);
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true, htmlToTextOptions: plainTextOptions }),
  ]);
  // Subjects are a single header line: never let user-provided values inject line breaks.
  const subject = subjectOf(props).replace(/[\r\n\t]+/g, " ").trim();
  return { subject, html, text: text.trim() };
}
