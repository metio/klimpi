// SPDX-FileCopyrightText: The Klimpi Authors
// SPDX-License-Identifier: AGPL-3.0-or-later

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseKey, sameWork, workKey, workRef, workSetOf, workTitle } from "./work";

// The laws the key has to obey for a curation file and a syllabus lookup to agree about
// what a work is. A key is written down by hand in one place and derived from a title in
// another, so the two have to produce the same string for the same work and no string at
// all for the same non-work.

const arbSlug = fc.stringMatching(/^[a-z][a-z0-9]{0,6}(-[a-z0-9]{1,6}){0,3}$/);
const arbRef = fc.record({
    composer: arbSlug,
    set: arbSlug,
    number: fc.option(fc.integer({ min: 1, max: 999 }), { nil: null }),
});

const arbTitle = fc.oneof(
    fc.constantFrom(
        "Gnossienne No. 1",
        "Nocturne in E minor Op.72 No.1",
        "La Candeur",
        "Étude 2, Op 176",
        "3 Minuets BWV 841-843",
        "Sonata Hob. XVI:34",
        "",
    ),
    fc.string({ maxLength: 40 }),
);
const arbComposer = fc.oneof(
    fc.constantFrom("Erik Satie", "F. Chopin", "J.S. Bach", "Traditional", ""),
    fc.string({ maxLength: 30 }),
);

describe("the work key", () => {
    it("reads back exactly what it wrote", () => {
        fc.assert(
            fc.property(arbRef, (ref) => {
                expect(parseKey(workKey(ref))).toEqual(ref);
            }),
        );
    });

    it("gives every member of a set the set as its prefix", () => {
        fc.assert(
            fc.property(arbRef, (ref) => {
                const key = workKey(ref);
                const set = workKey({ ...ref, number: null });
                expect(workSetOf(key)).toBe(set);
                expect(key.startsWith(set)).toBe(true);
            }),
        );
    });

    it("derives one key from one row, however often it is asked", () => {
        // The bake runs on every catalogue change and the result is committed, so a
        // derivation that wobbled would show up as a diff nobody made.
        fc.assert(
            fc.property(arbComposer, arbTitle, (composer, title) => {
                expect(workRef(composer, title)).toEqual(workRef(composer, title));
            }),
        );
    });

    it("writes a well-formed key whenever it names a work at all", () => {
        fc.assert(
            fc.property(arbComposer, arbTitle, (composer, title) => {
                const ref = workRef(composer, title);
                if (ref === null) {
                    return;
                }
                const key = workKey(ref);
                expect(key).not.toBe("");
                expect(parseKey(key)).toEqual(ref);
            }),
        );
    });

    it("holds sameWork to being reflexive and symmetric", () => {
        fc.assert(
            fc.property(arbTitle, arbTitle, (one, other) => {
                const a = workTitle(one);
                const b = workTitle(other);
                expect(sameWork(a, b)).toBe(sameWork(b, a));
                expect(sameWork(a, a)).toBe(a.name !== "");
            }),
        );
    });

    it("never lets the catalogue mark decide a work on its own", () => {
        // Two different names are two works whatever their marks say, which is what keeps
        // an unnumbered mark from swallowing the catalogue.
        fc.assert(
            fc.property(arbTitle, arbTitle, (one, other) => {
                const a = workTitle(one);
                const b = workTitle(other);
                if (a.name !== b.name) {
                    expect(sameWork(a, b)).toBe(false);
                }
            }),
        );
    });
});
