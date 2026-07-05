/**
 * TwitCasting 視聴数・配信時間プロキシ（Cloudflare Worker）
 * ------------------------------------------------------------
 * ブラウザ（OBSブラウザソース）から直接ツイキャスを叩くとCORSで弾かれるため、
 * この Worker が裏で streamchecker を取得し、CORS許可付きのJSONで返す。
 * ツイキャスの公式API登録は不要。
 *
 * 使い方: https://<あなたのworker>.workers.dev/?u=USERID
 *   USERID = 配信URL twitcasting.tv/○○○ の ○○○ 部分（c:xxxx もそのまま）
 *
 * 返すJSON:
 *   { live, viewers(視聴中), total(累計), max(最大), comments, elapsed(経過秒), title, movieId, ts }
 */
export default {
  async fetch(request) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Cache-Control": "no-store",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const u = (url.searchParams.get("u") || "").trim();
    if (!u) return json({ error: "ユーザーIDが未指定です（?u=xxx）" }, 400, cors);
    if (!/^[A-Za-z0-9_:]+$/.test(u)) return json({ error: "ユーザーIDの形式が不正です" }, 400, cors);

    try {
      const r = await fetch(
        `https://twitcasting.tv/streamchecker.php?u=${encodeURIComponent(u)}&v=999`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
            "Accept": "*/*",
          },
          cf: { cacheTtl: 0, cacheEverything: false },
        }
      );
      const text = await r.text();
      const f = text.split("\t");
      const movieId = (f[0] || "").trim();
      const live = movieId !== "" && movieId !== "0";
      const num = (i) => {
        const n = parseInt(f[i], 10);
        return isNaN(n) ? 0 : n;
      };
      let title = "";
      try {
        title = decodeURIComponent((f[7] || "").replace(/\+/g, " "));
      } catch (e) {
        title = f[7] || "";
      }

      return json(
        {
          user: u,
          live,
          movieId: live ? movieId : null,
          viewers: live ? num(3) : 0, // 視聴中（現在の閲覧者）
          total: live ? num(2) : 0,   // 累計視聴数
          max: live ? num(11) : 0,    // 最大同時視聴数
          comments: live ? num(5) : 0,
          elapsed: live ? num(6) : 0, // 配信経過時間（秒）
          title: live ? title : "",
          ts: Date.now(),
        },
        200,
        cors
      );
    } catch (e) {
      return json({ error: "ツイキャス取得に失敗しました", detail: String(e) }, 502, cors);
    }
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
  });
}
