/*
 * 歌える曲リスト＋雑談お便り用 Cloudflare Worker（KV保存）
 * ------------------------------------------------------------
 * ■ できること
 *   GET  /            … 保存中の曲リスト(JSON)を返す（songs.htmlが使う）
 *   POST /            … 曲リストを保存（合言葉 X-Token 必須・操作パネルが使う）
 *   GET  /zatsu       … 雑談の参加/お便りイベント一覧(JSON配列)を返す（手元ドックが使う）
 *   POST /zatsu       … 参加/お便りを1件追加（誰でも・zatsudan.htmlが使う）
 *   POST /zatsu/clear … イベントを消す（X-Token必須。body {ids:[...]} で個別、無指定で全消し）
 *
 * ■ Cloudflare 設定は従来どおり（KV binding名 SONGS）。雑談は同じKVを別キーで使うので追加設定なし。
 * ------------------------------------------------------------
 */

const WRITE_TOKEN = "kaeru-goto-ni-kaeru";  // ← 好きな合言葉に（操作パネルにも同じもの）
const KV_KEY = "list";
const ZATSU_KEY = "zatsu";
const ZATSU_MAX = 120;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Token",
};

function json(data) {
  return new Response(data, { headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const path = (url.pathname.replace(/\/+$/, "") || "/");

    // ===== 雑談：お題（ドックで公開したものをリスナーページが読む）=====
    if (path === "/zatsu/topics") {
      if (request.method === "GET") {
        return json((await env.SONGS.get("zatsu-topics")) || "[]");
      }
      if (request.method === "POST") {
        if ((request.headers.get("X-Token") || "") !== WRITE_TOKEN) {
          return new Response("forbidden", { status: 403, headers: CORS });
        }
        let arr;
        try {
          const b = JSON.parse(await request.text());
          arr = Array.isArray(b.topics) ? b.topics : [];
        } catch (e) { return new Response("bad json", { status: 400, headers: CORS }); }
        arr = arr.slice(0, 20)
          .map((t) => ({ id: String(t.id || "").slice(0, 40), text: String(t.text || "").slice(0, 120) }))
          .filter((t) => t.text);
        await env.SONGS.put("zatsu-topics", JSON.stringify(arr));
        return new Response("ok", { headers: CORS });
      }
      return new Response("method not allowed", { status: 405, headers: CORS });
    }

    // ===== 雑談：ワンタップ参加 / お便り =====
    if (path === "/zatsu") {
      if (request.method === "GET") {
        return json((await env.SONGS.get(ZATSU_KEY)) || "[]");
      }
      if (request.method === "POST") {
        let ev;
        try {
          const b = JSON.parse(await request.text());
          const type = b.type === "otayori" ? "otayori" : "tap";
          ev = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            t: Date.now(),
            type,
            label: String(b.label || "").slice(0, 40),
            name: String(b.name || "").slice(0, 40),
            text: String(b.text || "").slice(0, 600),
            topic: String(b.topic || "").slice(0, 80),
          };
          if (type === "tap" && !ev.label) throw new Error("empty");
          if (type === "otayori" && !ev.text) throw new Error("empty");
        } catch (e) {
          return new Response("bad json", { status: 400, headers: CORS });
        }
        const cur = JSON.parse((await env.SONGS.get(ZATSU_KEY)) || "[]");
        cur.push(ev);
        while (cur.length > ZATSU_MAX) cur.shift();
        await env.SONGS.put(ZATSU_KEY, JSON.stringify(cur));
        return new Response("ok", { headers: CORS });
      }
      return new Response("method not allowed", { status: 405, headers: CORS });
    }

    if (path === "/zatsu/clear" && request.method === "POST") {
      if ((request.headers.get("X-Token") || "") !== WRITE_TOKEN) {
        return new Response("forbidden", { status: 403, headers: CORS });
      }
      let ids = null;
      try { const b = JSON.parse(await request.text()); if (Array.isArray(b.ids)) ids = b.ids; } catch (e) {}
      if (ids) {
        const cur = JSON.parse((await env.SONGS.get(ZATSU_KEY)) || "[]").filter((e) => ids.indexOf(e.id) < 0);
        await env.SONGS.put(ZATSU_KEY, JSON.stringify(cur));
      } else {
        await env.SONGS.put(ZATSU_KEY, "[]");
      }
      return new Response("ok", { headers: CORS });
    }

    // ===== 既存：曲リスト（ルート）=====
    if (request.method === "GET") {
      const data = (await env.SONGS.get(KV_KEY)) || '{"s":[]}';
      return new Response(data, { headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
    }

    if (request.method === "POST") {
      const token = request.headers.get("X-Token") || "";
      if (token !== WRITE_TOKEN) return new Response("forbidden", { status: 403, headers: CORS });
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
