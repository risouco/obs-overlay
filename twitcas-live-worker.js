/**
 * TwitCasting ライブ手元ドック用 Worker
 * 環境変数: TW_TOKEN(アクセストークン) / TW_USER(自分のツイキャスID = @の後ろ)
 * 視聴数は公式 current_live API から正確に取得。ギフトは生データのまま返す（取りこぼし防止）。
 * デバッグ: ?debug=1 で生レスポンスも返す
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
    const debug = url.searchParams.get("debug") === "1";
    const api = { "X-Api-Version": "2.0", "Authorization": "Bearer " + token };

    // 1) current_live で movie_id と正確な視聴数
    let live = false, viewers = 0, total = 0, max = 0, elapsed = 0, title = "", movieId = "";
    let rawCL = null;
    try {
      const clr = await fetch("https://apiv2.twitcasting.tv/users/" + encodeURIComponent(user) + "/current_live", { headers: api });
      if (clr.ok) {
        const cl = await clr.json(); rawCL = cl;
        const m = cl.movie || {};
        live = !!m.is_live;
        movieId = m.id || "";
        viewers = m.current_view_count || 0;
        total   = m.total_view_count || 0;
        max     = m.max_view_count || 0;
        elapsed = m.duration || 0;
        title   = m.title || "";
      }
      // 404 = 配信していない → live=false のまま
    } catch (e) {}

    let comments = [], gifts = [], newC = cSlice, newG = gSlice, rawC = null;
    if (live && movieId) {
      // コメント（新しい順）
      try {
        let cu = "https://apiv2.twitcasting.tv/movies/" + encodeURIComponent(movieId) + "/comments?limit=30";
        if (cSlice) cu += "&slice_id=" + encodeURIComponent(cSlice);
        const cr = await fetch(cu, { headers: api });
        if (cr.ok) {
          const cj = await cr.json(); rawC = cj;
          comments = (cj.comments || []).map(c => ({
            id: c.id,
            message: c.message || "",
            name: (c.from_user && (c.from_user.name || c.from_user.screen_id)) || "",
            image: (c.from_user && c.from_user.image) || "",
          }));
          if (comments.length) newC = comments[0].id;
        }
      } catch (e) {}
      // ギフト（生データのまま返す→ドックで頑丈に抽出）
      try {
        let gu = "https://apiv2.twitcasting.tv/gifts";
        if (gSlice) gu += "?slice_id=" + encodeURIComponent(gSlice);
        const gr = await fetch(gu, { headers: api });
        if (gr.ok) {
          const gj = await gr.json();
          gifts = gj.gifts || [];
          if (gj.slice_id != null) newG = String(gj.slice_id);
        }
      } catch (e) {}
    }

    const out = { live, viewers, total, max, elapsed, title, comments, gifts, c: newC, g: newG };
    if (debug) { out._rawCurrentLive = rawCL; out._rawComments = rawC; }
    return j(out, 200, cors);
  },
};

function j(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });
}
