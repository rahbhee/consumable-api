// Cursor pagination, keyed on (sortField, id) as a compound tiebreaker --
// id alone isn't enough once results are sorted by something other than
// id (e.g. price), because two rows can tie on price; id breaks the tie
// deterministically so no row is ever skipped or repeated across pages.
//
// Chosen over offset pagination for the main "excellent"-track reason the
// brief names: offset pagination re-scans and discards N rows on every
// page (page 50 at limit 20 still has the database walk through and throw
// away the first 980 rows), which gets slower the deeper a client pages.
// A cursor jumps straight to "after this row" via the index, with no
// discarded work, regardless of how deep the page is. The real cost: a
// cursor can't jump to an arbitrary page number ("show me page 7"),  only
// "next" and "previous" from where you are -- offset can do the former,
// cursor pagination structurally cannot. This API is browse-forward by
// design (a product list, an order history), where that limitation costs
// nothing; a jump-to-page-N admin table would be a real reason to prefer
// offset instead. See README "Design decisions" for the full writeup.

type Cursor = { sortValue: string | number; id: string };

export function encodeCursor(sortValue: string | number, id: string): string {
  return Buffer.from(JSON.stringify({ sortValue, id })).toString("base64url");
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "id" in parsed &&
      "sortValue" in parsed &&
      typeof parsed.id === "string"
    ) {
      return parsed as Cursor;
    }
    return null;
  } catch {
    return null;
  }
}

// Builds the keyset WHERE fragment for "rows after this cursor," given
// which field is being sorted on and in which direction. Returned as a
// plain object matching Prisma's WhereInput shape at runtime; the sort
// field name is dynamic (whatever the caller is sorting by), so this is
// intentionally typed loosely rather than against one resource's exact
// schema type -- each route casts the result to its own WhereInput type.
export function buildCursorWhere(
  sortField: string,
  order: "asc" | "desc",
  cursor: Cursor
): Record<string, unknown> {
  const comparator = order === "desc" ? "lt" : "gt";
  return {
    OR: [
      { [sortField]: { [comparator]: cursor.sortValue } },
      {
        AND: [{ [sortField]: cursor.sortValue }, { id: { [comparator]: cursor.id } }],
      },
    ],
  };
}
