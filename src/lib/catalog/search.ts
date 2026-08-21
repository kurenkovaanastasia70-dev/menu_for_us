import type { Product } from "@/lib/optimizer/types";

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/ё/g, "е");
}

export function searchProducts(products: Product[], query: string, limit = 12): Product[] {
  const q = normalize(query);
  if (q.length < 1) return [];
  return products
    .map((product) => {
      const name = normalize(product.canonical_name);
      const id = product.id.toLowerCase();
      const tags = product.tags.map(normalize);
      let score = 0;
      if (name === q || id === q) score = 3;
      else if (name.startsWith(q) || id.startsWith(q)) score = 2;
      else if (name.includes(q) || id.includes(q) || tags.some((tag) => tag.includes(q))) score = 1;
      return { product, score };
    })
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.product.canonical_name.length - b.product.canonical_name.length ||
        a.product.canonical_name.localeCompare(b.product.canonical_name, "ru"),
    )
    .slice(0, limit)
    .map((row) => row.product);
}
