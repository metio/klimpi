// SPDX-FileCopyrightText: The Klimpi Authors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { parseKey, parseWork, sameWork, workKey, workRef, workSetOf, workTitle } from "./work";

const same = (one: string, other: string) => sameWork(workTitle(one), workTitle(other));
const key = (composer: string, title: string) => {
    const ref = workRef(composer, title);
    return ref === null ? null : workKey(ref);
};

describe("sameWork", () => {
    it("reads the three Für Elise spellings as one work", () => {
        // The case that exposed this: the catalogue shipped all three as separate rows, and
        // a reader who finds three of one piece concludes the library is broken.
        expect(same("Für Elise", "Fur Elise")).toBe(true);
        expect(same("Für Elise", "Für Elise WoO 59")).toBe(true);
        expect(same("Fur Elise", "Für Elise WoO 59")).toBe(true);
    });

    it("folds an accent, because a transcriber types with the keyboard they have", () => {
        expect(same("Étude", "Etude")).toBe(true);
        expect(same("Sérénade", "Serenade")).toBe(true);
    });

    it("lets a title with no catalogue mark agree with one that has it", () => {
        expect(same("Clair de lune", "Clair de lune L. 32")).toBe(true);
        expect(same("Air on the G String", "Air on the G String BWV 1068")).toBe(true);
    });

    it("never merges two works that carry DIFFERENT catalogue marks", () => {
        // The half that cannot simply be dropped. These are different sets of pieces that
        // happen to share a name, and collapsing them would delete one of them.
        expect(same("Nocturnes Op.27", "Nocturnes Op.9")).toBe(false);
        expect(same("Preludes Op.28", "Preludes Op.23")).toBe(false);
        expect(same("Sonata Hob. XVI:34", "Sonata Hob. XVI:35")).toBe(false);
    });

    it("reads one spelling of a catalogue as another", () => {
        // One number written two ways. The catalogue carries Mozart under both K. and KV.
        // and Scriabin under both Op. and Opus, and each pair was two works.
        expect(same("Sonata K. 331", "Sonata KV 331")).toBe(true);
        expect(same("Préludes opus 16", "Preludes Op. 16")).toBe(true);
        expect(workTitle("Sonate Opus KV 331 - Tema").catalogue).toBe("k 331");
    });

    it("keeps genuinely different names apart", () => {
        expect(same("Prelude in C", "Prelude in D")).toBe(false);
        expect(same("Gymnopédie No. 1", "Gymnopédie No. 2")).toBe(false);
        expect(same("Hungarian Dance No. 5", "Hungarian Rhapsody No. 5")).toBe(false);
    });

    it("reads one punctuation of a number as another", () => {
        expect(same("Nocturne No.2", "Nocturne No. 2")).toBe(true);
        expect(same("Prelude  in   C", "Prelude in C")).toBe(true);
    });

    it("does not mistake an ordinary word for a catalogue letter", () => {
        // "D", "S", "B" and "L" are catalogue prefixes AND ordinary words. Only a letter
        // followed by a number is a mark.
        expect(workTitle("Song of the Birds").catalogue).toBeNull();
        expect(workTitle("D'un vieux jardin").catalogue).toBeNull();
        expect(workTitle("Le Mère l'Oye").catalogue).toBeNull();
    });

    it("pulls the mark out where there is one", () => {
        expect(workTitle("Für Elise WoO 59").catalogue).toBe("woo 59");
        expect(workTitle("Die Forelle D.550").catalogue).toBe("d 550");
        expect(workTitle("Sonata Hob. XVI:34").catalogue).toBe("hob xvi34");
    });

    it("reads a mark naming a span of works as naming none of them", () => {
        // "3 Minuets BWV 841-843" is the collection. Filing it under BWV 841 would put
        // three minuets inside the first of them.
        expect(workTitle("3 Minuets BWV 841-843").catalogue).toBeNull();
        expect(workRef("J.S. Bach", "3 Minuets BWV 841-843")).toBeNull();
    });

    it("matches nothing to a title that is nothing at all", () => {
        // An empty name is not evidence that two rows are one piece.
        expect(same("", "")).toBe(false);
        expect(same("   ", "Für Elise")).toBe(false);
    });
});

