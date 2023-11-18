import {
  SourceModule,
  VideoContent,
  SearchFilter,
  SearchQuery,
  Paging,
  Playlist,
  DiscoverListing,
  PlaylistDetails,
  PlaylistItemsResponse,
  PlaylistEpisodeSourcesRequest,
  PlaylistEpisodeSource,
  PlaylistEpisodeServerResponse,
  DiscoverListingsRequest,
  PlaylistItemsOptions,
  PlaylistID,
  FetchedPaging,
  PlaylistItem,
  PlaylistGroupVariant,
  PlaylistEpisodeServer,
  PlaylistEpisodeServerRequest,
} from "@mochiapp/js";

import * as cheerio from "cheerio";
import { parsePageListing } from "./parser";
import { extractGogoCDN } from "./cdn";

export default class Gogoanime extends SourceModule implements VideoContent {
  static GOGOANIME_URL = "https://gogoanimehd.io";
  static AJAX_URL = "https://ajax.gogo-load.com/ajax";

  metadata = {
    name: "Gogoanime",
    description: "A scraper to watch anime content from Gogoanime.",
    icon: "https://gogoanimehd.io/img/icon/logo.png",
    version: "0.0.1",
  };

  async searchFilter(): Promise<SearchFilter[]> {
    return [];
  }

  async search(searchQuery: SearchQuery): Promise<Paging<Playlist>> {
    const page = searchQuery.page ?? "1";
    const filtersEncoded = searchQuery.filters.flatMap((filter) =>
      filter.optionIds.flatMap(
        (id) => `${encodeURIComponent(filter.id)}=${encodeURIComponent(id)}`
      )
    );
    const filters = filtersEncoded.join("&");
    const query = encodeURIComponent(searchQuery.query);

    let response = await request.get(
      `${Gogoanime.GOGOANIME_URL}/search.html?keyword=${query}&page=${page}&${filters}`
    );

    const $ = cheerio.load(response.text());
    return parsePageListing($);
  }

  async discoverListings(
    req?: DiscoverListingsRequest
  ): Promise<DiscoverListing[]> {
    const items: DiscoverListing[] = [];
    const topAiringHTML = (
      await request.get(
        "https://ajax.gogo-load.com/ajax/page-recent-release-ongoing.html?page=1"
      )
    ).text();
    return items;
  }

  async playlistDetails(id: PlaylistID): Promise<PlaylistDetails> {
    let html = (
      await request.get(`${Gogoanime.GOGOANIME_URL}/category/${id}`)
    ).text();

    const $ = cheerio.load(html);

    const descriptionElement = $("div.anime_info_body_bg > p:nth-child(5)")
      .contents()
      .get(1) as object | undefined;

    const altTitlesElement = $("div.anime_info_body_bg > p:nth-child(9)")
      .contents()
      .get(1) as object | undefined;

    const yearReleasedElement = $("div.anime_info_body_bg > p:nth-child(7)")
      .contents()
      .get(1) as object | undefined;

    const genres: string[] = $("div.anime_info_body_bg > p:nth-child(6) > a")
      .map((_, e) => $(e).attr("title"))
      .get()
      .filter((e) => e !== undefined && e !== null);

    return {
      synopsis: descriptionElement ? $(descriptionElement).text() : undefined,
      altTitles: altTitlesElement ? $(altTitlesElement).text().split(",") : [],
      altPosters: [],
      altBanners: [],
      genres: genres,
      yearReleased: yearReleasedElement
        ? parseInt($(yearReleasedElement).text())
        : undefined,
      previews: [],
    };
  }

