// SPDX-FileCopyrightText: The Klimpi Authors
// SPDX-License-Identifier: AGPL-3.0-or-later

// With the extension, on purpose: this module is read by plain node from the catalogue
// tooling, which resolves nothing it is not told.
import { personSlug } from "./person.ts";
import { slugify } from "./slug.ts";

// Which work a piece is, as a key that a catalogue row and a line of syllabus text can
// both be reduced to.
//
// Nothing the catalogue already holds answers this. `core/songId.ts` fingerprints the
// notes, so two transcriptions of one piece are two unrelated ids; `core/person.ts`
// canonicalises the credit and strips a work number off it as noise, because "Bartók
// Béla, Sz. 107" is one composer and not two; and the title is whatever a transcriber
// typed. Sixteen rows sit under French character titles — La Candeur, l'Arabesque, La
// Pastorale — with nothing on any of them saying they are Burgmüller's op. 100, while a
// German syllabus names every entry it lists by its opus.
//
// A key is readable text, `johann-friedrich-franz-burgmuller/op-100/7`, because the
// lookup that matters starts from prose and has to BUILD the key. A hash could only be
// looked up, which is the direction that was never hard.
//
// The set is the identity and the number refines it, so `…/op-100` names the book and
// `…/op-100/7` one study in it, and a search for the book is a string prefix of every
// study in it. That is also what absorbs a title stating its ordinal twice over: "Piano
// Sonata No. 11 K. 331" is K. 331, the two readings differ by the suffix alone, and the
// prefix still finds both.

// The name with its accents folded and its punctuation flattened — a transcriber types
// with whatever keyboard they have, and "Fur" and "Für" are one piece — beside the
// catalogue mark, held apart from it.
export type WorkTitle = {
    name: string;
    // The mark, normalised to one spelling per catalogue ("woo 59", "op 27"), or null
    // where the title has none.
    catalogue: string | null;
};

// A work, as the key names it.
export type WorkRef = {
    // The composer's slug, spelled as core/person.ts spells it.
    composer: string;
    // The set: the catalogue mark where the title carries one ("op-100", "bwv-846"),
    // otherwise the slugged name the number belongs to ("gnossienne").
    set: string;
    // Which member of the set, where the title says which.
    number: number | null;
};

// Catalogues that write one thing two ways. Köchel is "K." and "KV." for the same
// number, and an opus is "Op." and "Opus"; left alone, Mozart's K. 331 and KV 331 are
// two works and Scriabin's op. 16 sits apart from his opus 16.
const SPELLINGS: Record<string, string> = { opus: "op", kv: "k" };

// A catalogue mark: a known prefix, then a number that may be arabic (BWV 1068), roman
// (Hob. XVI:34), or both (Op. 27 No. 2 — only the opus is taken here, the number being
// read separately below). The longer prefixes come first, so "bwv" is not read as "b"
// and "sz" not as "s". Nothing separates the prefix from its number, because a corpus
// writes "Valse Op51" and "Sonate K331"; what keeps an ordinary word out is the number
// itself, so "Song of the Birds" and "D'un vieux jardin" carry no mark.
const CATALOGUE =
    /\b(woo|opus|op|bwv|kv|hob|hwv|rv|wwv|wab|anh|sz|k|d|s|b|l|cd)\.?\s*([ivxlc]+[:.]?\s*)?(\d+)\s*([a-z]\b)?(-\d+)?/i;

// Which member of a set, written as a number is usually written. "n" with no separator
// is included because a corpus writes "Valse Op51 n6"; it can only match at the start of
// a word, so the n of "in" and "minor" is never one.
const MEMBER =
    /\b(?:nos?|nr|num|number)\b\.?\s*(\d{1,3})\b|\bn[°º.]?\s*(\d{1,3})\b|№\s*(\d{1,3})\b/i;
