import { describe, expect, it } from "vitest";
import {
  isPublicationBibliographyDirective,
  isPublicationReferenceDeclaration,
  publicationBibliographyText,
  publicationCitationEntries,
  publicationCitationText,
  publicationReferenceLabel,
  publicationReferenceLabels,
  replacePublicationTextDirectives,
  type PublicationTextDirective,
} from "./scholarly-export";

describe("scholarly publication projection", () => {
  it("parses complete supported text directives without retaining their attributes", () => {
    const seen: PublicationTextDirective[] = [];
    const projected = replacePublicationTextDirectives(
      'See :cite[doe2026, roe2025]{mode=textual locator="p. 4" prefix="Compare " suffix="."} and :ref[custom label]{target="sec:result"}.',
      (directive) => {
        seen.push(directive);
        return directive.kind === "cite" ? "CITATION" : "REFERENCE";
      },
    );

    expect(projected).toBe("See CITATION and REFERENCE.");
    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({ kind: "cite", content: "doe2026, roe2025" });
    expect(Object.fromEntries(seen[0]!.attributes)).toEqual({
      mode: "textual",
      locator: "p. 4",
      prefix: "Compare ",
      suffix: ".",
    });
    expect(seen[1]).toMatchObject({ kind: "ref", content: "custom label" });
    expect(Object.fromEntries(seen[1]!.attributes)).toEqual({ target: "sec:result" });
    expect(replacePublicationTextDirectives(":unknown[value] and ::anchor[value]", () => "changed")).toBe(
      ":unknown[value] and ::anchor[value]",
    );
  });

  it("normalizes natbib-style citation aliases to citation modes", () => {
    const seen: PublicationTextDirective[] = [];
    expect(
      replacePublicationTextDirectives(":citet[doe2026] and :citep[roe2025] and :citet[full]{mode=full}", (directive) => {
        seen.push(directive);
        return directive.attributes.get("mode") ?? "default";
      }),
    ).toBe("textual and parenthetical and full");
    expect(seen.map((directive) => directive.kind)).toEqual(["cite", "cite", "cite"]);
  });

  it("resolves heading, alias, anchor, custom, and fallback reference labels", () => {
    const markdown = `::alias[Legacy]{target="sec:legacy" slug="results"}

## *Results* {#sec-results}

::anchor[Table one]{target=table:one slug=table-one}`;
    const labels = publicationReferenceLabels(markdown);
    expect(Object.fromEntries(labels)).toEqual({
      "sec-results": "Results",
      "sec:legacy": "Results",
      "table:one": "Table one",
      results: "Results",
    });
    const directive = (content: string, attributes: ReadonlyMap<string, string>): PublicationTextDirective => ({
      kind: "ref",
      content,
      attributes,
    });
    expect(publicationReferenceLabel(directive("sec:legacy", new Map()), labels)).toBe("Results");
    expect(publicationReferenceLabel(directive("custom *label*", new Map([["target", "table:one"]])), labels)).toBe("custom label");
    expect(publicationReferenceLabel(directive("", new Map([["target", "table:one"]])), labels)).toBe("Table one");
    expect(publicationReferenceLabel(directive("unknown", new Map()), labels)).toBe("unknown");
  });

  it("recognizes only complete supported reference declaration lines", () => {
    expect(isPublicationReferenceDeclaration('::alias[Legacy]{target="sec:legacy" slug=legacy}')).toBe(true);
    expect(isPublicationReferenceDeclaration("  ::anchor[Table]{target=table:one}  ")).toBe(true);
    for (const line of ["prefix ::anchor[Table]{target=table:one}", "::include[file.md]", "::unknown[value]{target=x}", "::anchor[x]"]) {
      expect(isPublicationReferenceDeclaration(line), line).toBe(false);
    }
  });

  it("recognizes and formats explicit bibliography placement", () => {
    expect(isPublicationBibliographyDirective("::bibliography[]")).toBe(true);
    expect(isPublicationBibliographyDirective("  ::bibliography[]  ")).toBe(true);
    for (const line of ["::bibliography", "::bibliography[all]", "prefix ::bibliography[]", "::bibliography[]{scope=all}"]) {
      expect(isPublicationBibliographyDirective(line), line).toBe(false);
    }
    const entry = publicationCitationEntries("@article{doe2026, author={Doe, Jane}, title={Methods}, year={2026}}").get("doe2026")!;
    expect(publicationBibliographyText(entry, "apa")).toBe("Doe, Jane (2026). Methods.");
    expect(publicationBibliographyText(entry, "chicago-author-date")).toBe("Doe, Jane. 2026. Methods.");
    expect(publicationBibliographyText(entry, "ieee")).toBe("[1] Doe, Jane, “Methods,” 2026.");
    expect(publicationBibliographyText({ ...entry, author: "", title: "", year: "" }, "apa")).toBe("doe2026 (n.d.). doe2026.");
  });

  it("renders citation metadata through each bounded publication profile", () => {
    const bibliography = publicationCitationEntries(
      "@article{doe2026, author={Doe, Jane}, title={Methods}, year={2026}}\n@article{roe2025, author={Roe, Alex}, title={Results}, year={2025}}",
    );
    const parsed = (source: string): PublicationTextDirective => {
      let directive: PublicationTextDirective | undefined;
      replacePublicationTextDirectives(source, (value) => {
        directive = value;
        return "";
      });
      if (!directive) throw new Error("Expected a publication directive");
      return directive;
    };

    expect(publicationCitationText(parsed(':cite[doe2026, roe2025]{locator="p. 4"}'), bibliography, "apa")).toBe(
      "(Doe, 2026; Roe, 2025), p. 4",
    );
    expect(publicationCitationText(parsed(":cite[doe2026, roe2025]"), bibliography, "chicago-author-date")).toBe("(Doe 2026; Roe 2025)");
    expect(publicationCitationText(parsed(':cite[doe2026]{mode=textual prefix="See " suffix="."}'), bibliography, "ieee")).toBe(
      "See Doe [1].",
    );
    expect(publicationCitationText(parsed(":cite[doe2026]{mode=full}"), bibliography, "apa")).toBe("Doe. 2026. Methods");
    expect(publicationCitationText(parsed(":cite[missing]"), bibliography, "apa")).toBe("(missing, n.d.)");
    expect(publicationCitationText(parsed(":citet[doe2026]"), bibliography, "apa")).toBe("Doe (2026)");
    expect(publicationCitationText(parsed(":citep[doe2026]"), bibliography, "apa")).toBe("(Doe, 2026)");
  });
});
