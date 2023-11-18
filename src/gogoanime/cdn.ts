import {
  PlaylistEpisodeServerFormatType,
  PlaylistEpisodeServerLink,
  PlaylistEpisodeServerQualityType,
  PlaylistEpisodeServerResponse,
} from "@mochiapp/js";
import * as cheerio from "cheerio";
import CryptoJS from "crypto-js";

export const extractGogoCDN = async (
  videoUrl: string
): Promise<PlaylistEpisodeServerResponse> => {
  let $ = cheerio.load((await request.get(videoUrl)).text());

  const keys = {
    key: CryptoJS.enc.Utf8.parse("37911490979715163134003223491201"),
    secondKey: CryptoJS.enc.Utf8.parse("54674138327930866480207815084989"),
    iv: CryptoJS.enc.Utf8.parse("3134003223491201"),
  };

  const id: string | undefined = videoUrl.split("id=").pop()?.split("&")[0];
  if (!id) throw new Error("failed to retrieve id from video url");

  const videoUrlParts = videoUrl.split("://");
  const videoUrlProtocol = videoUrlParts[0];
  const videoUrlHostname = videoUrlParts[1].split("/")[0];

  const encryptedId = CryptoJS.AES.encrypt(id, keys.key, { iv: keys.iv });

  const scriptValue =
    $("script[data-name='episode']").first().attr("data-value") ?? "";

  const decryptedToken = CryptoJS.AES.decrypt(scriptValue, keys.key, {
    iv: keys.iv,
  }).toString(CryptoJS.enc.Utf8);

  const encryptedData = await request
    .get(
      `${videoUrlProtocol}://${videoUrlHostname}/encrypt-ajax.php?id=${encryptedId}&alias=${id}&=${decryptedToken}`,
      {
        headers: {
          "X-Requested-With": "XMLHttpRequest",
        },
      }
    )
    .then((r) => r.json<Payload>());

  const decryptedData = CryptoJS.enc.Utf8.stringify(
    CryptoJS.AES.decrypt(encryptedData.data, keys.secondKey, {
      iv: keys.iv,
    })
  );

  const links: PlaylistEpisodeServerLink[] = [];
  const decryptedPayload: DecryptedPayload = JSON.parse(decryptedData);

  const addLinks = (sources: Source[]) => {
    for (const source of sources) {
      links.push({
        url: source.file,
        quality: PlaylistEpisodeServerQualityType.auto,
        format: PlaylistEpisodeServerFormatType.hsl,
      });
    }
  };
  if (decryptedPayload.source) addLinks(decryptedPayload.source);
  if (decryptedPayload.source_bk) addLinks(decryptedPayload.source_bk);

  return {
    links: links,
    subtitles: [],
    skipTimes: [],
    headers: {},
  };
};

type Source = {
  file: string;
};

type DecryptedPayload = {
  source?: Source[];
  source_bk?: Source[];
};

type Payload = {
  data: string;
};
