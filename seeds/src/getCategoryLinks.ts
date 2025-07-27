// Use DOMParser via JSDOM (for Node.js)
import * as cheerio from "cheerio";

async function getCategoryLinks(): Promise<string[]> {
  const html = await fetch("https://www.rareseeds.com/store").then((response) =>
    response.text()
  );
  const $ = cheerio.load(html);

  const mainDiv = $("#desktop-alphabet-nav");
  const links = mainDiv
    .find("a")
    .map((i, el) => $(el).attr("href"))
    .get();

  return links;
}

export default getCategoryLinks;