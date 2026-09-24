import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllGameIds,
    getAllCategories,
    getAllPublishers,
    getFilteredGames,
    getGameById,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('filters games by one or more categories', async () => {
        await seedGames(db, 3);
        const [otherCategory] = await db
            .insert(categories)
            .values({ name: 'Puzzle', description: 'cat' })
            .returning({ id: categories.id });
        await db.insert(games).values({
            title: 'Puzzle Game',
            description: 'Description',
            starRating: 4.2,
            categoryId: otherCategory.id,
            publisherId: 1,
        });
        const [strategyCategory] = await db
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.name, 'Strategy'));

        const filtered = await getFilteredGames(db, { categoryIds: [otherCategory.id] });
        expect(filtered.map((game) => game.title)).toEqual(['Puzzle Game']);

        const multiple = await getFilteredGames(db, {
            categoryIds: [otherCategory.id, strategyCategory.id],
        });
        expect(multiple).toHaveLength(4);
    });

    it('combines category and publisher filters', async () => {
        await seedGames(db, 3);
        const [otherPublisher] = await db
            .insert(publishers)
            .values({ name: 'Pub Two', description: 'pub' })
            .returning({ id: publishers.id });
        const [category] = await db
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.name, 'Strategy'));
        await db.insert(games).values({
            title: 'Other Publisher Game',
            description: 'Description',
            starRating: 4.2,
            categoryId: category.id,
            publisherId: otherPublisher.id,
        });

        const filtered = await getFilteredGames(db, {
            categoryIds: [category.id],
            publisherId: otherPublisher.id,
        });
        expect(filtered.map((game) => game.title)).toEqual(['Other Publisher Game']);
    });

    it('returns filter options ordered by name', async () => {
        await seedGames(db, 1);
        await db.insert(categories).values({ name: 'Arcade', description: 'cat' });
        await db.insert(publishers).values({ name: 'Acme Games', description: 'pub' });

        expect((await getAllCategories(db)).map((category) => category.name)).toEqual([
            'Arcade',
            'Strategy',
        ]);
        expect((await getAllPublishers(db)).map((publisher) => publisher.name)).toEqual([
            'Acme Games',
            'Pub One',
        ]);
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });
});
