#!/usr/bin/env bun
/**
 * A small utility that scrapes seed-product pages and stores the
 * extracted data in a local SQLite DB (via Bun’s built-in driver).
 *
 *  ✦ Usage ───────────────────────────────────────────────────────────
 *  1. Update the `links` array or pass a JSON/CSV file path as the
 *     first CLI argument (see `getProduct()`).
 *  2. Run the script:  `bun product-parser.ts`
 *
 *  The table schema is created idempotently on start-up.
 *  If a row with the same SKU already exists it will be REPLACED.
 *
 *  Author: <your-name>
 *  Updated: 2025-07-27
 */

import { Database, Statement } from "bun:sqlite";
import cliProgress from "cli-progress";
import * as cheerio from "cheerio";
import pLimit from "p-limit";

/* ─────────────────────────── Types ─────────────────────────────── */
interface Product {
  name: string;
  sku: string;
  price: number;
  rating: number;
  reviewCount: number;
  minSeedCount: number;
  description: string;
  growingTips: string;
  scientificName: string;
  plantSpacing: string;
  seedDepth: string;
  germinationDays: string;
  idealTemp: string;
  sunRequirement: string;
  zones: string;
  frostHardy: boolean;
  audioUrl: string;
  isInStock: boolean;
  link: string;
}

/* ──────────────────────── ProductParser ────────────────────────── */
export class ProductParser {
  private db: Database;
  private insertStmt: Statement;

  constructor(dbPath = "./products.db") {
    this.db = new Database(dbPath, { strict: true });
    this.initDatabase();
    this.insertStmt = this.prepareInsert();
  }

  /* Create table & indices only once (idempotent) */
  private initDatabase(): void {
    this.db.exec(`
      BEGIN;
      CREATE TABLE IF NOT EXISTS products (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT NOT NULL,
        sku             TEXT UNIQUE,
        price           REAL,
        rating          REAL,
        review_count    INTEGER,
        min_seed_count  INTEGER,
        description     TEXT,
        growing_tips    TEXT,
        scientific_name TEXT,
        plant_spacing   TEXT,
        seed_depth      TEXT,
        germination_days TEXT,
        ideal_temp      TEXT,
        sun_requirement TEXT,
        zones           TEXT,
        frost_hardy     BOOLEAN,
        audio_url       TEXT,
        is_in_stock     BOOLEAN DEFAULT 0,
        link            TEXT NOT NULL,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_products_sku   ON products(sku);
      CREATE INDEX IF NOT EXISTS idx_products_name  ON products(name);
      COMMIT;`);
  }

  private prepareInsert(): Statement {
    return this.db.prepare(`
      INSERT OR REPLACE INTO products (
        name, sku, price, rating, review_count, min_seed_count,
        description, growing_tips, scientific_name, plant_spacing,
        seed_depth, germination_days, ideal_temp, sun_requirement,
        zones, frost_hardy, audio_url, link, is_in_stock
      ) VALUES (
        @name, @sku, @price, @rating, @reviewCount, @minSeedCount,
        @description, @growingTips, @scientificName, @plantSpacing,
        @seedDepth, @germinationDays, @idealTemp, @sunRequirement,
        @zones, @frostHardy, @audioUrl, @link, @isInStock
      );`);
  }

  /* Helper to fetch & load a DOM */
  private async loadDom(url: string): Promise<cheerio.CheerioAPI> {
    const html = await fetch(url).then((r) => r.text());
    return cheerio.load(html);
  }

  /* Convenience for text extraction */
  private text($: cheerio.CheerioAPI, selector: string): string {
    return $(selector).first().text().trim();
  }

