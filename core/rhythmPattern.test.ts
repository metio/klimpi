// SPDX-FileCopyrightText: The Klimpi Authors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { seededRandom } from "./random";
import {
    cellBeats,
    expectedOnsets,
    generateRhythm,
    patternMs,
    RHYTHM_LEVELS,
} from "./rhythmPattern";

// A generator is only worth testing over its whole option space, so the suites below
// walk every level with a spread of seeds rather than sampling one.
const seeds = (count: number) =>
    Array.from({ length: count }, (_, index) => {
        let state = index + 1;
        return () => {
            state = (state * 1103515245 + 12345) % 2147483648;
            return state / 2147483648;
        };
    });

describe("the rhythm ladder", () => {
    it("fills every bar exactly, at every level and every seed", () => {
        // The one thing a generated bar must never be is over- or under-full: a bar that
        // does not add up is unreadable, and everything downstream — the drawing, the
        // onsets, the grading — quietly inherits the error.
        for (let level = 0; level < RHYTHM_LEVELS.length; level++) {
            for (const rng of seeds(12)) {
                const pattern = generateRhythm(level, rng);
                const total = pattern.cells.reduce((sum, cell) => sum + cell.beats, 0);
                expect(total).toBeCloseTo(pattern.bars * pattern.beatsPerBar, 6);
            }
        }
    });

    it("never crosses a bar line with a figure", () => {
        // A figure that straddled a bar line would need a tie to be written honestly, and
        // nothing here draws one.
        for (let level = 0; level < RHYTHM_LEVELS.length; level++) {
            for (const rng of seeds(8)) {
                const pattern = generateRhythm(level, rng);
                const starts = cellBeats(pattern);
                pattern.cells.forEach((cell, index) => {
                    const start = starts[index] as number;
                    const barOfStart = Math.floor(start / pattern.beatsPerBar + 1e-9);
                    const barOfEnd = Math.floor((start + cell.beats - 1e-9) / pattern.beatsPerBar);
                    expect(barOfEnd).toBe(barOfStart);
                });
            }
        }
    });

    it("asks for at least one tap in every pattern it makes", () => {
        // A bar of nothing but rests is a legal rhythm and a useless exercise.
        for (let level = 0; level < RHYTHM_LEVELS.length; level++) {
            for (const rng of seeds(8)) {
                expect(expectedOnsets(generateRhythm(level, rng), 90).length).toBeGreaterThan(0);
            }
        }
    });

    it("asks for one however the draws fall, not merely in most rounds", () => {
        // The levels carrying rest figures can fill every beat with one, and the odds are
        // not long: level 2 offers three figures of which one is a half rest, so a pattern
        // of silence is one draw in eighty-one. A handful of seeds walks past that; a
        // player meeting it is handed a line to read with no tap in it, scored out of
        // nothing, where every tap they do give counts as a spare one.
        for (let level = 0; level < RHYTHM_LEVELS.length; level++) {
            for (let seed = 0; seed < 4000; seed++) {
                const pattern = generateRhythm(level, seededRandom(seed));
                const taps = pattern.cells.filter((cell) => !cell.rest);
                expect(taps.length, `level ${level}, seed ${seed}`).toBeGreaterThan(0);
            }
        }
    });

    it("offers a figure that sounds at every level, short enough for a bar", () => {
        // What the demand for a tap spends: with no sounding figure to reach for, the last
        // bar would have to fill itself with rests and a round could be silent again.
        for (const level of RHYTHM_LEVELS) {
            const sounding = level.figures.filter(
                (figure) =>
                    figure.beats <= level.beatsPerBar && figure.cells.some((cell) => !cell.rest),
            );
            expect(sounding.length).toBeGreaterThan(0);
        }
    });

    it("clamps a level index that is out of range rather than failing", () => {
        expect(generateRhythm(-5, () => 0.5).level).toBe(0);
        expect(generateRhythm(999, () => 0.5).level).toBe(RHYTHM_LEVELS.length - 1);
    });

    it("places onsets on the beat grid the tempo implies", () => {
        // Level 0 is bare quarter notes, so its onsets are exactly one beat apart.
        const pattern = generateRhythm(0, () => 0.5);
        const onsets = expectedOnsets(pattern, 120);
        expect(onsets).toEqual([0, 500, 1000, 1500, 2000, 2500, 3000, 3500]);
        expect(patternMs(pattern, 120)).toBe(4000);
    });

    it("counts a rest's time without asking for a tap", () => {
        const pattern = generateRhythm(1, () => 0.99);
        const taps = expectedOnsets(pattern, 60);
        const cells = pattern.cells.filter((cell) => !cell.rest);
        expect(taps).toHaveLength(cells.length);
        expect(taps.length).toBeLessThan(pattern.cells.length);
    });

    it("beams only what it drew as a group, and groups only whole figures", () => {
        for (let level = 0; level < RHYTHM_LEVELS.length; level++) {
            for (const rng of seeds(6)) {
                const pattern = generateRhythm(level, rng);
                const groups = new Map<number, number>();
                for (const cell of pattern.cells) {
                    if (cell.group !== undefined) {
                        groups.set(cell.group, (groups.get(cell.group) ?? 0) + 1);
                    }
                }
                // A group of one would draw a beam from a note to itself.
                for (const size of groups.values()) {
                    expect(size).toBeGreaterThan(1);
                }
            }
        }
    });
});
