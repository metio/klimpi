// SPDX-FileCopyrightText: The Klimpi Authors
// SPDX-License-Identifier: AGPL-3.0-or-later

// Which work each catalogue row is, as public/songs/works.json.
//
// A catalogue row says what a transcriber typed. A German syllabus, a competition
// programme and a repertoire list all name a piece by its opus instead — "Burgmüller op.
// 100 Nr. 2" — and nothing in the catalogue answers to that. `core/work.ts` reduces both
// to one key; this is what applies it to the shipped manifest and writes the answer down.
//
// Three tiers, in descending order of leverage. The derivation reads a key off any title
// carrying a catalogue mark or a member number. An alias renames a set the derivation
// found under its name to the mark it is known by, keeping each row's number, so one line
// re-keys a book. A set definition names what the derivation cannot see at all, by a
// composer pattern and one title pattern per number — Burgmüller's op. 100 arrives as
// sixteen French character titles with no opus anywhere on any of them. A ruling, keyed by
// song id, is the last word over both.
//
// Resolved here rather than in the browser, so no pattern table reaches a visitor's
// bundle and a definition that has stopped matching fails a gate instead of quietly
// resolving to nothing. Run through `npm run songs:bake`; `--check` is the CI guard.

import { readFile, writeFile } from "node:fs/promises";
import type { SongMeta } from "../core/catalogMeta.ts";
import { parseKey, workKey, workRef, workSetOf } from "../core/work.ts";
import { readSongs } from "./manifest.mts";
import { matchPattern } from "./works.mts";

const CURATION = "dev/catalog-works.json";
const OUT = "public/songs/works.json";

// One number of a set, as the titles the catalogue happens to carry for it. A pattern,
// because one number arrives under several spellings: op. 100 no. 7 is in the catalogue
// twice, once in French and once in English.
export type Member = { number: number; title: string };

export type SetDefinition = {
    // The set's key, with no member number of its own.
    key: string;
    composer: string;
    // How few rows the set may resolve to before the definition has stopped describing
    // the catalogue. A pattern that silently matches nothing weakens the index without
    // saying so, which is the failure dev/grade-anchors.json's `least` exists to catch.
    least: number;
    members: Member[];
};

export type WorkCuration = {
    aliases: Record<string, string>;
    sets: SetDefinition[];
    rulings: Record<string, string>;
};

// What resolving reads off a catalogue row.
export type Song = Pick<SongMeta, "id" | "title" | "composer">;

// What ships: each row's work key, by song id. The reverse — every row of one work —
// inverts in a line, and a set is a string prefix of its members, so one direction is
// enough and it is the small one.
export type WorkIndex = Record<string, string>;

function malformedKey(key: string, where: string): string | null {
    const ref = parseKey(key);
    if (ref === null) {
        return `${where}: "${key}" is not a work key`;
    }
    return null;
}

// Every row's work, and everything that has stopped holding. Pure, so the rules can be
// tested without a catalogue on disk.
export function resolveWorks(
    curation: WorkCuration,
    songs: readonly Song[],
): { works: WorkIndex; problems: string[] } {
    const problems: string[] = [];
    const works: WorkIndex = {};

    // Tier one: what the titles say themselves, with an alias applied to the set.
    const derivedSets = new Set<string>();
    for (const song of songs) {
        const ref = workRef(song.composer, song.title);
        if (ref === null) {
            continue;
        }
        const key = workKey(ref);
        const set = workSetOf(key);
        derivedSets.add(set);
        const alias = curation.aliases[set];
        works[song.id] =
            alias === undefined ? key : ref.number === null ? alias : `${alias}/${ref.number}`;
    }

    // An alias naming a set nothing derives is an alias for a work the catalogue no longer
    // holds under that title — stale, and silent about it, because renaming nothing
    // succeeds perfectly.
    for (const [from, to] of Object.entries(curation.aliases)) {
        const bad = malformedKey(from, "alias") ?? malformedKey(to, `alias for "${from}"`);
        if (bad !== null) {
            problems.push(bad);
            continue;
        }
        if (!derivedSets.has(from)) {
            problems.push(`alias "${from}" renames a set no title derives any more`);
        }
    }

    // Tier two: the sets no title can describe.
    for (const definition of curation.sets) {
        const bad = malformedKey(definition.key, "set");
        if (bad !== null) {
            problems.push(bad);
            continue;
        }
        if (parseKey(definition.key)?.number !== null) {
            problems.push(`set "${definition.key}" names a member rather than a set`);
            continue;
        }
        let resolved = 0;
        for (const member of definition.members) {
            const key = `${definition.key}/${member.number}`;
            if (parseKey(key) === null) {
                problems.push(`set "${definition.key}": ${member.number} is not a member number`);
                continue;
            }
            for (const song of matchPattern(songs, {
                composer: definition.composer,
                title: member.title,
            })) {
                works[song.id] = key;
                resolved++;
            }
        }
        if (resolved < definition.least) {
            problems.push(
                `set "${definition.key}" resolves to ${resolved} rows, fewer than the ${definition.least} it needs`,
            );
        }
    }

    // Tier three: the last word.
    const present = new Set(songs.map((song) => song.id));
    for (const [id, key] of Object.entries(curation.rulings)) {
        const bad = malformedKey(key, `ruling for ${id}`);
        if (bad !== null) {
            problems.push(bad);
            continue;
        }
        if (!present.has(id)) {
            problems.push(`ruling for ${id} names a piece the catalogue no longer holds`);
            continue;
        }
        works[id] = key;
    }

    // By id, so the committed file diffs by what changed rather than by what moved.
    const sorted: WorkIndex = {};
    for (const id of Object.keys(works).sort()) {
        sorted[id] = works[id] as string;
    }
    return { works: sorted, problems };
}

export async function readWorkCuration(path = CURATION): Promise<WorkCuration> {
    const parsed: Partial<WorkCuration> = JSON.parse(await readFile(path, "utf8"));
    return {
        aliases: parsed.aliases ?? {},
        sets: parsed.sets ?? [],
        rulings: parsed.rulings ?? {},
    };
}

// Writes the work index, or with `check` reports whether what is on disk matches.
export async function bakeWorks(check: boolean): Promise<boolean> {
    const { works, problems } = resolveWorks(await readWorkCuration(), await readSongs());
    if (problems.length > 0) {
        console.error("The work index no longer resolves against the catalogue:");
        for (const problem of problems) {
            console.error(`  • ${problem}`);
        }
        console.error(`\nEither the catalogue moved, or ${CURATION} needs the correction.`);
        return false;
    }
    const baked = JSON.stringify(works);
    if (check) {
        if ((await readFile(OUT, "utf8").catch(() => "")) !== baked) {
            console.error(`${OUT} is stale.`);
            return false;
        }
        console.log(`Works are baked: ${Object.keys(works).length} pieces identified.`);
        return true;
    }
    await writeFile(OUT, baked);
    const sets = new Set(Object.values(works).map(workSetOf));
    console.log(`Works: ${Object.keys(works).length} pieces over ${sets.size} sets.`);
    return true;
}
