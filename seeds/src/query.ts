#!/usr/bin/env bun
// file: cli.ts

import { Database } from "bun:sqlite";
import inquirer from "inquirer";
import path from "path";

interface Product {
  id: number;
  name: string;
  price: number | null;
  is_in_stock: 0 | 1;
  link: string;
}

// ─── DB SETUP ───────────────────────────────────────────────────────────────────
const dbFile = process.argv.includes("--db")
  ? path.resolve(process.argv[process.argv.indexOf("--db") + 1] ?? "")
  : "./products.db";
const db = new Database(dbFile);

// Little type-safe wrapper
function runQuery<T = unknown>(sql: string, params: any[] = []): T[] {
  return db.query<T, any>(sql).all(...params);
}

// ─── HELPERS ────────────────────────────────────────────────────────────────────
const printProducts = (rows: Product[]) => {
  if (!rows.length) {
    console.log("No matching products.\n");
    return;
  }
  const headers = ["ID", "Name", "Price", "In Stock", "Link"];
  const widths = [6, 40, 8, 9, 40];

  const pad = (s: string, len: number) =>
    s.length > len ? s.slice(0, len - 1) + "…" : s.padEnd(len);

  console.log(
    headers.map((h, i) => pad(h, widths[i] ?? 0)).join(" | "),
    "\n",
    "-".repeat(widths.reduce((a, b) => a + b + 3, -3))
  );

  rows.forEach((p) => {
    const row = [
      p.id.toString(),
      p.name,
      p.price?.toFixed(2) ?? "—",
      p.is_in_stock ? "✓" : "✗",
      p.link,
    ];
    console.log(row.map((v, i) => pad(v, widths[i] ?? 0)).join(" | "));
  });
  console.log(); // blank line
};

// ─── ACTIONS ────────────────────────────────────────────────────────────────────
async function listInStock() {
  const { sort } = await inquirer.prompt<{
    sort: "ASC" | "DESC" | "none";
  }>({
    name: "sort",
    type: "list",
    message: "Sort by price?",
    choices: [
      { name: "Low → High", value: "ASC" },
      { name: "High → Low", value: "DESC" },
      { name: "No sort", value: "none" },
    ],
    default: "ASC",
  });

  const order = sort === "none" ? "" : `ORDER BY price ${sort}`;
  const rows = runQuery<Product>(
    `SELECT id, name, price, is_in_stock, link
     FROM products
     WHERE is_in_stock = 1
     ${order};`
  );
  printProducts(rows);
}

async function searchByName() {
  const { term } = await inquirer.prompt<{ term: string }>({
    name: "term",
    type: "input",
    message: "Enter part of the product name:",
    validate: (s: string) => (s.trim() ? true : "Please type something"),
  });

  const rows = runQuery<Product>(
    `SELECT id, name, price, is_in_stock, link
     FROM products
     WHERE lower(name) LIKE '%' || lower(?) || '%'
     LIMIT 50;`,
    [term.trim()]
  );
  printProducts(rows);
}

// ─── MAIN LOOP ──────────────────────────────────────────────────────────────────
(async function main() {
  while (true) {
    const { action } = await inquirer.prompt<{
      action: "stock" | "search" | "quit";
    }>({
      name: "action",
      type: "list",
      message: "What do you want to do?",
      choices: [
        { name: "📦  View products in stock", value: "stock" },
        { name: "🔎  Search products by name", value: "search" },
        { name: "🚪  Quit", value: "quit" },
      ],
    });

    switch (action) {
      case "stock":
        await listInStock();
        break;
      case "search":
        await searchByName();
        break;
      case "quit":
        console.log("Bye!");
        process.exit(0);
    }
  }
})();
