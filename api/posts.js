export default async function handler(req, res) {
  const notionToken = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;

  const response = await fetch(
    `https://api.notion.com/v1/databases/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionToken}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
      }
    }
  );

  const data = await response.json();

  const posts = data.results.map((page) => {
    return {
      id: page.id,
      title: page.properties.Title.title[0]?.plain_text || "",
      slug: page.properties.Slug.rich_text[0]?.plain_text || "",
      summary: page.properties.Summary.rich_text[0]?.plain_text || "",
      cover:
        page.properties.Cover.files[0]?.file?.url ||
        page.properties.Cover.files[0]?.external?.url ||
        ""
    };
  });

  res.status(200).json(posts);
}
