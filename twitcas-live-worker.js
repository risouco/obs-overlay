/**
 * TwitCasting ライブ手元ドック用 Worker
 * - 環境変数（Cloudflareの「変数とシークレット」で設定）:
 *     TW_TOKEN : ツイキャスのアクセストークン（tw-auth.htmlで取得）※シークレット推奨
 *     TW_USER  : 自分のツイキャスのユーザーID（screen_id / URLの @のあとの部分）
 * - 動作: streamcheckerで現在のmovie_idと視聴数を取得 → コメント/ギフトをAPI v2で取得 → CORS付きJSONで返す
 * - ドックは ?c=<前回コメントslice> & g=<前回ギフトslice> を付けて増分取得
 */
export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const token = env.TW_TOKEN, user = env.TW_USER;
    if (!token || !user) {
      return j({ error: "TW_TOKEN / TW_USER が未設定です（Cloudflareの変数）" }, 500, cors);
    }

    const url = new URL(request.url);
    const cSlice = url.searchParams.get("c") || "";
    const gSlice = url.searchParams.get("g") || "";

    // 1) streamchecker: movie_id と視聴数・経過時間・タイトル
    let live = false, viewers = 0, total = 0, max = 0, elapsed = 0, title = "", movieId = "";
    try {
      const sc = await fetch("https://twitcasting.tv/streamchecker.php?u=" + encodeURIComponent(user) + "&v=999");
      const f = (await sc.text()).split("\t");
      movieId = f[0] || "";
      live = !!movieId && movieId !== "0";
      total   = parseInt(f[2] || "0", 10) || 0;
      viewers = parseInt(f[3] || "0", 10) || 0;
      elapsed = parseInt(f[6] || "0", 10) || 0;
      max     = parseInt(f[11] || "0", 10) || 0;
      try { title = decodeURIComponent((f[7] || "").replace(/\+/g, " ")); } catch (e) { title = f[7] || ""; }
    } catch (e) {}

    let comments = [], gifts = [], newC = cSlice, newG = gSlice;
    if (live) {
      const api = { "X-Api-Version": "2.0", "Authorization": "Bearer " + token };
      // コメント（新しい順で返る）
      try {
        let cu = "https://apiv2.twitcasting.tv/movies/" + encodeURIComponent(movieId) + "/comments?limit=30";
        if (cSlice) cu += "&slice_id=" + encodeURIComponent(cSlice);
        const cr = await fetch(cu, { headers: api });
        if (cr.ok) {
          const cj = await cr.json();
          comments = (cj.comments || []).map(c => ({
            id: c.id,
            message: c.message || "",
            name: (c.from_user && (c.from_user.name || c.from_user.screen_id)) || "",
            screen: (c.from_user && c.from_user.screen_id) || "",
            image: (c.from_user && c.from_user.image) || "",
            created: c.created || 0,
          }));
          if (comments.length) newC = comments[0].id; // 先頭が最新
        }
      } catch (e) {}
      // ギフト/アイテム
      try {
        let gu = "https://apiv2.twitcasting.tv/gifts";
        if (gSlice) gu += "?slice_id=" + encodeURIComponent(gSlice);
        const gr = await fetch(gu, { headers: api });
        if (gr.ok) {
          const gj = await gr.json();
          gifts = (gj.gifts || []).map(g => ({
            id: g.id,
            message: g.message || "",
            itemName: g.item_name || "",
            itemImage: g.item_image || "",
            name: g.user_screen_name || g.user_name || "",
            screen: g.user_screen_id || "",
            userImage: g.user_image || "",
          }));
          if (gj.slice_id != null) newG = String(gj.slice_id);
        }
      } catch (e) {}
    }

    return j({ live, viewers, total, max, elapsed, title, comments, gifts, c: newC, g: newG }, 200, cors);
  },
};

function j(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });
}
