// SPDX-FileCopyrightText: The Klimpi Authors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { resolveWorks, type Song, type WorkCuration } from "./bake-works.mts";

const song = (id: string, title: string, composer: string): Song => ({ id, title, composer });

const curation = (over: Partial<WorkCuration> = {}): WorkCuration => ({
    aliases: {},
    sets: [],
    rulings: {},
    ...over,
});

const burgmuller: WorkCuration["sets"][number] = {
    key: "johann-friedrich-franz-burgmuller/op-100",
    composer: "burgm",
    least: 2,
    members: [
        { number: 2, title: "Arabesque" },
        { number: 7, title: "limpid|Courant Limpide" },
    ],
};

describe("resolveWorks", () => {
    it("reads a work off a title that carries one", () => {
        const { works, problems } = resolveWorks(curation(), [
            song("a", "Nocturne in E minor Op.72 No.1", "F. Chopin"),
            song("b", "La Candeur", "Johann Friedrich Franz Burgmüller"),
        ]);
        expect(problems).toEqual([]);
        // The second says nothing that identifies a work, so it holds none rather than
        // holding a guess.
        expect(works).toEqual({ a: "frederic-chopin/op-72/1" });
    });

    it("gathers the transcriptions of one work under one key", () => {
        // The case the index exists for: three readings of one piece, graded 1, 5 and 6,
        // and a teacher asking for it gets whichever the search returns first.
        const { works } = resolveWorks(curation(), [
            song("one", "Gnossienne n°1", "Erik Satie"),
            song("two", "Gnossienne No. 1", "Erik Satie(1866 – 1925)"),
            song("three", "Gnossienne No. 2", "Erik Satie"),
        ]);
        expect(works).toEqual({
            one: "erik-satie/gnossienne/1",
            three: "erik-satie/gnossienne/2",
            two: "erik-satie/gnossienne/1",
        });
    });

    it("renames a derived set without losing which member each row is", () => {
        // Czerny's eight-bar exercises arrive titled for the book rather than for its
        // opus, so the derivation finds the set under its name. One line re-keys all of
        // them, and a row that named no member still names none.
        const { works, problems } = resolveWorks(
            curation({
                aliases: {
                    "carl-czerny/160-eight-measure-exercises": "carl-czerny/op-821",
                    "johann-sebastian-bach/bwv-846": "johann-sebastian-bach/bwv-846-869",
                },
            }),
            [
                song("a", "160 Eight-Measure Exercises, No. 18", "C. Czerny"),
                song("b", "160 Eight-Measure Exercises n 3", "C. Czerny"),
                song("c", "Das wohltemperierte Klavier BWV 846", "J.S. Bach"),
            ],
        );
        expect(problems).toEqual([]);
        expect(works).toEqual({
            a: "carl-czerny/op-821/18",
            b: "carl-czerny/op-821/3",
            c: "johann-sebastian-bach/bwv-846-869",
        });
    });

    it("fails an alias that renames a set nothing derives any more", () => {
        // Renaming nothing succeeds perfectly, which is why it has to be an error.
        const { problems } = resolveWorks(
            curation({ aliases: { "carl-czerny/gone": "carl-czerny/op-821" } }),
            [song("a", "Nocturne Op.9 No.2", "F. Chopin")],
        );
        expect(problems).toEqual([
            'alias "carl-czerny/gone" renames a set no title derives any more',
        ]);
    });

    it("names the set a title cannot name itself", () => {
        // Sixteen rows of Burgmüller's op. 100 under French character titles, with no opus
        // anywhere on any of them. One number arrives twice, in two languages.
        const { works, problems } = resolveWorks(curation({ sets: [burgmuller] }), [
            song("arabesque", "l'Arabesque", "Johann Friedrich Franz Burgmüller"),
            song("english", "The limpid stream", "Friedrich Burgmüller"),
            song("french", "Le Courant Limpide", "Johann Friedrich Franz Burgmüller"),
        ]);
        expect(problems).toEqual([]);
        expect(works).toEqual({
            arabesque: "johann-friedrich-franz-burgmuller/op-100/2",
            english: "johann-friedrich-franz-burgmuller/op-100/7",
            french: "johann-friedrich-franz-burgmuller/op-100/7",
        });
    });

    it("fails a set that has stopped describing the catalogue", () => {
        const { problems } = resolveWorks(curation({ sets: [burgmuller] }), [
            song("arabesque", "l'Arabesque", "Johann Friedrich Franz Burgmüller"),
        ]);
        expect(problems).toEqual([
            'set "johann-friedrich-franz-burgmuller/op-100" resolves to 1 rows, fewer than the 2 it needs',
        ]);
    });

    it("lets a ruling overrule what the title and the set both say", () => {
        const { works, problems } = resolveWorks(
            curation({
                sets: [burgmuller],
                rulings: {
                    derived: "ludwig-van-beethoven/op-67",
                    arabesque: "johann-friedrich-franz-burgmuller/op-100/25",
                },
            }),
            [
                song("derived", "Simfonia n. 5 - Beethoven", "Beethoven"),
                song("arabesque", "l'Arabesque", "Johann Friedrich Franz Burgmüller"),
                song("other", "limpid", "Burgmüller"),
            ],
        );
        expect(problems).toEqual([]);
        expect(works.derived).toBe("ludwig-van-beethoven/op-67");
        expect(works.arabesque).toBe("johann-friedrich-franz-burgmuller/op-100/25");
    });

    it("fails a ruling for a piece the catalogue no longer holds", () => {
        const { problems } = resolveWorks(
            curation({ rulings: { gone: "ludwig-van-beethoven/op-67" } }),
            [song("a", "Nocturne Op.9 No.2", "F. Chopin")],
        );
        expect(problems).toEqual(["ruling for gone names a piece the catalogue no longer holds"]);
    });

    it("refuses every shape of key that is not one", () => {
        const { problems } = resolveWorks(
            curation({
                aliases: { "not a key": "carl-czerny/op-821" },
                sets: [
                    { ...burgmuller, key: "burgmuller/op-100/7" },
                    { ...burgmuller, key: "Burgmuller/Op 100" },
                ],
                rulings: { a: "ludwig-van-beethoven" },
            }),
            [song("a", "Nocturne Op.9 No.2", "F. Chopin")],
        );
        expect(problems).toEqual([
            'alias: "not a key" is not a work key',
            'set "burgmuller/op-100/7" names a member rather than a set',
            'set: "Burgmuller/Op 100" is not a work key',
            'ruling for a: "ludwig-van-beethoven" is not a work key',
        ]);
    });

    it("writes the index by id, so a committed file diffs by what changed", () => {
        const { works } = resolveWorks(curation(), [
            song("zzz", "Nocturne Op.9 No.2", "F. Chopin"),
            song("aaa", "Prelude Op.28 No.4", "F. Chopin"),
        ]);
        expect(Object.keys(works)).toEqual(["aaa", "zzz"]);
    });
});
