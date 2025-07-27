import { JSDOM } from "jsdom";
import pLimit from "p-limit";
import cliProgress from "cli-progress";

async function getProductLinks(
  links: string[],
  concurrency = 5
): Promise<string[]> {
  const limit = pLimit(concurrency);

  // set up progress bar
  const progressBar = new cliProgress.SingleBar(
    {
      format: " [{bar}] {percentage}% | {value}/{total} pages",
    },
    cliProgress.Presets.shades_classic
  );
  progressBar.start(links.length, 0);

  // wrap each fetch/parsing in limiter, and increment bar on each completion
  const tasks = links.map((link) =>
    limit(async () => {
      const html = await fetch(link).then((res) => res.text());
      const dom = new JSDOM(html);
      const hrefs = Array.from(dom.window.document.querySelectorAll("a"))
        .filter((a) => a.classList.contains("product-item-photo"))
        .map((a) => a.href);

      progressBar.increment();
      return hrefs;
    })
  );

  // wait for all, then stop
  const all = await Promise.all(tasks);
  progressBar.stop();

  // dedupe and return
  return Array.from(new Set(all.flat()));
}

export default getProductLinks;