describe("workRef", () => {
    it("resolves the three transcriptions of one Gnossienne to one key", () => {
        // The case that motivated the layer: the catalogue grades these 1, 5 and 6, and a
        // teacher asking for the piece gets whichever row the search happens to return.
        expect(key("Erik Satie", "Gnossienne n°1")).toBe("erik-satie/gnossienne/1");
        expect(key("Erik Satie(1866 – 1925)", "Gnossienne No. 1")).toBe("erik-satie/gnossienne/1");
        expect(key("Erik Satie", "Gnossienne No. 1")).toBe("erik-satie/gnossienne/1");
    });

    it("prefers the catalogue mark over the name as the set", () => {
        expect(key("F. Chopin", "Nocturne in E minor Op.72 No.1")).toBe("frederic-chopin/op-72/1");
        expect(key("J.S. Bach", "Fantasia BWV 944")).toBe("johann-sebastian-bach/bwv-944");
    });

    it("reads a member number written without the word", () => {
        // Each of these is how one corpus or another writes it, and all three sit beside a
        // catalogue mark, which is what makes a bare number safe to read as the member.
        expect(key("A. Scriabin", "Préludes opus 16 - 4.")).toBe("alexander-scriabin/op-16/4");
        expect(key("J.B.Duvernoy", "Etude 2, Op 176")).toBe("jean-baptiste-duvernoy/op-176/2");
        expect(key("W. A. Mozart", "Sonate Opus KV 331 - Variation 3")).toBe(
            "wolfgang-amadeus-mozart/k-331/3",
        );
        expect(key("F. Chopin", "Valse Op51 n6")).toBe("frederic-chopin/op-51/6");
    });

    it("does not read a count in front of a word as a member number", () => {
        // "25 Études faciles et progressives Op.100" is the whole book, not its 25th study.
        expect(key("Friedrich Burgmüller", "25 Études faciles et progressives Op.100")).toBe(
            "johann-friedrich-franz-burgmuller/op-100",
        );
    });

    it("reads the numeral a set lists its own parts under", () => {
        // Arabic and roman both, and in front of the part's name rather than behind it.
        expect(key("Gabriel Fauré", "Dolly, Op. 56: 4. Kitty-valse")).toBe("gabriel-faure/op-56/4");
        expect(key("Edvard Grieg", "Holberg Suite, Op. 40: III. Gavotte")).toBe(
            "edvard-grieg/op-40/3",
        );
    });

    it("needs no catalogue mark for a part listed under a separator", () => {
        // The shape carries the number on its own: a numeral behind the separator and in
        // front of a period and the part's name is not a year, a key or a count. Debussy's
        // suite has no opus on any of its four rows and resolves from this alone.
        expect(key("Claude Debussy", "Suite bergamasque: I. Prélude")).toBe(
            "claude-debussy/suite-bergamasque/1",
        );
        expect(key("Claude Debussy", "Suite bergamasque: IV. Passepied")).toBe(
            "claude-debussy/suite-bergamasque/4",
        );
    });

    it("takes the set from in front of the separator, not from the part behind it", () => {
        // Two parts of one suite, which have to reduce to one set: naming the set after the
        // whole title would file every movement as a book of its own.
        expect(workSetOf(key("Claude Debussy", "Suite bergamasque: II. Menuet") ?? "")).toBe(
            workSetOf(key("Claude Debussy", "Suite bergamasque: III. Clair de lune") ?? ""),
        );
        expect(workSetOf(key("Claude Debussy", "Suite bergamasque: II. Menuet") ?? "")).toBe(
            "claude-debussy/suite-bergamasque",
        );
    });

    it("does not read a roman numeral that spells nothing as a member", () => {
        expect(workRef("Claude Debussy", "Suite bergamasque: iiii. Menuet")).toBeNull();
    });

    it("reads a bare number only beside a catalogue mark", () => {
        // With no mark there is nothing to say the number is an ordinal rather than a key,
        // a year or a count, so the title names no work and a ruling decides.
        expect(workRef("Erik Satie", "Gymnopédie 1")).toBeNull();
        expect(workRef("Traditional", "Air for 2 hands")).toBeNull();
    });

    it("names no work for a title that is only a name", () => {
        // Burgmüller's op. 100 arrives this way, every study under its character title and
        // nothing anywhere saying which opus it belongs to. Fifteen of these need a ruling.
        expect(workRef("Johann Friedrich Franz Burgmüller", "La Candeur")).toBeNull();
        expect(workRef("Johann Friedrich Franz Burgmüller", "l'Arabesque")).toBeNull();
    });

    it("names no work where the composer is unknown", () => {
        expect(workRef("", "Nocturne Op.9 No.2")).toBeNull();
    });
});

describe("parseWork", () => {
    it("reads a syllabus line, which is what the key exists for", () => {
        expect(parseWork("Burgmüller: 25 leichte Etüden op. 100, Nr. 2")).toEqual({
            composer: "johann-friedrich-franz-burgmuller",
            set: "op-100",
            number: 2,
        });
        expect(parseWork("Bach, Johann Sebastian: Invention BWV 772")).toEqual({
            composer: "johann-sebastian-bach",
            set: "bwv-772",
            number: null,
        });
    });

    it("refuses a line with no separator, instead of guessing where the name ends", () => {
        expect(parseWork("Burgmüller op. 100 Nr. 2")).toBeNull();
    });
});

describe("workKey", () => {
    it("reads a key back", () => {
        expect(parseKey("johann-friedrich-franz-burgmuller/op-100/7")).toEqual({
            composer: "johann-friedrich-franz-burgmuller",
            set: "op-100",
            number: 7,
        });
        expect(parseKey("erik-satie/gnossienne")).toEqual({
            composer: "erik-satie",
            set: "gnossienne",
            number: null,
        });
    });

    it("refuses text that is not a key, so a typo cannot become a work", () => {
        for (const bad of [
            "",
            "burgmuller",
            "Burgmuller/op-100",
            "burgmuller/op 100",
            "burgmuller/op-100/0",
            "burgmuller/op-100/seven",
            "burgmuller/op-100/7/extra",
            "burgmuller//7",
            "-burgmuller/op-100",
        ]) {
            expect(parseKey(bad), bad).toBeNull();
        }
    });

    it("makes a set the prefix of every member of it", () => {
        const member = "johann-friedrich-franz-burgmuller/op-100/7";
        expect(workSetOf(member)).toBe("johann-friedrich-franz-burgmuller/op-100");
        expect(member.startsWith(`${workSetOf(member)}/`)).toBe(true);
        expect(workSetOf("johann-friedrich-franz-burgmuller/op-100")).toBe(
            "johann-friedrich-franz-burgmuller/op-100",
        );
        expect(workSetOf("not a key")).toBe("");
    });

    it("writes nothing for a reference that names nobody or nothing", () => {
        expect(workKey({ composer: "", set: "op-100", number: 7 })).toBe("");
        expect(workKey({ composer: "erik-satie", set: "", number: null })).toBe("");
    });
});
