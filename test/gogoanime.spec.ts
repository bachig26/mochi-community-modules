import { describe, it } from 'mocha'; 
import { assert } from 'chai';
import Gogoanime from '../src/gogoanime';
import runner from '@mochiapp/runner';

describe("Gogoanime Tests", () => {
    const module = runner(Gogoanime);

    it("fetch search", async () => {
        const f = await module.search({ query: "attack", filters: [] });
        assert(f.items.length != 0);
    });

    it("fetch search filters", async () => {
        const f = await module.searchFilters();
        assert(f.length != 0);
    });
});