import type { ManuscriptOutline, ManuscriptOutlineParagraph } from "../../domain/manuscript/manuscript-map";
import { outlineSummaryLimits, type ModelProvider } from "../assistant/model-provider";

type SummaryProvider = Pick<ModelProvider, "summarizeOutline">;

interface Section {
  readonly key: string;
  readonly title: string;
  readonly from: number;
  readonly ownTo: number;
  readonly to: number;
  readonly paragraphs: readonly ManuscriptOutlineParagraph[];
  readonly children: readonly string[];
  readonly ownVersion: string;
  readonly treeVersion: string;
}

interface ProseResult {
  readonly version: string;
  readonly paragraphs: ReadonlyMap<number, string | null>;
  /** Null when an input could not be summarized. */
  readonly summaries: readonly string[] | null;
}

interface SectionResult {
  readonly version: string;
  readonly summary: string | null;
}

interface SummaryPlan {
  readonly prose: readonly Section[];
  readonly headings: readonly Section[];
}

/** Owns only the disposable reading view. The outline tree still owns all source navigation. */
export class OutlineSummaries {
  private sections = new Map<string, Section>();
  private paragraphRows = new Map<number, { section: Section; index: number }>();
  private prose = new Map<string, ProseResult>();
  private headings = new Map<string, SectionResult>();
  private abort: AbortController | null = null;
  private provider: SummaryProvider | null = null;
  failed = false;

  constructor(private readonly onChange: () => void) {}

  get busy(): boolean {
    return this.abort !== null;
  }

  get available(): boolean {
    return this.sections.size > 0;
  }

  get hasStale(): boolean {
    return [...this.sections.values()].some((section) => this.isStale(section.key));
  }

  setProvider(provider: SummaryProvider | null): void {
    if (this.provider === provider) return;
    this.provider = provider;
    this.reset();
  }

  setOutline(source: string, outline: ManuscriptOutline, keys: ReadonlyMap<number, string>): void {
    const roots = outline.items.filter((item) => item.kind === "paragraph");
    const firstHeading = outline.sections[0]?.from ?? source.length;
    const sections = new Map<string, Section>();
    const add = (
      key: string,
      title: string,
      from: number,
      ownTo: number,
      to: number,
      paragraphs: readonly ManuscriptOutlineParagraph[],
      children: readonly string[],
    ): void => {
      sections.set(key, {
        key,
        title,
        from,
        ownTo,
        to,
        paragraphs,
        children,
        ownVersion: JSON.stringify([title, ...paragraphs.map(({ text }) => text)]),
        treeVersion: source.slice(from, to),
      });
    };
    if (roots.length) add("", "", 0, firstHeading, firstHeading, roots, []);
    for (const section of outline.sections) {
      const paragraphs = section.children.filter((item) => item.kind === "paragraph");
      const children = section.children.flatMap((item) => (item.kind === "section" ? [keys.get(item.from)!] : []));
      add(keys.get(section.from)!, section.title, section.from, section.to, section.subtreeTo, paragraphs, children);
    }
    // Empty branches cannot produce content and should not block a parent summary.
    for (const section of [...sections.values()].reverse()) {
      if (!section.paragraphs.length && !section.children.some((key) => sections.has(key))) sections.delete(section.key);
    }
    this.sections = sections;
    this.paragraphRows = new Map(
      [...sections.values()].flatMap((section) => section.paragraphs.map((item, index) => [item.from, { section, index }])),
    );
    for (const key of this.prose.keys()) if (!sections.has(key)) this.prose.delete(key);
    for (const key of this.headings.keys()) if (!sections.has(key)) this.headings.delete(key);
  }

  paragraph(from: number): string | null {
    const row = this.paragraphRows.get(from);
    return row ? (this.currentProse(row.section)?.paragraphs.get(row.index) ?? null) : null;
  }

  heading(key: string): string | null {
    const section = this.sections.get(key);
    const result = this.headings.get(key);
    return section && result?.version === section.treeVersion ? result.summary : null;
  }

  isStale(key: string): boolean {
    const section = this.sections.get(key);
    if (!section) return false;
    const prose = this.prose.get(key);
    const heading = this.headings.get(key);
    return Boolean((prose && prose.version !== section.ownVersion) || (heading && heading.version !== section.treeVersion));
  }

  cancel(): void {
    if (!this.abort) return;
    this.abort.abort();
    this.abort = null;
    this.onChange();
  }

  reset(): void {
    this.cancel();
    this.prose.clear();
    this.headings.clear();
    this.failed = false;
    this.onChange();
  }

  async generate(activeOffset: number | null, sectionKey?: string): Promise<void> {
    if (this.busy || !this.provider || !this.available) return;
    const plan = this.plan(activeOffset, sectionKey);
    if (!plan) return;
    const abort = new AbortController();
    const provider = this.provider;
    this.abort = abort;
    this.failed = false;
    this.onChange();
    try {
      await this.run(plan, provider, abort.signal);
    } catch {
      if (!abort.signal.aborted) this.failed = true;
    } finally {
      if (this.abort === abort) {
        this.abort = null;
        this.onChange();
      }
    }
  }