  /* Core extraction logic */
  private parseProduct = async (link: string): Promise<Product> => {
    const $ = await this.loadDom(link);

    // primary selector
    let name = this.text($, 'h1[data-ui-id="page-title-wrapper"]');
    // fallback
    if (!name) {
      name = this.text($, "h1");
    }
    name = name.trim();
    if (!name) {
      throw new Error(`No product name found at ${link}`);
    }

    // sku likewise must be non-empty
    let rawSku = this.text(
      $,
      'div.flex.flex-row.text-sm.uppercase.text-primary-600 > div.flex:contains("Sku:")'
    )
      .replace("#", "")
      .trim();
    if (!rawSku) {
      throw new Error(`No SKU found at ${link}`);
    }
    const sku = rawSku;

    // 4) all other fields get safe defaults
    const priceText = this.text($, ".price").replace("$", "");
    const price = isNaN(parseFloat(priceText)) ? 0 : parseFloat(priceText);

    const ratingText = this.text($, ".text-primary-600.font-bold");
    const rating = isNaN(parseFloat(ratingText)) ? 0 : parseFloat(ratingText);

    const reviewMatch = this.text($, 'div:contains("Reviews")').match(/(\d+)/);
    const reviewCount = reviewMatch ? Number(reviewMatch[1]) : 0;

    const minSeedMatch = this.text($, 'div:contains("Min. seed count:")')
      .split(" ")
      .pop();
    const minSeedCount = minSeedMatch ? parseInt(minSeedMatch, 10) : 0;

    const description = this.text($, "#description-content") || "";
    const growingTips =
      this.text($, 'h3:contains("Growing Tips") + .pb-5') || "";

    let scientificName = "",
      plantSpacing = "",
      seedDepth = "",
      germinationDays = "",
      idealTemp = "",
      sunRequirement = "",
      zones = "",
      frostHardy = false;

    $("ul li").each((_, el) => {
      const txt = $(el).text().trim();
      if (/^Perennial in zones/i.test(txt)) {
        zones = txt.match(/zones\s+([\d-]+)/i)?.[1] ?? "";
      } else if (/Full Sun|Part Sun/i.test(txt)) {
        sunRequirement = txt;
      } else if (/Sprouts in/i.test(txt)) {
        germinationDays = txt.match(/(\d+-\d+)\s+Days/)?.[1] ?? "";
      } else if (/Ideal Temperature:/i.test(txt)) {
        idealTemp = txt.replace(/Ideal Temperature:/i, "").trim();
      } else if (/Seed Depth:/i.test(txt)) {
        seedDepth = txt.replace(/Seed Depth:/i, "").trim();
      } else if (/Plant Spacing:/i.test(txt)) {
        plantSpacing = txt.replace(/Plant Spacing:/i, "").trim();
      } else if (/Frost Hardy:/i.test(txt)) {
        frostHardy = /Yes/i.test(txt);
      } else if (/^[A-Z][a-z]+\s+[a-z]+$/.test(txt)) {
        scientificName = txt;
      }
    });

    const audioUrl = $("audio source").attr("src") ?? "";
    const isInStock = $("#product-addtocart-button").length > 0;

    return {
      name,
      sku,
      price,
      rating,
      reviewCount,
      minSeedCount,
      description,
      growingTips,
      scientificName,
      plantSpacing,
      seedDepth,
      germinationDays,
      idealTemp,
      sunRequirement,
      zones,
      frostHardy,
      audioUrl,
      isInStock,
      link,
    };
  };

  /* Insert or replace a single product */
  private insertProduct(p: Product): void {
    if (typeof p.name !== "string" || !p.name.trim()) {
      console.warn("🛑 insertProduct: bad name, skipping", p);
      return;
    }

    console.log(`📝 insertProduct: ${p.name}`);

    this.insertStmt.run({
      ...p,
      frostHardy: p.frostHardy ? 1 : 0,
      isInStock: p.isInStock ? 1 : 0,
    });
  }

  async processLinks(links: string[]): Promise<void> {
    const t0 = Date.now();
    const limit = pLimit(5);

    // set up progress bar
    const progressBar = new cliProgress.SingleBar(
      {
        format: " [{bar}] {percentage}% | {value}/{total} links",
      },
      cliProgress.Presets.shades_classic
    );
    progressBar.start(links.length, 0);

    // wrap each parseProduct call so we can increment on completion
    const tasks = links.map((l) =>
      limit(async () => {
        try {
          const product = await this.parseProduct(l);
          return { status: "fulfilled" as const, value: product, link: l };
        } catch (reason) {
          return { status: "rejected" as const, reason, link: l };
        } finally {
          progressBar.increment();
        }
      })
    );

    // wait for all to settle
    const results = await Promise.all(tasks);
    progressBar.stop();

    let ok = 0,
      fail = 0;
    for (const res of results) {
      if (res.status === "fulfilled") {
        // res.value is guaranteed to be a valid Product
        this.insertProduct(res.value);
        ok++;
      } else {
        fail++;
        console.error(`✗ Failed (${res.link}):`, res.reason);
      }
    }

    console.info(
      `\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s  ✓${ok}  ✗${fail}`
    );
  }

  /* Handy helpers */
  getProductCount(): number {
    return (
      this.db.query("SELECT COUNT(*) AS c FROM products").get() as { c: number }
    ).c;
  }
  close(): void {
    this.db.close();
  }
}
