import getCategoryLinks from "./getCategoryLinks";
import { ProductParser } from "./getProduct";
import getProductLinks from "./getProductLinks";

console.info('getting category links...');
const categoryLinks = await getCategoryLinks();
console.info(`Found ${categoryLinks.length} categories.`);
console.info('getting product links...');
const productLinks = await getProductLinks(categoryLinks);
console.info(`Found ${productLinks.length} products.`);

const parser = new ProductParser();
console.info("Parsing products...");
await parser.processLinks(productLinks);
console.info(`Total rows: ${parser.getProductCount()}`);
parser.close();

console.info("Done!");