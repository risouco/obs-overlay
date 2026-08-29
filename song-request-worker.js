/*
 * 歌える曲リスト用 Cloudflare Worker（KV保存）
 * ------------------------------------------------------------
 * ■ できること
 *   GET  … 保存中の曲リスト(JSON)を返す（誰でも読める・songs.htmlが使う）
 *   POST … 曲リストを保存する（合言葉 X-Token が一致したときだけ・操作パネルが使う）
 *
 * ■ Cloudflare での設定（ダッシュボード・一度だけ）
 *   1) 左メニュー Storage & Databases → KV → Create a namespace
 *      名前は何でもOK（例: utawaku）
 *   2) Workers & Pages → Create → Worker → 名前を付けて Deploy（中身は後で差し替え）
 *   3) その Worker の「Edit code」でこのファイルの中身を全部貼り付け → Deploy
 *   4) Worker の Settings → Variables and Secrets → 「KV Namespace Bindings」
 *      Variable name: SONGS  /  KV namespace: 1)で作ったもの  → Save
 *   5) 下の WRITE_TOKEN を、自分だけが知る合言葉に書き換えて Deploy
 *   6) Worker のURL（https://xxxx.workers.dev）を控える
 *      → songs.html と 操作パネル にこのURLを設定
 * ------------------------------------------------------------
 */

const WRITE_TOKEN = "kaeru-goto-ni-kaeru";  // ← 好きな合言葉に変更（操作パネルにも同じものを入れる）
const KV_KEY = "list";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Token",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    if (request.method === "GET") {
      const data = (await env.SONGS.get(KV_KEY)) || '{"s":[]}';
      return new Response(data, {
        headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
      });
    }

    if (request.method === "POST") {
      const token = request.headers.get("X-Token") || "";
      if (token !== WRITE_TOKEN) {
        return new Response("forbidden", { status: 403, headers: CORS });
      }
      let body;
      try {
        body = await request.text();
        const parsed = JSON.parse(body);
        if (!parsed || !Array.isArray(parsed.s)) throw new Error("shape");
      } catch (e) {
        return new Response("bad json", { status: 400, headers: CORS });
      }
      await env.SONGS.put(KV_KEY, body);
      return new Response("ok", { headers: CORS });
    }

    return new Response("method not allowed", { status: 405, headers: CORS });
  },
};
