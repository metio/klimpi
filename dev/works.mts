// SPDX-FileCopyrightText: The Klimpi Authors
// SPDX-License-Identifier: AGPL-3.0-or-later

// A named work — a book of studies, a teaching collection — as a composer pattern and a
// title pattern over the solo-piano rows of the catalogue. Two gates resolve works this
// way, the built-in assignments and the grade anchors, and each carried the filter: a
// pattern that stopped matching in one file went on matching in the other, and the two
// could disagree about whether the catalogue still held a work.

export type WorkPattern = { composer: string; title: string };

type Row = { composer: string; title: string; scoreKind?: string };

// The rows a pattern names, whatever they are written for. Which work a score IS does not
// depend on who plays it: a Lied carries an opus number exactly as a sonata does, and the
// work index is built over the whole catalogue.
export function matchPattern<T extends Row>(songs: readonly T[], work: WorkPattern): T[] {
    const composer = new RegExp(work.composer, "i");
    const title = new RegExp(work.title, "i");
    return songs.filter((song) => composer.test(song.composer) && title.test(song.title));
}

// The same, over what a pianist plays alone. A set is something to work through at the
// keyboard, and an art song's piano part is not that even when its composer wrote the book.
export function matchWork<T extends Row>(songs: readonly T[], work: WorkPattern): T[] {
    return matchPattern(songs, work).filter((song) => song.scoreKind === "solo-piano");
}