// A number left at the end with only punctuation in front of it, as in "Préludes opus
// 16 - 4." Read only beside a catalogue mark, where a bare number is far likelier to be
// the member than a date, a key or a count.
const TRAILING_MEMBER = /[-–,.:#]\s*(\d{1,3})\s*\.?\s*$/;
// A number behind a word, as in "Etude 2, Op 176" and "Sonate KV 331 - Variation 3".
// A number in FRONT of a word is a count ("25 Études faciles"), which is why the word
// has to come first. Read only beside a catalogue mark, for the same reason.
const MEMBER_AFTER_WORD = /\b[a-z]{3,}\.?\s+(\d{1,3})\b/i;
// A member written where a set lists its parts: "Dolly, Op. 56: 4. Kitty-valse", "Holberg
// Suite, Op. 40: III. Gavotte", "Suite bergamasque: I. Prélude". The numeral sits behind a
// separator and in front of a period and the part's own name, and that shape is what tells
// it from a year, a key or a count — so this one needs no catalogue mark beside it, which
// is the only reason Debussy's suite resolves at all.
const SEP_MEMBER = /[:,]\s*(\d{1,2}|[ivx]{1,4})\s*\.\s*\p{L}/u;

// Roman numerals as a table rather than as arithmetic. The range a set's parts occupy is
// fixed and small — the longest book that matters is the Well-Tempered Clavier's
// twenty-four — and a table cannot read "iiii" as four.
const ROMAN: Record<string, number> = {
    i: 1,
    ii: 2,
    iii: 3,
    iv: 4,
    v: 5,
    vi: 6,
    vii: 7,
    viii: 8,
    ix: 9,
    x: 10,
    xi: 11,
    xii: 12,
    xiii: 13,
    xiv: 14,
    xv: 15,
    xvi: 16,
    xvii: 17,
    xviii: 18,
    xix: 19,
    xx: 20,
    xxi: 21,
    xxii: 22,
    xxiii: 23,
    xxiv: 24,
};

// The numeral a part is listed under, arabic or roman, or null for text that is neither.
function memberNumber(text: string): number | null {
    if (/^\d+$/.test(text)) {
        const value = Number(text);
        return value > 0 ? value : null;
    }
    return ROMAN[text] ?? null;
}

function fold(text: string): string {
    return (
        (text || "")
            .normalize("NFKD")
            // Combining marks, left behind by the decomposition above: ü becomes u + ¨.
            .replace(/\p{M}/gu, "")
            .toLowerCase()
    );
}

export function workTitle(title: string): WorkTitle {
    const folded = fold(title);
    const found = CATALOGUE.exec(folded);
    // A mark naming a span of works — "3 Minuets BWV 841-843" — identifies the collection
    // and not one piece in it. Taking its first number would file three minuets under the
    // first of them, so the title is read as carrying no mark and a ruling can say what it
    // really is.
    const ranged = found?.[5] !== undefined;
    const catalogue =
        found && !ranged
            ? `${SPELLINGS[found[1]!.toLowerCase()] ?? found[1]!.toLowerCase()} ${(found[2] ?? "").replace(/[^a-z0-9]/g, "")}${found[3]}${found[4] ?? ""}`.replace(
                  /\s+/g,
                  " ",
              )
            : null;
    const name = (found && !ranged ? folded.replace(CATALOGUE, " ") : folded)
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    return { name, catalogue };
}

// Two titles are the same work when they name the same thing and nothing contradicts it: a
// title with no catalogue mark agrees with one that has it, and two different marks never do.
export function sameWork(one: WorkTitle, other: WorkTitle): boolean {
    if (one.name !== other.name || one.name === "") {
        return false;
    }
    return one.catalogue === null || other.catalogue === null || one.catalogue === other.catalogue;
}

// The work a catalogue row names, or null where the title says nothing that identifies one.
// A title with neither a catalogue mark nor a member number is a name and no more: it may
// well be a work, but which work is a judgement, and judgements go in the curation file.
export function workRef(composer: string, title: string): WorkRef | null {
    const folded = fold(title);
    const found = CATALOGUE.exec(folded);
    const ranged = found?.[5] !== undefined;
    const mark = found && !ranged ? workTitle(title).catalogue : null;
    const rest = found && !ranged ? folded.replace(CATALOGUE, " ") : folded;

    const marked = MEMBER.exec(rest);
    let number = marked ? Number(marked[1] ?? marked[2] ?? marked[3]) : null;
    // What a set calls its own part, read before the two bare-number rules below, which
    // guess from position alone and so are only safe beside a catalogue mark.
    const listed = number === null ? SEP_MEMBER.exec(rest) : null;
    number = listed ? memberNumber(listed[1]!) : number;
    if (number === null && mark !== null) {
        const trailing = TRAILING_MEMBER.exec(rest);
        const behind = trailing ? null : MEMBER_AFTER_WORD.exec(rest);
        number = trailing ? Number(trailing[1]) : behind ? Number(behind[1]) : null;
    }
    if (mark === null && number === null) {
        return null;
    }

    const slug = personSlug(composer);
    // Where a part was listed under a separator, the set is the text in front of it: the
    // text behind names the part, not the book, so "Suite bergamasque: I. Prélude" and
    // "… IV. Passepied" have to reduce to one set and not to two.
    const named =
        listed !== null && number !== null
            ? rest.slice(0, listed.index)
            : rest.replace(MEMBER, " ");
    const set = mark === null ? slugify(named) : slugify(mark);
    if (slug === "" || set === "") {
        return null;
    }
    return { composer: slug, set, number };
}

// A "Composer: Work" line, as a syllabus and a repertoire list write one. The separator is
// required: without one there is no rule that tells a composer's name from the start of a
// title, and guessing at it would file pieces under people who did not write them.
export function parseWork(line: string): WorkRef | null {
    const at = line.search(/[:;]/);
    if (at < 0) {
        return null;
    }
    return workRef(line.slice(0, at), line.slice(at + 1));
}

// The key itself. Empty for a reference that names nobody or nothing, which is what the
// callers above return null for — so an empty key is never written down.
export function workKey(ref: WorkRef): string {
    if (ref.composer === "" || ref.set === "") {
        return "";
    }
    const set = `${ref.composer}/${ref.set}`;
    return ref.number === null ? set : `${set}/${ref.number}`;
}

const KEY = /^([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/([1-9]\d{0,2}))?$/;

// A key read back, or null where the text is not one. The curation file is hand-written,
// so this is what stops a typo from becoming a work nothing will ever resolve to.
export function parseKey(key: string): WorkRef | null {
    const found = KEY.exec(key);
    if (found === null) {
        return null;
    }
    return {
        composer: found[1]!,
        set: found[2]!,
        number: found[3] === undefined ? null : Number(found[3]),
    };
}

// The set a key belongs to, which is the key itself for one that names no member. Every
// member of a set has the set's key as a prefix, so this is also what a lookup for the
// whole book asks for.
export function workSetOf(key: string): string {
    const ref = parseKey(key);
    return ref === null ? "" : `${ref.composer}/${ref.set}`;
}