  async playlistEpisodes(
    playlistId: string,
    options?: PlaylistItemsOptions
  ): Promise<PlaylistItemsResponse> {
    const html = (
      await request.get(`${Gogoanime.GOGOANIME_URL}/category/${playlistId}`)
    ).text();
    let $ = cheerio.load(html);

    const movieID = $("#movie_id").first().attr("value");
    const alias = $("#alias_anime").first().attr("value");

    if (!movieID || !alias)
      throw new Error("invalid playlist ID, movieID and alias are undefined");

    const pagingStr =
      options && "pageId" in options
        ? options.pageId
        : $("#episode_page > li > a").first().text();
    const epStart = pagingStr.split("-")[0] ?? "0";
    const epEnd = pagingStr.split("-")[1] ?? epStart ?? "0";

    // Create all pagings, but do not fetch all of them.
    // TODO: Fetch all of them if not specified and then split them based on the page range.
    const pagings: FetchedPaging<PlaylistItem>[] = $("#episode_page > li > a")
      .map((_, e) => {
        return {
          id: $(e).text(),
          previousPage: e.prev ? $(e.prev).text() : undefined,
          nextPage: e.prev ? $(e.next).text() : undefined,
          displayName: $(e).text(),
        } as FetchedPaging<PlaylistItem>;
      })
      .get();

    const pagingIndex = pagings.findIndex((p) => p.id === pagingStr);
    if (pagingIndex === undefined || pagingIndex < 0)
      throw new Error("Invalid paging id requested. Paging id not found.");

    const episodesXML = (
      await request.get(
        `${
          Gogoanime.AJAX_URL
        }/load-list-episode?ep_start=${epStart}&ep_end=${epEnd}&id=${movieID}&default_ep=${0}&alias=${alias}`
      )
    ).text();

    $ = cheerio.load(episodesXML, { xmlMode: true });

    const episodeItems: PlaylistItem[] = [];
    const episodeElements = $("#episode_related > li");

    for (const element of episodeElements) {
      const $element = $(element);
      const id = $element.find("a").attr("href");
      const number = $element.find("a > div.name").contents().get(1) as
        | number
        | undefined;

      const cleanId = id?.split("/").pop();

      if (cleanId && cleanId.length > 0) {
        episodeItems.push({
          id: cleanId,
          number: number ? parseFloat($(number).text()) : 0,
          tags: [],
        });
      }
    }

    episodeItems.sort((a, b) => a.number - b.number);

    // Set episode items to the designated page

    pagings[pagingIndex].items = episodeItems;

    const isDub = playlistId.toLowerCase().includes("dub");

    const variant: PlaylistGroupVariant = {
      id: isDub ? "dub" : "sub",
      title: isDub ? "Dub" : "Sub",
      pagings: pagings,
    };

    return [
      {
        id: options?.groupId ?? "0",
        number: 0,
        variants: [variant],
      },
    ];
  }

  async playlistEpisodeSources(
    req: PlaylistEpisodeSourcesRequest
  ): Promise<PlaylistEpisodeSource[]> {
    const url = `${Gogoanime.GOGOANIME_URL}/${req.episodeId}`;
    const $ = cheerio.load((await request.get(url)).text());
    const servers: PlaylistEpisodeServer[] = [];

    for (const element of $(
      "div.anime_video_body > div.anime_muti_link > ul > li"
    )) {
      const node = $(element);
      const id = node.attr("class");
      const displayName = node
        .find("a")
        .first()
        .contents()
        // Get name of server by reverse index.
        .get(-2) as string | undefined;

      if (id) {
        servers.push({
          id: id,
          displayName: displayName ? $(displayName).text() : "Unknown",
        });
      }
    }

    return [
      {
        id: "0",
        displayName: "Default",
        description: undefined,
        servers: servers,
      },
    ];
  }

  async playlistEpisodeServer(
    req: PlaylistEpisodeServerRequest
  ): Promise<PlaylistEpisodeServerResponse> {
    const url = `${Gogoanime.GOGOANIME_URL}/${req.episodeId}`;
    const $ = cheerio.load((await request.get(url)).text());

    const selectedServerLink = $(
      `div.anime_video_body > div.anime_muti_link > ul > .${req.serverId} > a`
    )
      .first()
      .attr("data-video");

    if (!selectedServerLink) throw new Error("Server ID not valid");

    switch (req.serverId) {
      case "streamsb":
        throw new Error("streamsb not supported");
      case "mp4upload":
        throw new Error("mp4upload not supported");
      case "doodstream":
        throw new Error("doodstream not supported");
      default:
        return await extractGogoCDN(selectedServerLink);
    }
  }
}
