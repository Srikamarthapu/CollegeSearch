// Offset pagination must order by the complete unique key. A source ID alone
// repeats across thousands of college-source bindings and is not a stable order.
export async function readHostedRows(rest, table, columns, releaseId, keyColumns) {
  if (!keyColumns.length) throw new Error("Hosted pagination requires a unique key.");
  const pageSize = 500;
  const output = [];
  for (let offset = 0; ; offset += pageSize) {
    const query = {
      select: columns.map((column) => column.name).join(","),
      order: keyColumns.map((key) => `${key}.asc`).join(","),
      limit: String(pageSize),
      offset: String(offset),
    };
    if (releaseId) query.release_id = `eq.${releaseId}`;
    const page = await rest(table, { query });
    if (!Array.isArray(page) || page.length > pageSize) {
      throw new Error(`Hosted Supabase returned an invalid ${table} page.`);
    }
    output.push(...page);
    if (page.length < pageSize) return output;
  }
}
