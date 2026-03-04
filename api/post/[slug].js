export default async function handler(req, res) {
  try {
    const notionToken = process.env.NOTION_TOKEN;
    const databaseId = process.env.NOTION_DATABASE_ID;

    if (!notionToken || !databaseId) {
      return res.status(500).json({ error: "Missing NOTION_TOKEN or NOTION_DATABASE_ID" });
    }

    const { slug } = req.query;
    const slugStr = Array.isArray(slug) ? slug[0] : slug;
    const normalizedSlug = (slugStr || "").trim();

    if (!normalizedSlug) {
      return res.status(400).json({ error: "Missing slug" });
    }

    // 1) Query the database to find the page by Slug (and Published status)
    const queryResp = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionToken}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        filter: {
          and: [
            { property: "Status", select: { equals: "Published" } },
            { property: "Slug", rich_text: { equals: normalizedSlug } },
          ],
        },
        page_size: 1,
      }),
    });

    const queryData = await queryResp.json();

    if (!queryResp.ok) {
      return res.status(queryResp.status).json({
        error: "Notion API error",
        status: queryResp.status,
        data: queryData,
      });
    }

    const page = (queryData.results || [])[0];
    if (!page) {
      return res.status(404).json({ error: "Post not found", slug: normalizedSlug });
    }

    const pageId = page.id;

    // 2) Fetch page blocks (content)
    const blocksResp = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${notionToken}`,
        "Notion-Version": "2022-06-28",
      },
    });

    const blocksData = await blocksResp.json();

    if (!blocksResp.ok) {
      return res.status(blocksResp.status).json({
        error: "Notion blocks error",
        status: blocksResp.status,
        data: blocksData,
      });
    }

    // Helper: extract plain text from Notion rich text array
    const richTextToPlain = (arr) => (arr || []).map((t) => t.plain_text || "").join("");

    // Basic block-to-text (simple, good enough to start)
    const blocks = blocksData.results || [];
    const content = blocks
      .map((b) => {
        const type = b.type;
        const data = b[type];
        if (!data) return "";

        // text-based blocks
        if (data.rich_text) return richTextToPlain(data.rich_text);
        if (data.text) return richTextToPlain(data.text);

        // headings
        if (type.startsWith("heading_") && data.rich_text) return richTextToPlain(data.rich_text);

        // lists
        if ((type === "bulleted_list_item" || type === "numbered_list_item") && data.rich_text) {
          const prefix = type === "bulleted_list_item" ? "• " : "1. ";
          return prefix + richTextToPlain(data.rich_text);
        }

        // paragraph
        if (type === "paragraph" && data.rich_text) return richTextToPlain(data.rich_text);

        return "";
      })
      .filter(Boolean)
      .join("\n\n");

    // Meta fields from page properties
    const props = page.properties || {};
    const title =
      (props.Title?.title && richTextToPlain(props.Title.title)) ||
      (props.Name?.title && richTextToPlain(props.Name.title)) ||
      "";

    const summary = props.Summary?.rich_text ? richTextToPlain(props.Summary.rich_text) : "";
    const publishDate = props["Publish Date"]?.date?.start || "";

    const cover =
      props.Cover?.files?.[0]?.file?.url ||
      props.Cover?.files?.[0]?.external?.url ||
      "";

    // Return final post payload
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({
      id: pageId,
      title,
      slug: normalizedSlug,
      summary,
      cover,
      publishDate,
      content,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      message: err?.message || String(err),
    });
  }
}
