"use client";

import { useEffect, useState, useCallback } from "react";

// The minimal consumer required by the brief: calls this API's OWN public
// URL (not localhost, not an internal function call), to prove the API
// actually works when called the way any outside developer would call it.
// Set NEXT_PUBLIC_API_BASE_URL to the live deployed URL once deployed;
// falls back to the local dev server's own origin so this page still works
// during local development before a deploy exists.

type Product = {
  id: string;
  name: string;
  priceMinorUnits: number;
  currency: string;
  stockQuantity: number;
  category: { name: string; slug: string };
};

type ApiResponse = {
  data: Product[];
  meta: { total: number; limit: number; hasMore: boolean; nextCursor: string | null };
};

export default function ConsumerPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (useCursor: string | null, replace: boolean) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ limit: "10" });
      if (category) params.set("category", category);
      if (useCursor) params.set("cursor", useCursor);

      try {
        const res = await fetch(`${apiBase}/api/v1/products?${params}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error?.message ?? `Request failed (${res.status})`);
        }
        const body: ApiResponse = await res.json();
        setProducts((prev) => (replace ? body.data : [...prev, ...body.data]));
        setNextCursor(body.meta.nextCursor);
        setTotal(body.meta.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    [apiBase, category]
  );

  useEffect(() => {
    // Standard fetch-on-mount-and-on-filter-change pattern; `load` sets
    // loading state as its first synchronous action before the actual
    // async fetch runs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-semibold text-stone-900">Product catalog (live API consumer)</h1>
        <p className="mt-1 text-sm text-stone-500">
          Calling <code className="rounded bg-stone-200 px-1">{apiBase || "(same origin)"}/api/v1/products</code>
        </p>

        <div className="mt-4 flex items-center gap-2">
          <label htmlFor="category" className="text-sm text-stone-600">
            Category:
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-stone-300 px-2 py-1 text-sm"
          >
            <option value="">All</option>
            <option value="electronics">Electronics</option>
            <option value="home-and-kitchen">Home and Kitchen</option>
            <option value="books">Books</option>
            <option value="clothing">Clothing</option>
          </select>
          <span className="text-xs text-stone-400">{total} total</span>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        {!error && products.length === 0 && !loading && (
          <p className="mt-6 text-sm text-stone-500">No products found.</p>
        )}

        <ul className="mt-4 space-y-2">
          {products.map((p) => (
            <li key={p.id} className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-stone-900">{p.name}</p>
                <p className="text-sm text-stone-600">
                  ${(p.priceMinorUnits / 100).toFixed(2)} {p.currency}
                </p>
              </div>
              <p className="mt-1 text-xs text-stone-400">
                {p.category.name} • {p.stockQuantity} in stock
              </p>
            </li>
          ))}
        </ul>

        {nextCursor && (
          <button
            onClick={() => {
              load(nextCursor, false);
            }}
            disabled={loading}
            className="mt-4 rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
          >
            {loading ? "Loading…" : "Next page"}
          </button>
        )}
      </div>
    </main>
  );
}
