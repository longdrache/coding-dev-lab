const [token, url, secret, base = "https://bot-api.zaloplatforms.com"] = process.argv.slice(2);
const r = await fetch(`${base}/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url, secret_token: secret }),
});
console.log(r.status, await r.text());