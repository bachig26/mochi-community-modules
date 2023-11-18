import { Paging, Playlist, PlaylistStatus, PlaylistType } from "@mochiapp/js";
import Gogoanime from ".";

export const parsePageListing = ($: cheerio.Root): Paging<Playlist> => {
    const $currentPage = $('div.anime_name.new_series > div > div > ul > li.selected').first();

    const $prevPage = $currentPage.prev().find("a").attr("data-page");
    const $nextPage = $currentPage.next().find("a").attr("data-page");

    const items: Playlist[] = [];

    $('div.last_episodes > ul').children("li").each((_, element) => {
        const id = $(element).find("p.name > a").first().attr("href");
        const title = $(element).find("p.name > a").first().attr("title");
        const image = $(element).find("div > a > img").first().attr("src");

        // Some links aren't url encoded.
        let encodedImage: string | undefined;

        if (image) encodedImage = encodeURI(image);

        const strippedId = id?.split("/").pop();
        if (strippedId) {
            items.push({
                id: strippedId,
                title: title,
                posterImage: encodedImage,
                url: `${Gogoanime.GOGOANIME_URL}${id}`,
                status: PlaylistStatus.unknown,
                type: PlaylistType.video
            });
        } 
    });

    return {
        id: $currentPage.text(),
        previousPage: $prevPage,
        nextPage: $nextPage,
        items: items
    };
};
