export default async function handler(req, res) {
  try {
    const notionToken = process.env.NOTION_TOKEN;
    const databaseId = process.env.NOTION_DATABASE_ID;

    if (!notionToken || !databaseId) {
      return res.status(500).json({
        error: "Missing env vars",
        hasNotionToken: Boolean(notionToken),
        hasDatabaseId: Boolean(databaseId),
      });
    }

    const response = await fetch(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${notionToken}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          filter: {
            property: "Status",
            select: { equals: "Published" },
          },
          sorts: [
            { property: "Publish Date", direction: "descending" },
          ],
          page_size: 50,
        }),
      }
    );

    const data = await response.json();

    // 如果 Notion 返回错误（比如无权限），直接把错误吐出来
    if (!response.ok) {
      return res.status(response.status).json({
        error: "Notion API error",
        status: response.status,
        data,
      });
    }

    const safeGet = (obj, path, fallback = "") => {
      try {
        return path.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj) ?? fallback;
      } catch {
        return fallback;
      }
    };

    const posts = (data.results || []).map((page) => {
      const title =
        safeGet(page, ["properties", "Title", "title", 0, "plain_text"]) ||
        safeGet(page, ["properties", "名称", "title", 0, "plain_text"]) ||
        safeGet(page, ["properties", "Name", "title", 0, "plain_text"]) ||
        "";

      const slug =
        safeGet(page, ["properties", "Slug", "rich_text", 0, "plain_text"]) || "";

      const summary =
        safeGet(page, ["properties", "Summary", "rich_text", 0, "plain_text"]) || "";

      const coverFile = safeGet(page, ["properties", "Cover", "files", 0], null);
      const cover =
        (coverFile && coverFile.type === "file" && coverFile.file?.url) ||
        (coverFile && coverFile.type === "external" && coverFile.external?.url) ||
        "";

      const publishDate = safeGet(page, ["properties", "Publish Date", "date", "start"], null);

      return {
        id: page.id,
        title,
        slug,
        summary,
        cover,
        publishDate,
      };
    }).filter(p => p.slug); // 没 slug 的先不输出，避免详情页找不到

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ posts });
  } catch (e) {
    res.status(500).json({
      error: "Server error",
      message: e?.message || String(e),
    });
  }
}