  private plan(activeOffset: number | null, sectionKey: string | undefined): SummaryPlan | null {
    const section = sectionKey === undefined ? undefined : this.sections.get(sectionKey);
    if (sectionKey !== undefined && !section) return null;
    const all = [...this.sections.values()];
    const selected = section ? all.filter((item) => item.from >= section.from && item.from < section.to) : all;
    const active =
      selected.find((item) => activeOffset !== null && item.from <= activeOffset && activeOffset < item.ownTo) ??
      selected.find((item) => item.paragraphs.at(-1)?.to === activeOffset);
    const prose = active ? [active, ...selected.filter((item) => item !== active)] : selected;
    const headings = all.filter((item) => !section || selected.includes(item) || (item.from < section.from && item.to >= section.to));
    return { prose, headings: headings.filter((item) => item.key).reverse() };
  }

  private async run(plan: SummaryPlan, provider: SummaryProvider, signal: AbortSignal): Promise<void> {
    for (const item of plan.prose) {
      if (signal.aborted) return;
      await this.generateProse(item, provider, signal);
      if (signal.aborted) return;
      if (item.children.length === 0) this.useLeafSummary(item);
      this.onChange();
    }
    for (const item of plan.headings) {
      if (signal.aborted) return;
      await this.generateHeading(item, provider, signal);
      this.onChange();
    }
  }

  private currentProse(section: Section): ProseResult | undefined {
    const result = this.prose.get(section.key);
    return result?.version === section.ownVersion ? result : undefined;
  }

  private async generateProse(section: Section, provider: SummaryProvider, signal: AbortSignal): Promise<void> {
    const current = (): boolean => !signal.aborted && this.sections.get(section.key)?.ownVersion === section.ownVersion;
    if (!current() || this.currentProse(section)) return;
    const eligible = section.paragraphs.flatMap(({ text }, index) => (text.length <= outlineSummaryLimits.entry ? [{ text, index }] : []));
    const summaries: string[] = [];
    const paragraphs = new Map<number, string | null>();
    let complete = eligible.length === section.paragraphs.length;
    for (const batch of proseBatches(eligible)) {
      if (!current()) return;
      const result = await provider.summarizeOutline(
        { kind: "prose", sectionTitle: section.title.slice(0, outlineSummaryLimits.title), entries: batch.map(({ text }) => text) },
        { signal },
      );
      batch.forEach(({ index }, position) => paragraphs.set(index, result.paragraphs[position] ?? null));
      if (result.summary) summaries.push(result.summary);
      else complete = false;
    }
    if (current()) this.prose.set(section.key, { version: section.ownVersion, paragraphs, summaries: complete ? summaries : null });
  }

  private useLeafSummary(section: Section): void {
    const prose = this.currentProse(section);
    if (!prose || this.sections.get(section.key)?.treeVersion !== section.treeVersion) return;
    if (prose.summaries && prose.summaries.length > 1) return;
    this.headings.set(section.key, { version: section.treeVersion, summary: prose.summaries?.[0] ?? null });
  }

  private async generateHeading(section: Section, provider: SummaryProvider, signal: AbortSignal): Promise<void> {
    const current = (): boolean => !signal.aborted && this.sections.get(section.key)?.treeVersion === section.treeVersion;
    if (!current() || this.headings.get(section.key)?.version === section.treeVersion) return;
    const prose = this.currentProse(section);
    if (!prose && section.paragraphs.length) return;
    const children = section.children
      .filter((key) => this.sections.has(key))
      .map((key) => ({
        section: this.sections.get(key),
        result: this.headings.get(key),
      }));
    if (children.some(({ section: child, result }) => !result || result.version !== child?.treeVersion)) return;
    const entries = [...(prose?.summaries ?? []), ...children.flatMap(({ result }) => (result?.summary ? [result.summary] : []))];
    const complete = prose?.summaries !== null && children.every(({ result }) => result?.summary);
    const summary = complete ? await synthesizeSection(section.title, entries, provider, signal, current) : null;
    if (current()) this.headings.set(section.key, { version: section.treeVersion, summary });
  }
}

function* proseBatches<T extends { readonly text: string }>(paragraphs: readonly T[]): Generator<readonly T[]> {
  let batch: T[] = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    if (batch.length === outlineSummaryLimits.entries || length + paragraph.text.length > outlineSummaryLimits.prose) {
      yield batch;
      batch = [];
      length = 0;
    }
    batch.push(paragraph);
    length += paragraph.text.length;
  }
  if (batch.length) yield batch;
}

async function synthesizeSection(
  title: string,
  entries: readonly string[],
  provider: SummaryProvider,
  signal: AbortSignal,
  current: () => boolean,
): Promise<string | null> {
  let remaining = entries;
  while (remaining.length > 0) {
    const combined: string[] = [];
    for (let index = 0; index < remaining.length; index += outlineSummaryLimits.entries) {
      if (!current()) return null;
      const { summary } = await provider.summarizeOutline(
        {
          kind: "summaries",
          sectionTitle: title.slice(0, outlineSummaryLimits.title),
          entries: remaining.slice(index, index + outlineSummaryLimits.entries),
        },
        { signal },
      );
      if (summary === null) return null;
      combined.push(summary);
    }
    if (combined.length === 1) return combined[0] ?? null;
    remaining = combined;
  }
  return null;
}
