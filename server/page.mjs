// The passcode page: self-contained (inline CSS, no external requests).

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CSS = `
:root{--bg:#f6f7f9;--card:#fff;--ink:#1c2230;--muted:#5d6678;--line:#d6dbe4;--accent:#2f6fed;--accent-ink:#fff;--err:#b3261e;--err-bg:#fdecea;--shadow:0 1px 2px rgba(20,30,50,.06),0 8px 28px rgba(20,30,50,.08)}
@media (prefers-color-scheme:dark){:root{--bg:#0f131a;--card:#181e29;--ink:#e8ebf2;--muted:#9aa3b5;--line:#2c3547;--accent:#6b9bff;--accent-ink:#0b1220;--err:#ffb4ab;--err-bg:#3a1a1a;--shadow:0 1px 2px rgba(0,0,0,.4),0 8px 28px rgba(0,0,0,.45)}}
*{box-sizing:border-box}
html{color-scheme:light dark}
body{margin:0;min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:16px;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
main{width:100%;max-width:380px;background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);padding:28px 24px}
.mark{display:block;width:48px;height:48px;margin:0 0 16px;color:var(--accent)}
h1{margin:0 0 4px;font-size:1.5rem;line-height:1.25;letter-spacing:-.01em}
p{margin:0 0 20px;color:var(--muted)}
label{display:block;margin:0 0 6px;font-weight:600;font-size:.9rem}
input[type=password]{width:100%;font:inherit;padding:12px 14px;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:10px}
input[type=password]:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:var(--accent)}
button{width:100%;margin-top:16px;font:inherit;font-weight:600;padding:12px 14px;border:0;border-radius:10px;background:var(--accent);color:var(--accent-ink);cursor:pointer;min-height:44px}
button:hover{filter:brightness(1.06)}
button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.error{margin:0 0 16px;padding:10px 12px;border-radius:10px;background:var(--err-bg);color:var(--err);font-size:.95rem}
`;

/**
 * @param {{ error?: string, next?: string }} options
 *   error: plain message to show above the field; next: safe relative path to return to.
 */
export function renderLoginPage({ error = "", next = "/" } = {}) {
  const errorHtml = error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : "";
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<title>House Modeler</title>
<style>${CSS}</style>
</head>
<body>
<main>
<svg class="mark" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 23 24 8l18 15"/><path d="M11 20v20h26V20"/><path d="M20 40V28h8v12"/></svg>
<h1>House Modeler</h1>
<p>Enter the passcode to continue.</p>
${errorHtml}
<form method="post" action="/login">
<input type="hidden" name="next" value="${escapeHtml(next)}">
<label for="passcode">Passcode</label>
<input id="passcode" name="passcode" type="password" autocomplete="current-password" autofocus required>
<button type="submit">Continue</button>
</form>
</main>
</body>
</html>
`;
}
